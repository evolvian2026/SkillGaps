import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { eq } from "drizzle-orm";
import { withRequestContext } from "@/lib/db/client";
import {
  interviewResponses,
  interviewSessions,
  resumeMatches,
  resumes,
} from "@/lib/db/schema";
import { loadInterview, loadInterviewFeedback, startInterview } from "@/lib/interview/session";
import { evaluateInterview } from "@/worker/jobs/evaluate-interview";
import { matchResumeJob } from "@/worker/jobs/documents";
import { recomputeFor } from "@/worker/jobs/readiness";
import type { SessionUser } from "@/lib/auth/types";

/**
 * End-to-end exercise of the Phase 2 features against a real database:
 * interview -> evaluation -> feedback, resume+JD -> match, and both feeding
 * the readiness composite.
 *
 * The parser and Anthropic services are not called: extracted skills are
 * written directly, and EVALUATION_METHOD is pinned to the rubric, so the test
 * stays hermetic and free.
 */

let owner: Client;
let student: SessionUser;
let tenantId: string;
let trackId: string;

beforeAll(async () => {
  process.env.EVALUATION_METHOD = "rubric";

  owner = new Client({
    connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
  });
  await owner.connect();

  const { rows: t } = await owner.query<{ id: string }>(
    `INSERT INTO tenants (name, slug, email_domains, invite_code)
     VALUES ('P2 Flow','p2flow','{p2flow.edu}','P2FLOW') RETURNING id`,
  );
  tenantId = t[0].id;

  const { rows: u } = await owner.query<{ id: string }>(
    `INSERT INTO users (tenant_id, email, full_name, role)
     VALUES ($1,'flow@p2flow.edu','Flow Student','student') RETURNING id`,
    [tenantId],
  );
  student = {
    userId: u[0].id,
    tenantId,
    role: "student",
    email: "flow@p2flow.edu",
    fullName: "Flow Student",
  };

  const { rows: tr } = await owner.query<{ id: string }>(
    "SELECT id FROM tracks WHERE code = 'SDE'",
  );
  trackId = tr[0].id;
});

afterAll(async () => {
  await owner.query("DELETE FROM tenants WHERE slug = 'p2flow'");
  await owner.end();
});

const GOOD_ANSWER = `Our college fest registration site started timing out on the morning
tickets opened. Every page load ran a count query over the whole registrations table, which
had grown past 40,000 rows.

First I reproduced it locally with the same data volume. Then I added logging and found the
query took 3.2 seconds. I decided to add an index on event_id and cache the count in Redis
with a 30 second TTL.

As a result response time dropped to about 90 milliseconds and we handled 1,200 concurrent
users without another outage. In the end I learned to load-test with realistic volumes.`;

describe("mock interview", () => {
  let sessionId: string;

  it("assembles a session from the shared question bank", async () => {
    sessionId = await withRequestContext(student, (tx) =>
      startInterview(tx, student, trackId),
    );
    const questions = await withRequestContext(student, (tx) =>
      loadInterview(tx, sessionId),
    );

    expect(questions.length).toBeGreaterThanOrEqual(4);
    // Behavioural first, then technical, then situational.
    const kinds = questions.map((q) => q.kind);
    expect(kinds[0]).toBe("behavioral");
    expect(new Set(kinds).size).toBeGreaterThan(1);
  });

  it("never sends guidance or rubric criteria before the student answers", async () => {
    const questions = await withRequestContext(student, (tx) =>
      loadInterview(tx, sessionId),
    );
    const serialised = JSON.stringify(questions);
    expect(serialised).not.toContain("guidance");
    expect(serialised).not.toContain("rubricCriteria");
    expect(serialised).not.toContain("rubric_criteria");
  });

  it("resumes an in-progress session rather than starting a second", async () => {
    const again = await withRequestContext(student, (tx) =>
      startInterview(tx, student, trackId),
    );
    expect(again).toBe(sessionId);
  });

  it("evaluates every response and writes an audit row for each", async () => {
    const questions = await withRequestContext(student, (tx) =>
      loadInterview(tx, sessionId),
    );

    await withRequestContext(student, async (tx) => {
      for (const q of questions) {
        await tx
          .update(interviewResponses)
          .set({ responseText: GOOD_ANSWER })
          .where(eq(interviewResponses.id, q.responseId));
      }
      await tx
        .update(interviewSessions)
        .set({ status: "submitted", submittedAt: new Date() })
        .where(eq(interviewSessions.id, sessionId));
    });

    await evaluateInterview({
      name: "evaluate-interview",
      userId: student.userId,
      sessionId,
    });

    const feedback = await withRequestContext(student, (tx) =>
      loadInterviewFeedback(tx, sessionId),
    );

    expect(feedback!.status).toBe("evaluated");
    expect(feedback!.overallScore).toBeGreaterThan(0);
    expect(feedback!.evaluationMethod).toBe("rubric");
    expect(feedback!.responses.every((r) => r.score !== null)).toBe(true);

    // One audit row per response — an unlogged evaluation is one that cannot
    // be re-run or defended.
    const { rows } = await owner.query<{ count: string }>(
      `SELECT COUNT(*) FROM ai_evaluations
       WHERE tenant_id = $1 AND subject_type = 'interview_response'`,
      [tenantId],
    );
    expect(Number(rows[0].count)).toBe(questions.length);
  });

  it("is idempotent: re-running evaluation does not change the score", async () => {
    const before = await withRequestContext(student, (tx) =>
      loadInterviewFeedback(tx, sessionId),
    );
    await evaluateInterview({
      name: "evaluate-interview",
      userId: student.userId,
      sessionId,
    });
    const after = await withRequestContext(student, (tx) =>
      loadInterviewFeedback(tx, sessionId),
    );
    expect(after!.overallScore).toBe(before!.overallScore);
  });

  it("shows guidance on the feedback page, after the fact", async () => {
    const feedback = await withRequestContext(student, (tx) =>
      loadInterviewFeedback(tx, sessionId),
    );
    expect(feedback!.responses.some((r) => r.guidance)).toBe(true);
  });
});

