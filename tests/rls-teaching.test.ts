import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * Teaching assignments.
 *
 * The faculty view is a delegation from the placement office: a lecturer sees
 * a class because the office said they teach it. If a lecturer could write
 * this table they could assign themselves any section in the institution and
 * read its results, which would turn the whole feature into a self-service
 * tenancy hole. That is the property these tests exist for.
 */

const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.MIGRATION_DATABASE_URL ?? APP_URL;

let app: Client;
let owner: Client;

const ids = {
  home: { tenantId: "", adminId: "", facultyId: "", subjectId: "", studentId: "" },
  other: { tenantId: "", adminId: "", facultyId: "", subjectId: "" },
  assignmentId: "",
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

const asAdmin = (which: "home" | "other" = "home") => ({
  userId: ids[which].adminId,
  tenantId: ids[which].tenantId,
  role: "admin",
});

const asFaculty = (which: "home" | "other" = "home") => ({
  userId: ids[which].facultyId,
  tenantId: ids[which].tenantId,
  role: "faculty",
});

const INSERT = `INSERT INTO teaching_assignments
  (tenant_id, subject_id, faculty_id, branch, section) VALUES ($1,$2,$3,'CSE','A')`;

async function cleanup(client: Client): Promise<void> {
  await client.query("DELETE FROM tenants WHERE slug LIKE 'teach-%'");
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
      [`Teach ${key}`, `teach-${key}`, [`teach-${key}.edu.in`], `TEACH-${key}`],
    );
    ids[key].tenantId = rows[0].id;

    const mkUser = async (email: string, role: string) => {
      const r = await owner.query<{ id: string }>(
        `INSERT INTO users (tenant_id, email, full_name, role)
         VALUES ($1,$2,'Teach User',$3) RETURNING id`,
        [rows[0].id, email, role],
      );
      return r.rows[0].id;
    };
    ids[key].adminId = await mkUser(`admin@teach-${key}.edu.in`, "admin");
    ids[key].facultyId = await mkUser(`faculty@teach-${key}.edu.in`, "faculty");

    const subject = await owner.query<{ id: string }>(
      `INSERT INTO syllabus_subjects (tenant_id, code, name, branch, topics)
       VALUES ($1,'T1','Teach Subject','CSE','{Joins and Subqueries}') RETURNING id`,
      [rows[0].id],
    );
    ids[key].subjectId = subject.rows[0].id;
  }

  const student = await owner.query<{ id: string }>(
    `INSERT INTO users (tenant_id, email, full_name, role)
     VALUES ($1,'student@teach-home.edu.in','Teach Student','student') RETURNING id`,
    [ids.home.tenantId],
  );
  ids.home.studentId = student.rows[0].id;
});

afterAll(async () => {
  await cleanup(owner);
  await app.end();
  await owner.end();
});

describe("only the placement office assigns teaching", () => {
  it("lets an admin assign a lecturer to a subject", async () => {
    await asUser(asAdmin(), INSERT, [
      ids.home.tenantId,
      ids.home.subjectId,
      ids.home.facultyId,
    ]);
    const rows = await asUser<{ id: string }>(
      asAdmin(),
      "SELECT id FROM teaching_assignments WHERE faculty_id = $1",
      [ids.home.facultyId],
    );
    expect(rows).toHaveLength(1);
    ids.assignmentId = rows[0].id;
  });

  it("refuses a lecturer assigning themselves a class", async () => {
    // The whole feature rests on this: a lecturer who could write here could
    // read any section in the institution.
    await expect(
      asUser(asFaculty(), INSERT, [
        ids.home.tenantId,
        ids.home.subjectId,
        ids.home.facultyId,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it("refuses a lecturer assigning a colleague either", async () => {
    await expect(
      asUser(asFaculty(), INSERT, [
        ids.home.tenantId,
        ids.home.subjectId,
        ids.home.adminId,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it("refuses a student outright", async () => {
    await expect(
      asUser(
        { userId: ids.home.studentId, tenantId: ids.home.tenantId, role: "student" },
        INSERT,
        [ids.home.tenantId, ids.home.subjectId, ids.home.facultyId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("refuses an admin naming a lecturer from another institution", async () => {
    // Without this an assignment could hand another college's staff member
    // this institution's results.
    await expect(
      asUser(asAdmin(), INSERT, [
        ids.home.tenantId,
        ids.home.subjectId,
        ids.other.facultyId,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it("refuses an admin naming another institution's subject", async () => {
    await expect(
      asUser(asAdmin(), INSERT, [
        ids.home.tenantId,
        ids.other.subjectId,
        ids.home.facultyId,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it("refuses an admin writing a row into another tenant", async () => {
    await expect(
      asUser(asAdmin("other"), INSERT, [
        ids.home.tenantId,
        ids.home.subjectId,
        ids.home.facultyId,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });

  it("refuses a student from naming themselves as staff", async () => {
    await expect(
      asUser(asAdmin(), INSERT, [
        ids.home.tenantId,
        ids.home.subjectId,
        ids.home.studentId,
      ]),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("who can read an assignment", () => {
  it("lets the assigned lecturer see their own", async () => {
    const rows = await asUser(
      asFaculty(),
      "SELECT id FROM teaching_assignments WHERE faculty_id = $1",
      [ids.home.facultyId],
    );
    expect(rows).toHaveLength(1);
  });

  it("shows another institution nothing", async () => {
    const rows = await asUser(
      asAdmin("other"),
      "SELECT id FROM teaching_assignments",
    );
    expect(rows).toHaveLength(0);
  });

  it("hides assignments from students", async () => {
    const rows = await asUser(
      { userId: ids.home.studentId, tenantId: ids.home.tenantId, role: "student" },
      "SELECT id FROM teaching_assignments",
    );
    expect(rows).toHaveLength(0);
  });
});

describe("removing an assignment", () => {
  it("refuses a lecturer removing their own", async () => {
    // Otherwise a lecturer could quietly drop a class the office is tracking.
    const removed = await asUser(
      asFaculty(),
      "DELETE FROM teaching_assignments WHERE id = $1 RETURNING id",
      [ids.assignmentId],
    );
    expect(removed).toHaveLength(0);
  });

  it("lets the placement office remove it", async () => {
    const removed = await asUser(
      asAdmin(),
      "DELETE FROM teaching_assignments WHERE id = $1 RETURNING id",
      [ids.assignmentId],
    );
    expect(removed).toHaveLength(1);
  });
});
