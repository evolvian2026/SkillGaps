import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * Phase 2 tenant isolation, tested against a real database as the real
 * application role — same posture as the Phase 1 RLS tests.
 *
 * The resume rules are deliberately stricter than the attempt rules: staff can
 * see a match score but never the file or its extracted text.
 */

const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.MIGRATION_DATABASE_URL ?? APP_URL;

let app: Client;
let owner: Client;

interface Fixture {
  tenantId: string;
  adminId: string;
  studentId: string;
  otherStudentId: string;
}
const fx: Record<"alpha" | "beta", Fixture> = {} as never;

async function asUser<T = Record<string, unknown>>(
  identity: { userId: string; tenantId: string; role: string },
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await app.query("BEGIN");
  try {
    await app.query(
      "SELECT set_config('app.user_id',$1,true), set_config('app.tenant_id',$2,true), set_config('app.user_role',$3,true)",
      [identity.userId, identity.tenantId, identity.role],
    );
    const result = await app.query(sql, params);
    await app.query("COMMIT");
    return result.rows as T[];
  } catch (err) {
    await app.query("ROLLBACK");
    throw err;
  }
}

const ctx = (f: Fixture, who: "admin" | "student" | "other") => ({
  userId:
    who === "admin" ? f.adminId : who === "student" ? f.studentId : f.otherStudentId,
  tenantId: f.tenantId,
  role: who === "admin" ? "admin" : "student",
});

beforeAll(async () => {
  app = new Client({ connectionString: APP_URL });
  owner = new Client({ connectionString: OWNER_URL });
  await app.connect();
  await owner.connect();

  for (const slug of ["alpha", "beta"] as const) {
    const { rows: t } = await owner.query<{ id: string }>(
      `INSERT INTO tenants (name, slug, email_domains, invite_code)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [`P2 ${slug}`, `p2test-${slug}`, [`${slug}-p2test.edu`], `P2-${slug}`],
    );
    const tenantId = t[0].id;
    const mk = async (role: string, label: string) => {
      const { rows } = await owner.query<{ id: string }>(
        `INSERT INTO users (tenant_id, email, full_name, role)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [tenantId, `${label}@${slug}-p2test.edu`, `${label} ${slug}`, role],
      );
      return rows[0].id;
    };
    fx[slug] = {
      tenantId,
      adminId: await mk("admin", "tpo"),
      studentId: await mk("student", "s1"),
      otherStudentId: await mk("student", "s2"),
    };
  }
});

afterAll(async () => {
  await owner.query("DELETE FROM tenants WHERE slug LIKE 'p2test-%'");
  await app.end();
  await owner.end();
});