describe("resume vs job description", () => {
  let matchId: string;

  beforeAll(async () => {
    // Skills as the parser service would have written them.
    const resumeSkills = [
      { skill: "Python", skillArea: "PROG", weight: 5, occurrences: 3, required: false },
      { skill: "SQL", skillArea: "SQL", weight: 5, occurrences: 2, required: false },
      { skill: "Docker", skillArea: "CS_CORE", weight: 3, occurrences: 1, required: false },
    ];
    const jdSkills = [
      { skill: "Python", skillArea: "PROG", weight: 5, occurrences: 1, required: true },
      { skill: "SQL", skillArea: "SQL", weight: 5, occurrences: 1, required: true },
      { skill: "Statistics", skillArea: "STATS", weight: 4, occurrences: 1, required: true },
      { skill: "Power BI", skillArea: "PY_DATA", weight: 3, occurrences: 1, required: false },
    ];

    const { rows: r } = await owner.query<{ id: string }>(
      `INSERT INTO resumes
         (tenant_id, user_id, file_name, content_type, size_bytes, storage_key,
          status, extracted_skills, retain_until)
       VALUES ($1,$2,'cv.pdf','application/pdf',2048,'k/flow','parsed',$3,
               now() + interval '180 days')
       RETURNING id`,
      [tenantId, student.userId, JSON.stringify(resumeSkills)],
    );
    const { rows: j } = await owner.query<{ id: string }>(
      `INSERT INTO job_descriptions
         (tenant_id, created_by, title, raw_text, status, extracted_keywords)
       VALUES ($1,$2,'Data Analyst','jd text','parsed',$3) RETURNING id`,
      [tenantId, student.userId, JSON.stringify(jdSkills)],
    );
    const { rows: m } = await owner.query<{ id: string }>(
      `INSERT INTO resume_matches (tenant_id, user_id, resume_id, job_description_id)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [tenantId, student.userId, r[0].id, j[0].id],
    );
    matchId = m[0].id;
  });

  it("computes coverage and lists the gaps", async () => {
    await matchResumeJob({ name: "match-resume", userId: student.userId, matchId });

    const [match] = await withRequestContext(student, (tx) =>
      tx.select().from(resumeMatches).where(eq(resumeMatches.id, matchId)),
    );

    expect(match.status).toBe("succeeded");
    expect(Number(match.matchScore)).toBeGreaterThan(0);

    const missing = match.missingKeywords as { skill: string; required: boolean }[];
    expect(missing.map((m) => m.skill)).toContain("Statistics");
    // Required gaps rank above nice-to-haves.
    expect(missing[0].required).toBe(true);

    const matched = match.matchedKeywords as { extras: string[] };
    expect(matched.extras).toContain("Docker");
  });

  it("does not rewrite or store a modified resume", async () => {
    // The platform highlights gaps; it must never edit the student's document.
    const [resume] = await withRequestContext(student, (tx) =>
      tx.select().from(resumes).where(eq(resumes.userId, student.userId)),
    );
    expect(resume.fileName).toBe("cv.pdf");
    expect(resume.extractedText).toBeNull();
  });
});

describe("placement readiness", () => {
  it("combines the components a student actually has", async () => {
    await owner.query(
      `INSERT INTO attempts
         (tenant_id, user_id, track_id, status, submitted_at, expires_at,
          duration_seconds, percent)
       VALUES ($1,$2,$3,'submitted', now(), now() + interval '1 hour', 2700, 72)`,
      [tenantId, student.userId, trackId],
    );

    await withRequestContext(student, (tx) =>
      recomputeFor(tx, tenantId, student.userId),
    );

    const { rows } = await owner.query<{
      score: string;
      components_present: number;
      diagnostic_percent: string | null;
      interview_percent: string | null;
      resume_match_percent: string | null;
    }>("SELECT * FROM readiness_scores WHERE user_id = $1", [student.userId]);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.components_present).toBe(3);
    expect(Number(row.diagnostic_percent)).toBe(72);
    expect(Number(row.interview_percent)).toBeGreaterThan(0);
    expect(Number(row.resume_match_percent)).toBeGreaterThan(0);
    expect(Number(row.score)).toBeGreaterThan(0);
    expect(Number(row.score)).toBeLessThanOrEqual(100);
  });

  it("records the weights it used, so a score can be explained later", async () => {
    const { rows } = await owner.query<{ weights_used: Record<string, number> }>(
      "SELECT weights_used FROM readiness_scores WHERE user_id = $1",
      [student.userId],
    );
    const weights = rows[0].weights_used;
    expect(weights.diagnostic).toBeGreaterThan(0);
    expect(
      weights.diagnostic + weights.interview + weights.resume,
    ).toBeCloseTo(1, 1);
  });

  it("is idempotent — recomputing does not duplicate the row", async () => {
    await withRequestContext(student, (tx) =>
      recomputeFor(tx, tenantId, student.userId),
    );
    const { rows } = await owner.query(
      "SELECT id FROM readiness_scores WHERE user_id = $1",
      [student.userId],
    );
    expect(rows).toHaveLength(1);
  });
});
