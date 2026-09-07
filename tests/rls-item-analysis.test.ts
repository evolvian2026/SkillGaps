import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * Item analysis: who may read it, and what the pooling query actually pools.
 *
 * The statistics themselves are covered by the Python suite. What can only be
 * tested here is the SQL: that the response pool crosses tenants (which is the
 * point), excludes the papers it must, and computes a rest-of-paper score that
 * genuinely excludes the item being scored — an off-by-one there would inflate
 * every discrimination in the bank and hide exactly the items this exists to
 * find.
 */

const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.MIGRATION_DATABASE_URL ?? APP_URL;

let app: Client;
let owner: Client;

const ids = {
  tenantA: "",
  tenantB: "",
  superAdmin: "",
  tpo: "",
  student: "",
  trackId: "",
  skillAreaId: "",
  /** Three items: two answered normally, one only on excluded papers. */
  qGood: "",
  qOther: "",
  qExcluded: "",
  runId: "",
};

async function asUser<T = Record<string, unknown>>(
  identity: { userId: string; tenantId: string; role: string },
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await app.query("BEGIN");
  try {
    await app.query(
      `SELECT set_config('app.user_id',$1,true), set_config('app.tenant_id',$2,true),
              set_config('app.user_role',$3,true), set_config('app.employer_id','',true)`,
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

/** Creates one submitted attempt with the given per-question correctness. */
async function seedAttempt(
  tenantId: string,
  userId: string,
  answers: { questionId: string; correct: boolean }[],
  options: { status?: string; flags?: object; graded?: boolean } = {},
): Promise<string> {
  const { rows } = await owner.query<{ id: string }>(
    `INSERT INTO attempts
       (tenant_id, user_id, track_id, status, expires_at, duration_seconds,
        submitted_at, integrity_flags)
     VALUES ($1,$2,$3,$4, now() + interval '1 hour', 2700, now(), $5)
     RETURNING id`,
    [
      tenantId,
      userId,
      ids.trackId,
      options.status ?? "submitted",
      JSON.stringify(options.flags ?? {}),
    ],
  );
  const attemptId = rows[0].id;

  let position = 0;
  for (const answer of answers) {
    const aq = await owner.query<{ id: string }>(
      `INSERT INTO attempt_questions
         (tenant_id, attempt_id, question_id, skill_area_id, position)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [tenantId, attemptId, answer.questionId, ids.skillAreaId, position++],
    );
    await owner.query(
      `INSERT INTO answers (tenant_id, attempt_question_id, is_correct)
       VALUES ($1,$2,$3)`,
      [tenantId, aq.rows[0].id, options.graded === false ? null : answer.correct],
    );
  }
  return attemptId;
}

/** Removes anything a previous run left behind, so setup is idempotent. */
async function cleanup(client: Client): Promise<void> {
  await client.query("DELETE FROM item_analysis_runs WHERE message = 'test run'");
  await client.query("DELETE FROM tenants WHERE slug LIKE 'item-%'");
  await client.query(
    `DELETE FROM questions
      WHERE prompt IN ('Item under test','Companion item','Only on excluded papers')`,
  );
  await client.query("DELETE FROM tracks WHERE code = 'ITEM-T'");
  await client.query("DELETE FROM skill_areas WHERE code = 'ITEM-A'");
}

beforeAll(async () => {
  app = new Client({ connectionString: APP_URL });
  owner = new Client({ connectionString: OWNER_URL });
  await app.connect();
  await owner.connect();
  // A run that failed partway through would otherwise wedge every later run
  // on a unique constraint rather than on the thing that actually broke.
  await cleanup(owner);

  for (const key of ["tenantA", "tenantB"] as const) {
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO tenants (name, slug, email_domains, invite_code)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [`Item ${key}`, `item-${key}`, [`item-${key}.edu.in`], `ITEM-${key}`],
    );
    ids[key] = rows[0].id;
  }

  const mkUser = async (tenantId: string, email: string, role: string) => {
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, full_name, role)
       VALUES ($1,$2,'Item User',$3) RETURNING id`,
      [tenantId, email, role],
    );
    return rows[0].id;
  };
  ids.superAdmin = await mkUser(ids.tenantA, "root@item-a.edu.in", "super_admin");
  ids.tpo = await mkUser(ids.tenantA, "tpo@item-a.edu.in", "admin");
  ids.student = await mkUser(ids.tenantA, "student@item-a.edu.in", "student");

  const track = await owner.query<{ id: string }>(
    `INSERT INTO tracks (code, name) VALUES ('ITEM-T','Item Track') RETURNING id`,
  );
  ids.trackId = track.rows[0].id;

  const area = await owner.query<{ id: string }>(
    `INSERT INTO skill_areas (code, name) VALUES ('ITEM-A','Item Area') RETURNING id`,
  );
  ids.skillAreaId = area.rows[0].id;

  const mkQuestion = async (stem: string) => {
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO questions (skill_area_id, type, prompt, difficulty)
       VALUES ($1,'mcq',$2,2) RETURNING id`,
      [ids.skillAreaId, stem],
    );
    return rows[0].id;
  };
  ids.qGood = await mkQuestion("Item under test");
  ids.qOther = await mkQuestion("Companion item");
  ids.qExcluded = await mkQuestion("Only on excluded papers");

  // Tenant A: one clean paper, all three answers correct.
  const a = await mkUser(ids.tenantA, "a1@item-a.edu.in", "student");
  await seedAttempt(ids.tenantA, a, [
    { questionId: ids.qGood, correct: true },
    { questionId: ids.qOther, correct: true },
  ]);

  // Tenant B: a clean paper too — the pool must cross the tenant boundary.
  const b = await mkUser(ids.tenantB, "b1@item-b.edu.in", "student");
  await seedAttempt(ids.tenantB, b, [
    { questionId: ids.qGood, correct: false },
    { questionId: ids.qOther, correct: true },
  ]);

  // Papers that must be excluded, each for a different reason.
  const fast = await mkUser(ids.tenantA, "fast@item-a.edu.in", "student");
  await seedAttempt(
    ids.tenantA,
    fast,
    [
      { questionId: ids.qExcluded, correct: true },
      { questionId: ids.qOther, correct: true },
    ],
    { flags: { fast_completion: 1 } },
  );

  const abandoned = await mkUser(ids.tenantA, "gone@item-a.edu.in", "student");
  await seedAttempt(
    ids.tenantA,
    abandoned,
    [
      { questionId: ids.qExcluded, correct: false },
      { questionId: ids.qOther, correct: false },
    ],
    { status: "abandoned" },
  );

  const ungraded = await mkUser(ids.tenantA, "pending@item-a.edu.in", "student");
  await seedAttempt(
    ids.tenantA,
    ungraded,
    [
      { questionId: ids.qExcluded, correct: true },
      { questionId: ids.qOther, correct: true },
    ],
    { graded: false },
  );

  // A run, so the read policies have something to be tested against.
  const run = await owner.query<{ id: string }>(
    `INSERT INTO item_analysis_runs (min_responses, analysed_count, message)
     VALUES (30, 1, 'test run') RETURNING id`,
  );
  ids.runId = run.rows[0].id;
  await owner.query(
    `INSERT INTO item_statistics
       (run_id, question_id, responses, facility, discrimination, verdict, flags, message)
     VALUES ($1,$2,40,0.5,0.42,'ok','{}','fine')`,
    [ids.runId, ids.qGood],
  );
});

afterAll(async () => {
  await cleanup(owner);
  await app.end();
  await owner.end();
});

describe("item statistics are for whoever owns the bank, and nobody else", () => {
  it("lets a super admin read them", async () => {
    const rows = await asUser(
      { userId: ids.superAdmin, tenantId: ids.tenantA, role: "super_admin" },
      "SELECT id FROM item_statistics WHERE run_id = $1",
      [ids.runId],
    );
    expect(rows).toHaveLength(1);
  });

  it("hides them from a TPO", async () => {
    // These pool other institutions' response behaviour, about a bank the
    // placement office does not own and cannot edit.
    const stats = await asUser(
      { userId: ids.tpo, tenantId: ids.tenantA, role: "admin" },
      "SELECT id FROM item_statistics",
    );
    const runs = await asUser(
      { userId: ids.tpo, tenantId: ids.tenantA, role: "admin" },
      "SELECT id FROM item_analysis_runs",
    );
    expect(stats).toHaveLength(0);
    expect(runs).toHaveLength(0);
  });

  it("hides them from a student", async () => {
    const rows = await asUser(
      { userId: ids.student, tenantId: ids.tenantA, role: "student" },
      "SELECT id FROM item_statistics",
    );
    expect(rows).toHaveLength(0);
  });

  it("refuses a write even from a super admin", async () => {
    // The offline job writes as the owner role. The application never does,
    // so no INSERT privilege is granted at all.
    await expect(
      asUser(
        { userId: ids.superAdmin, tenantId: ids.tenantA, role: "super_admin" },
        `INSERT INTO item_analysis_runs (min_responses) VALUES (30)`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("keeps the pooling function away from the application role entirely", async () => {
    // It crosses every tenant by design; only the offline job may call it.
    await expect(
      asUser(
        { userId: ids.superAdmin, tenantId: ids.tenantA, role: "super_admin" },
        "SELECT * FROM app.item_response_pool(NULL)",
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe("the response pool", () => {
  const pool = async (): Promise<
    { question_id: string; correct: boolean; rest_percent: number }[]
  > => {
    const { rows } = await owner.query(
      "SELECT question_id::text, correct, rest_percent FROM app.item_response_pool($1)",
      [ids.trackId],
    );
    return rows;
  };

  it("pools responses across tenants, which is the whole point", async () => {
    const rows = await pool();
    const forItem = rows.filter((r) => r.question_id === ids.qGood);
    // One from tenant A, one from tenant B. An item's statistics are only
    // meaningful pooled; per-tenant they would never reach a usable sample.
    expect(forItem).toHaveLength(2);
    expect(forItem.map((r) => r.correct).sort()).toEqual([false, true]);
  });

  it("excludes a paper flagged for fast completion", async () => {
    const rows = await pool();
    // Near-random responding would depress every item on the paper.
    expect(rows.some((r) => r.question_id === ids.qExcluded)).toBe(false);
  });

  it("excludes an abandoned paper", async () => {
    const rows = await pool();
    // A blank on an abandoned paper is not a wrong answer.
    const abandonedRows = rows.filter((r) => r.question_id === ids.qExcluded);
    expect(abandonedRows).toHaveLength(0);
  });

  it("excludes an answer that has not been graded", async () => {
    const rows = await pool();
    expect(rows.filter((r) => r.question_id === ids.qExcluded)).toHaveLength(0);
  });

  it("computes a rest-of-paper score that excludes the item itself", async () => {
    const rows = await pool();

    // Tenant A's paper: both answers correct. Removing the item under test
    // leaves one remaining answer, correct — so 100%, not 100% inflated by
    // the item's own correctness being counted twice.
    const aRow = rows.find((r) => r.question_id === ids.qGood && r.correct);
    expect(Number(aRow!.rest_percent)).toBe(100);

    // Tenant B's paper: this item wrong, the other correct. The rest of the
    // paper is still 100% — the item's own failure must not drag it down.
    const bRow = rows.find((r) => r.question_id === ids.qGood && !r.correct);
    expect(Number(bRow!.rest_percent)).toBe(100);
  });

  it("drops a one-question paper, where a rest-of-paper score is undefined", async () => {
    const solo = await owner.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, full_name, role)
       VALUES ($1,'solo@item-a.edu.in','Solo','student') RETURNING id`,
      [ids.tenantA],
    );
    await seedAttempt(ids.tenantA, solo.rows[0].id, [
      { questionId: ids.qGood, correct: true },
    ]);

    const rows = await pool();
    // Still only the two real papers: dividing by zero remaining questions is
    // not a score, and a silent NULL would poison the correlation.
    expect(rows.filter((r) => r.question_id === ids.qGood)).toHaveLength(2);
  });
});
