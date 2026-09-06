import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { eq } from "drizzle-orm";
import { withRequestContext } from "@/lib/db/client";
import { answers, attemptQuestions } from "@/lib/db/schema";
import { loadPaper, startAttempt } from "@/lib/assessment/paper";
import { submitAttempt } from "@/lib/assessment/submit";
import { loadAttemptReport, loadTrend } from "@/lib/assessment/report";
import { loadCohortSummary, loadSkillAreaAggregates } from "@/lib/admin/cohort";
import type { SessionUser } from "@/lib/auth/types";

/**
 * End-to-end exercise of the Phase 1 loop against a real database: start an
 * attempt, answer it, submit, read the report, and see it appear in the
 * institution dashboard aggregates.
 */

let owner: Client;
let student: SessionUser;
let staff: SessionUser;
let trackId: string;
let tenantId: string;

beforeAll(async () => {
  owner = new Client({
    connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
  });
  await owner.connect();

  const { rows: tenantRows } = await owner.query<{ id: string }>(
    `INSERT INTO tenants (name, slug, email_domains, invite_code)
     VALUES ('Flow Test College','flowtest','{flowtest.edu}','FLOWTEST') RETURNING id`,
  );
  tenantId = tenantRows[0].id;

  const { rows: studentRows } = await owner.query<{ id: string }>(
    `INSERT INTO users (tenant_id, email, full_name, role)
     VALUES ($1,'flow.student@flowtest.edu','Flow Student','student') RETURNING id`,
    [tenantId],
  );
  const { rows: staffRows } = await owner.query<{ id: string }>(
    `INSERT INTO users (tenant_id, email, full_name, role)
     VALUES ($1,'flow.tpo@flowtest.edu','Flow TPO','admin') RETURNING id`,
    [tenantId],
  );
  await owner.query(
    `INSERT INTO student_profiles (user_id, tenant_id, branch, section, batch_year)
     VALUES ($1,$2,'CSE','A',2026)`,
    [studentRows[0].id, tenantId],
  );

  student = {
    userId: studentRows[0].id,
    tenantId,
    role: "student",
    email: "flow.student@flowtest.edu",
    fullName: "Flow Student",
  };
  staff = {
    userId: staffRows[0].id,
    tenantId,
    role: "admin",
    email: "flow.tpo@flowtest.edu",
    fullName: "Flow TPO",
  };

  const { rows: trackRows } = await owner.query<{ id: string }>(
    "SELECT id FROM tracks WHERE code = 'DA'",
  );
  trackId = trackRows[0].id;
});

afterAll(async () => {
  await owner.query("DELETE FROM tenants WHERE slug = 'flowtest'");
  await owner.end();
});

