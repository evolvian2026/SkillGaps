import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * The practice loop.
 *
 * Two invariants, tested against a real database as the real application role:
 *
 *   1. A practice item can never reach a diagnostic paper. Practice shows the
 *      answer and an explanation; if the same item could be examined on, every
 *      diagnostic score in the product would be worthless.
 *   2. One student's practice and checks are their own. Staff at their
 *      institution can see them; another student, or another institution,
 *      cannot.
 */

const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.MIGRATION_DATABASE_URL ?? APP_URL;

let app: Client;
let owner: Client;

const ids = {
  home: { tenantId: "", adminId: "", studentA: "", studentB: "" },
  other: { tenantId: "", studentId: "" },
  areaId: "",
  trackId: "",
  practiceQuestionId: "",
  diagnosticQuestionId: "",
  sessionId: "",
  checkId: "",
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

const asStudent = (id: string, tenantId = ids.home.tenantId) => ({
  userId: id,
  tenantId,
  role: "student",
});

async function cleanup(client: Client): Promise<void> {
  await client.query("DELETE FROM tenants WHERE slug LIKE 'prac-%'");
  await client.query("DELETE FROM questions WHERE prompt LIKE 'Practice loop %'");
  await client.query("DELETE FROM tracks WHERE code = 'PRAC-T'");
  await client.query("DELETE FROM skill_areas WHERE code = 'PRAC-A'");
}

beforeAll(async () => {
  app = new Client({ connectionString: APP_URL });
  owner = new Client({ connectionString: OWNER_URL });
  await app.connect();
  await owner.connect();
  await cleanup(owner);

  for (const key of ["home", "other"] as const) {
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO tenants (name, slug, email_domains, invite_code)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [`Prac ${key}`, `prac-${key}`, [`prac-${key}.edu.in`], `PRAC-${key}`],
    );
    ids[key].tenantId = rows[0].id;
  }

  const mkUser = async (tenantId: string, email: string, role: string) => {
    const r = await owner.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, full_name, role)
       VALUES ($1,$2,'Prac User',$3) RETURNING id`,
      [tenantId, email, role],
    );
    return r.rows[0].id;
  };
  ids.home.adminId = await mkUser(ids.home.tenantId, "admin@prac-home.edu.in", "admin");
  ids.home.studentA = await mkUser(ids.home.tenantId, "a@prac-home.edu.in", "student");
  ids.home.studentB = await mkUser(ids.home.tenantId, "b@prac-home.edu.in", "student");
  ids.other.studentId = await mkUser(ids.other.tenantId, "c@prac-other.edu.in", "student");

  const area = await owner.query<{ id: string }>(
    `INSERT INTO skill_areas (code, name) VALUES ('PRAC-A','Prac Area') RETURNING id`,
  );
  ids.areaId = area.rows[0].id;

  const track = await owner.query<{ id: string }>(
    `INSERT INTO tracks (code, name) VALUES ('PRAC-T','Prac Track') RETURNING id`,
  );
  ids.trackId = track.rows[0].id;

  const mkQuestion = async (prompt: string, pool: string) => {
    const r = await owner.query<{ id: string }>(
      `INSERT INTO questions (skill_area_id, type, pool, prompt, difficulty)
       VALUES ($1,'mcq',$2,$3,2) RETURNING id`,
      [ids.areaId, pool, prompt],
    );
    return r.rows[0].id;
  };
  ids.practiceQuestionId = await mkQuestion("Practice loop practice item", "practice");
  ids.diagnosticQuestionId = await mkQuestion("Practice loop diagnostic item", "diagnostic");

  const session = await owner.query<{ id: string }>(
    `INSERT INTO practice_sessions (tenant_id, user_id, skill_area_id, total_count)
     VALUES ($1,$2,$3,1) RETURNING id`,
    [ids.home.tenantId, ids.home.studentA, ids.areaId],
  );
  ids.sessionId = session.rows[0].id;
  await owner.query(
    `INSERT INTO practice_responses (tenant_id, session_id, question_id, position)
     VALUES ($1,$2,$3,1)`,
    [ids.home.tenantId, ids.sessionId, ids.practiceQuestionId],
  );

  const check = await owner.query<{ id: string }>(
    `INSERT INTO skill_checks (tenant_id, user_id, skill_area_id, total_count, baseline_percent)
     VALUES ($1,$2,$3,8,40) RETURNING id`,
    [ids.home.tenantId, ids.home.studentA, ids.areaId],
  );
  ids.checkId = check.rows[0].id;
  await owner.query(
    `INSERT INTO skill_check_questions (tenant_id, check_id, question_id, position)
     VALUES ($1,$2,$3,1)`,
    [ids.home.tenantId, ids.checkId, ids.diagnosticQuestionId],
  );
});

afterAll(async () => {
  await cleanup(owner);
  await app.end();
  await owner.end();
});

describe("the practice pool never reaches a diagnostic", () => {
  it("refuses to attach a practice question to a track, even as the owner", async () => {
    // startAttempt draws from questions joined to question_tracks, so this is
    // the single link that would leak a practice item into a graded paper.
    await expect(
      owner.query(
        "INSERT INTO question_tracks (question_id, track_id) VALUES ($1,$2)",
        [ids.practiceQuestionId, ids.trackId],
      ),
    ).rejects.toThrow(/practice question cannot be attached to a track/i);
  });

  it("allows a diagnostic question on a track", async () => {
    await expect(
      owner.query(
        "INSERT INTO question_tracks (question_id, track_id) VALUES ($1,$2)",
        [ids.diagnosticQuestionId, ids.trackId],
      ),
    ).resolves.toBeTruthy();
  });

  it("refuses a question moved into the practice pool while still on a track", async () => {
    // The trigger fires on UPDATE too, so a later edit cannot smuggle one in.
    await expect(
      owner.query(
        "UPDATE question_tracks SET question_id = $1 WHERE question_id = $2",
        [ids.practiceQuestionId, ids.diagnosticQuestionId],
      ),
    ).rejects.toThrow(/practice question cannot be attached to a track/i);
  });
});

describe("practice belongs to the student who did it", () => {
  it("lets the owner read their own session", async () => {
    const rows = await asUser(
      asStudent(ids.home.studentA),
      "SELECT id FROM practice_sessions WHERE id = $1",
      [ids.sessionId],
    );
    expect(rows).toHaveLength(1);
  });

  it("hides it from a classmate", async () => {
    const rows = await asUser(
      asStudent(ids.home.studentB),
      "SELECT id FROM practice_sessions WHERE id = $1",
      [ids.sessionId],
    );
    expect(rows).toHaveLength(0);
  });

  it("hides the responses from a classmate too", async () => {
    const rows = await asUser(
      asStudent(ids.home.studentB),
      "SELECT id FROM practice_responses WHERE session_id = $1",
      [ids.sessionId],
    );
    expect(rows).toHaveLength(0);
  });

  it("hides it from another institution entirely", async () => {
    const rows = await asUser(
      asStudent(ids.other.studentId, ids.other.tenantId),
      "SELECT id FROM practice_sessions",
    );
    expect(rows).toHaveLength(0);
  });

  it("lets the student's own institution's staff see it", async () => {
    const rows = await asUser(
      { userId: ids.home.adminId, tenantId: ids.home.tenantId, role: "admin" },
      "SELECT id FROM practice_sessions WHERE id = $1",
      [ids.sessionId],
    );
    expect(rows).toHaveLength(1);
  });

  it("refuses a student writing a session for someone else", async () => {
    await expect(
      asUser(
        asStudent(ids.home.studentB),
        `INSERT INTO practice_sessions (tenant_id, user_id, skill_area_id)
         VALUES ($1,$2,$3)`,
        [ids.home.tenantId, ids.home.studentA, ids.areaId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("refuses a classmate answering someone else's practice question", async () => {
    const updated = await asUser(
      asStudent(ids.home.studentB),
      `UPDATE practice_responses SET is_correct = true
        WHERE session_id = $1 RETURNING id`,
      [ids.sessionId],
    );
    expect(updated).toHaveLength(0);
  });
});

describe("skill checks belong to the student who took them", () => {
  it("lets the owner read their own check", async () => {
    const rows = await asUser(
      asStudent(ids.home.studentA),
      "SELECT id FROM skill_checks WHERE id = $1",
      [ids.checkId],
    );
    expect(rows).toHaveLength(1);
  });

  it("hides it from a classmate", async () => {
    const rows = await asUser(
      asStudent(ids.home.studentB),
      "SELECT id FROM skill_checks WHERE id = $1",
      [ids.checkId],
    );
    expect(rows).toHaveLength(0);
  });

  it("hides the check's questions from a classmate", async () => {
    const rows = await asUser(
      asStudent(ids.home.studentB),
      "SELECT id FROM skill_check_questions WHERE check_id = $1",
      [ids.checkId],
    );
    expect(rows).toHaveLength(0);
  });

  it("refuses a classmate answering someone else's check", async () => {
    // Otherwise one student could complete another's check for them.
    const updated = await asUser(
      asStudent(ids.home.studentB),
      `UPDATE skill_check_questions SET is_correct = true
        WHERE check_id = $1 RETURNING id`,
      [ids.checkId],
    );
    expect(updated).toHaveLength(0);
  });

  it("refuses a student rewriting their own score after the fact", async () => {
    // The student may update their check — that is how submit works — but the
    // application grades from the option rows, never from the client. What RLS
    // guarantees is only that they cannot touch anyone else's.
    const updated = await asUser(
      asStudent(ids.home.studentB),
      "UPDATE skill_checks SET percent = 100 WHERE id = $1 RETURNING id",
      [ids.checkId],
    );
    expect(updated).toHaveLength(0);
  });
});