describe("resumes", () => {
  let resumeId: string;

  beforeAll(async () => {
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO resumes
         (tenant_id, user_id, file_name, content_type, size_bytes, storage_key,
          status, extracted_text, retain_until)
       VALUES ($1,$2,'cv.pdf','application/pdf',1024,'k/1','parsed',
               'Priya Sharma, phone 99999', now() + interval '180 days')
       RETURNING id`,
      [fx.alpha.tenantId, fx.alpha.studentId],
    );
    resumeId = rows[0].id;
  });

  it("is readable by its owner", async () => {
    const rows = await asUser(ctx(fx.alpha, "student"), "SELECT id FROM resumes");
    expect(rows).toHaveLength(1);
  });

  it("is hidden from another student in the same tenant", async () => {
    const rows = await asUser(ctx(fx.alpha, "other"), "SELECT id FROM resumes");
    expect(rows).toHaveLength(0);
  });

  it("is hidden even from the student's own TPO", async () => {
    // Stricter than attempt data on purpose: staff get the derived match
    // score, never the CV or its text.
    const rows = await asUser(ctx(fx.alpha, "admin"), "SELECT id FROM resumes");
    expect(rows).toHaveLength(0);
  });

  it("is hidden from another university entirely", async () => {
    const rows = await asUser(
      ctx(fx.beta, "admin"),
      "SELECT id FROM resumes WHERE id = $1",
      [resumeId],
    );
    expect(rows).toHaveLength(0);
  });
});

describe("interview sessions", () => {
  let sessionId: string;

  beforeAll(async () => {
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO interview_sessions (tenant_id, user_id, track_id, status)
       VALUES ($1,$2,(SELECT id FROM tracks LIMIT 1),'evaluated') RETURNING id`,
      [fx.alpha.tenantId, fx.alpha.studentId],
    );
    sessionId = rows[0].id;
  });

  it("is readable by the owning student", async () => {
    expect(
      await asUser(ctx(fx.alpha, "student"), "SELECT id FROM interview_sessions WHERE id=$1", [
        sessionId,
      ]),
    ).toHaveLength(1);
  });

  it("is readable by that tenant's staff", async () => {
    expect(
      await asUser(ctx(fx.alpha, "admin"), "SELECT id FROM interview_sessions WHERE id=$1", [
        sessionId,
      ]),
    ).toHaveLength(1);
  });

  it("is hidden from another student in the same tenant", async () => {
    expect(
      await asUser(ctx(fx.alpha, "other"), "SELECT id FROM interview_sessions WHERE id=$1", [
        sessionId,
      ]),
    ).toHaveLength(0);
  });

  it("is hidden from another university", async () => {
    expect(
      await asUser(ctx(fx.beta, "admin"), "SELECT id FROM interview_sessions WHERE id=$1", [
        sessionId,
      ]),
    ).toHaveLength(0);
  });

  it("cannot be created for another student", async () => {
    await expect(
      asUser(
        ctx(fx.alpha, "other"),
        `INSERT INTO interview_sessions (tenant_id, user_id, track_id)
         VALUES ($1,$2,(SELECT id FROM tracks LIMIT 1))`,
        [fx.alpha.tenantId, fx.alpha.studentId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("job descriptions", () => {
  let privateJd: string;
  let sharedJd: string;

  beforeAll(async () => {
    const mk = async (title: string, shared: boolean, creator: string) => {
      const { rows } = await owner.query<{ id: string }>(
        `INSERT INTO job_descriptions (tenant_id, created_by, title, raw_text, is_shared)
         VALUES ($1,$2,$3,'text',$4) RETURNING id`,
        [fx.alpha.tenantId, creator, title, shared],
      );
      return rows[0].id;
    };
    privateJd = await mk("Private JD", false, fx.alpha.studentId);
    sharedJd = await mk("Shared JD", true, fx.alpha.adminId);
  });

  it("shows a student their own and the shared ones, not another student's", async () => {
    const rows = await asUser<{ id: string }>(
      ctx(fx.alpha, "other"),
      "SELECT id FROM job_descriptions ORDER BY title",
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(sharedJd);
    expect(ids).not.toContain(privateJd);
  });

  it("refuses a student publishing to the whole cohort", async () => {
    await expect(
      asUser(
        ctx(fx.alpha, "student"),
        `INSERT INTO job_descriptions (tenant_id, created_by, title, raw_text, is_shared)
         VALUES ($1,$2,'Sneaky','text',true)`,
        [fx.alpha.tenantId, fx.alpha.studentId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("allows staff to publish to the cohort", async () => {
    await expect(
      asUser(
        ctx(fx.alpha, "admin"),
        `INSERT INTO job_descriptions (tenant_id, created_by, title, raw_text, is_shared)
         VALUES ($1,$2,'Campus drive','text',true)`,
        [fx.alpha.tenantId, fx.alpha.adminId],
      ),
    ).resolves.toBeDefined();
  });
});

describe("syllabus", () => {
  beforeAll(async () => {
    await owner.query(
      `INSERT INTO syllabus_subjects (tenant_id, name, topics)
       VALUES ($1,'DBMS','{Joins}')`,
      [fx.alpha.tenantId],
    );
  });

  it("is readable by staff of that tenant", async () => {
    expect(
      (await asUser(ctx(fx.alpha, "admin"), "SELECT id FROM syllabus_subjects")).length,
    ).toBeGreaterThan(0);
  });

  it("is not student-facing", async () => {
    expect(
      await asUser(ctx(fx.alpha, "student"), "SELECT id FROM syllabus_subjects"),
    ).toHaveLength(0);
  });

  it("is hidden from another university's staff", async () => {
    expect(
      await asUser(ctx(fx.beta, "admin"), "SELECT id FROM syllabus_subjects"),
    ).toHaveLength(0);
  });
});

describe("ai_evaluations", () => {
  beforeAll(async () => {
    await owner.query(
      `INSERT INTO ai_evaluations
         (tenant_id, subject_type, subject_id, method, status, evaluator_version, input)
       VALUES ($1,'interview_response',gen_random_uuid(),'rubric','succeeded','rubric-v1','{}')`,
      [fx.alpha.tenantId],
    );
  });

  it("is readable within the tenant for audit", async () => {
    expect(
      (await asUser(ctx(fx.alpha, "admin"), "SELECT id FROM ai_evaluations")).length,
    ).toBeGreaterThan(0);
  });

  it("is not visible to another tenant", async () => {
    expect(
      await asUser(ctx(fx.beta, "admin"), "SELECT id FROM ai_evaluations"),
    ).toHaveLength(0);
  });

  it("is append-only: the audit trail cannot be rewritten", async () => {
    await expect(
      asUser(
        ctx(fx.alpha, "admin"),
        "UPDATE ai_evaluations SET output = '{\"tampered\":true}'",
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("cannot be deleted through the application role", async () => {
    await expect(
      asUser(ctx(fx.alpha, "admin"), "DELETE FROM ai_evaluations"),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("placement outcomes", () => {
  it("can be recorded by the student themselves", async () => {
    await expect(
      asUser(
        ctx(fx.alpha, "student"),
        `INSERT INTO placement_outcomes (tenant_id, user_id, status)
         VALUES ($1,$2,'placed')`,
        [fx.alpha.tenantId, fx.alpha.studentId],
      ),
    ).resolves.toBeDefined();
  });

  it("can be recorded by their TPO on their behalf", async () => {
    await expect(
      asUser(
        ctx(fx.alpha, "admin"),
        `INSERT INTO placement_outcomes (tenant_id, user_id, status)
         VALUES ($1,$2,'not_placed')`,
        [fx.alpha.tenantId, fx.alpha.otherStudentId],
      ),
    ).resolves.toBeDefined();
  });

  it("is not visible to another student", async () => {
    const rows = await asUser<{ user_id: string }>(
      ctx(fx.alpha, "other"),
      "SELECT user_id FROM placement_outcomes",
    );
    expect(rows.every((r) => r.user_id === fx.alpha.otherStudentId)).toBe(true);
  });

  it("is not visible to another university", async () => {
    expect(
      await asUser(ctx(fx.beta, "admin"), "SELECT id FROM placement_outcomes"),
    ).toHaveLength(0);
  });
});

describe("readiness weights", () => {
  it("cannot be changed by a student", async () => {
    await expect(
      asUser(
        ctx(fx.alpha, "student"),
        `INSERT INTO readiness_weights (tenant_id, diagnostic_weight)
         VALUES ($1, 1.0)`,
        [fx.alpha.tenantId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("can be set by staff", async () => {
    await expect(
      asUser(
        ctx(fx.alpha, "admin"),
        `INSERT INTO readiness_weights (tenant_id, diagnostic_weight)
         VALUES ($1, 0.6)`,
        [fx.alpha.tenantId],
      ),
    ).resolves.toBeDefined();
  });

  it("is readable by students, who are entitled to know how they are scored", async () => {
    expect(
      (await asUser(ctx(fx.alpha, "student"), "SELECT tenant_id FROM readiness_weights"))
        .length,
    ).toBeGreaterThan(0);
  });
});