describe("the Phase 1 assessment loop", () => {
  let attemptId: string;

  it("assembles a paper matching the track blueprint", async () => {
    attemptId = await withRequestContext(student, (tx) =>
      startAttempt(tx, student, trackId),
    );
    const paper = await withRequestContext(student, (tx) => loadPaper(tx, attemptId));

    // The Data Analyst blueprint asks for 6 SQL + 4 Python + 4 stats + 2 aptitude.
    expect(paper).toHaveLength(16);
    expect(paper.map((q) => q.position)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1),
    );
  });

  it("never sends the answer key to the client", async () => {
    const paper = await withRequestContext(student, (tx) => loadPaper(tx, attemptId));
    const serialised = JSON.stringify(paper);
    expect(serialised).not.toContain("isCorrect");
    expect(serialised).not.toContain("is_correct");
    expect(serialised).not.toContain("expectedStdout");
    expect(serialised).not.toContain("explanation");
  });

  it("resumes an in-progress attempt instead of starting a second one", async () => {
    const again = await withRequestContext(student, (tx) =>
      startAttempt(tx, student, trackId),
    );
    expect(again).toBe(attemptId);
  });

  it("randomises the paper between attempts", async () => {
    // A second student on the same track should not receive the same order.
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, full_name, role)
       VALUES ($1,'flow.other@flowtest.edu','Other','student') RETURNING id`,
      [tenantId],
    );
    const other: SessionUser = { ...student, userId: rows[0].id };
    const otherAttempt = await withRequestContext(other, (tx) =>
      startAttempt(tx, other, trackId),
    );

    const a = await withRequestContext(student, (tx) => loadPaper(tx, attemptId));
    const b = await withRequestContext(other, (tx) => loadPaper(tx, otherAttempt));
    const orderA = a.map((q) => q.prompt).join("|");
    const orderB = b.map((q) => q.prompt).join("|");
    expect(orderA).not.toBe(orderB);
  });

  it("grades every correct answer and scores each skill area", async () => {
    // Answer every MCQ correctly by reading the key as the owner.
    const rows = await withRequestContext(student, (tx) =>
      tx
        .select({
          attemptQuestionId: attemptQuestions.id,
          questionId: attemptQuestions.questionId,
        })
        .from(attemptQuestions)
        .where(eq(attemptQuestions.attemptId, attemptId)),
    );

    for (const row of rows) {
      const { rows: key } = await owner.query<{ id: string }>(
        "SELECT id FROM question_options WHERE question_id = $1 AND is_correct",
        [row.questionId],
      );
      if (key.length === 0) continue; // short/code question
      await withRequestContext(student, (tx) =>
        tx.insert(answers).values({
          tenantId,
          attemptQuestionId: row.attemptQuestionId,
          selectedOptionId: key[0].id,
        }),
      );
    }

    await withRequestContext(student, (tx) => submitAttempt(tx, attemptId));

    const report = await withRequestContext(student, (tx) =>
      loadAttemptReport(tx, attemptId),
    );
    expect(report).not.toBeNull();
    expect(report!.status).toBe("submitted");
    expect(report!.percent).toBeGreaterThan(0);
    expect(report!.areas.length).toBeGreaterThan(0);
    // Every area carries the provisional hiring bar it was scored against.
    expect(report!.areas.every((a) => a.hiringBarPercent !== null)).toBe(true);
    expect(report!.benchmarkIsProvisional).toBe(true);
  });

  it("does not rescore an already-submitted attempt", async () => {
    const before = await withRequestContext(student, (tx) =>
      loadAttemptReport(tx, attemptId),
    );
    const result = await withRequestContext(student, (tx) =>
      submitAttempt(tx, attemptId),
    );
    const after = await withRequestContext(student, (tx) =>
      loadAttemptReport(tx, attemptId),
    );

    expect(result.alreadySubmitted).toBe(true);
    expect(after!.percent).toBe(before!.percent);
  });

  it("surfaces the attempt in the institution dashboard aggregates", async () => {
    const summary = await withRequestContext(staff, (tx) =>
      loadCohortSummary(tx, { trackId }),
    );
    const areas = await withRequestContext(staff, (tx) =>
      loadSkillAreaAggregates(tx, { trackId }),
    );

    expect(summary.assessedCount).toBeGreaterThanOrEqual(1);
    expect(areas.length).toBeGreaterThan(0);
    expect(areas.every((a) => a.average >= 0 && a.average <= 100)).toBe(true);
  });

  it("respects cohort filters", async () => {
    const matching = await withRequestContext(staff, (tx) =>
      loadCohortSummary(tx, { trackId, branch: "CSE" }),
    );
    const nonMatching = await withRequestContext(staff, (tx) =>
      loadCohortSummary(tx, { trackId, branch: "ECE" }),
    );

    expect(matching.assessedCount).toBeGreaterThanOrEqual(1);
    expect(nonMatching.assessedCount).toBe(0);
  });

  it("records a retake as a separate point on the trend", async () => {
    const retakeId = await withRequestContext(student, (tx) =>
      startAttempt(tx, student, trackId),
    );
    expect(retakeId).not.toBe(attemptId);

    await withRequestContext(student, (tx) => submitAttempt(tx, retakeId));
    const trend = await withRequestContext(student, (tx) =>
      loadTrend(tx, student.userId, trackId),
    );

    expect(trend).toHaveLength(2);
    // Oldest first, so the chart reads left to right.
    expect(trend[0].submittedAt.getTime()).toBeLessThanOrEqual(
      trend[1].submittedAt.getTime(),
    );
    // The retake was left blank, so it must score zero rather than inherit.
    expect(trend[1].percent).toBe(0);
  });
});
