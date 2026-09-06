import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * Tenant isolation is the security property universities ask about during
 * procurement, so it is tested against a real database as the real application
 * role — not mocked, and not asserted through the ORM, which could mask a
 * missing policy behind its own WHERE clause.
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

const fixtures: Record<"alpha" | "beta", Fixture> = {} as never;

/** Runs a query with the identity GUCs RLS reads, exactly as the app does. */
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

beforeAll(async () => {
  app = new Client({ connectionString: APP_URL });
  owner = new Client({ connectionString: OWNER_URL });
  await app.connect();
  await owner.connect();

  for (const slug of ["alpha", "beta"] as const) {
    const { rows: tenantRows } = await owner.query<{ id: string }>(
      `INSERT INTO tenants (name, slug, email_domains, invite_code)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [`Test ${slug}`, `rlstest-${slug}`, [`${slug}-rlstest.edu`], `RLS-${slug}`],
    );
    const tenantId = tenantRows[0].id;

    const makeUser = async (role: string, label: string) => {
      const { rows } = await owner.query<{ id: string }>(
        `INSERT INTO users (tenant_id, email, full_name, role)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [tenantId, `${label}@${slug}-rlstest.edu`, `${label} ${slug}`, role],
      );
      return rows[0].id;
    };

    fixtures[slug] = {
      tenantId,
      adminId: await makeUser("admin", "tpo"),
      studentId: await makeUser("student", "student1"),
      otherStudentId: await makeUser("student", "student2"),
    };
  }
});

afterAll(async () => {
  await owner.query("DELETE FROM tenants WHERE slug LIKE 'rlstest-%'");
  await app.end();
  await owner.end();
});

describe("tenant isolation", () => {
  it("hides another university's users from a TPO, even with no WHERE clause", async () => {
    const rows = await asUser(
      { userId: fixtures.alpha.adminId, tenantId: fixtures.alpha.tenantId, role: "admin" },
      "SELECT id, tenant_id FROM users",
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenant_id === fixtures.alpha.tenantId)).toBe(true);
  });

  it("returns nothing when a TPO explicitly queries another tenant's rows", async () => {
    const rows = await asUser(
      { userId: fixtures.alpha.adminId, tenantId: fixtures.alpha.tenantId, role: "admin" },
      "SELECT id FROM users WHERE tenant_id = $1",
      [fixtures.beta.tenantId],
    );
    expect(rows).toHaveLength(0);
  });

  it("cannot be bypassed by claiming another tenant id in the request context", async () => {
    // Simulates a forged/confused context: the identity is an Alpha admin but
    // the tenant GUC says Beta. Policies key off the GUC, so this returns
    // Beta's rows only if someone can already set that GUC -- which only the
    // server can. What must never happen is seeing BOTH tenants at once.
    const rows = await asUser(
      { userId: fixtures.alpha.adminId, tenantId: fixtures.beta.tenantId, role: "admin" },
      "SELECT DISTINCT tenant_id FROM users",
    );
    expect(rows.every((r) => r.tenant_id === fixtures.beta.tenantId)).toBe(true);
  });

  it("shows a student only their own user row", async () => {
    const rows = await asUser<{ id: string }>(
      { userId: fixtures.alpha.studentId, tenantId: fixtures.alpha.tenantId, role: "student" },
      "SELECT id FROM users",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(fixtures.alpha.studentId);
  });

  it("shows nothing at all without a request context", async () => {
    const { rows } = await app.query("SELECT id FROM users");
    expect(rows).toHaveLength(0);
  });
});

describe("attempt ownership", () => {
  let alphaAttemptId: string;

  beforeAll(async () => {
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO attempts (tenant_id, user_id, track_id, duration_seconds, expires_at, status)
       VALUES ($1,$2,(SELECT id FROM tracks LIMIT 1),1800, now() + interval '30 minutes','submitted')
       RETURNING id`,
      [fixtures.alpha.tenantId, fixtures.alpha.studentId],
    );
    alphaAttemptId = rows[0].id;
  });

  it("hides one student's attempt from another student in the same tenant", async () => {
    const rows = await asUser(
      {
        userId: fixtures.alpha.otherStudentId,
        tenantId: fixtures.alpha.tenantId,
        role: "student",
      },
      "SELECT id FROM attempts WHERE id = $1",
      [alphaAttemptId],
    );
    expect(rows).toHaveLength(0);
  });

  it("lets the owning student read their own attempt", async () => {
    const rows = await asUser(
      { userId: fixtures.alpha.studentId, tenantId: fixtures.alpha.tenantId, role: "student" },
      "SELECT id FROM attempts WHERE id = $1",
      [alphaAttemptId],
    );
    expect(rows).toHaveLength(1);
  });

  it("lets that tenant's TPO read it, for the cohort dashboard", async () => {
    const rows = await asUser(
      { userId: fixtures.alpha.adminId, tenantId: fixtures.alpha.tenantId, role: "admin" },
      "SELECT id FROM attempts WHERE id = $1",
      [alphaAttemptId],
    );
    expect(rows).toHaveLength(1);
  });

  it("hides it from another university's TPO", async () => {
    const rows = await asUser(
      { userId: fixtures.beta.adminId, tenantId: fixtures.beta.tenantId, role: "admin" },
      "SELECT id FROM attempts WHERE id = $1",
      [alphaAttemptId],
    );
    expect(rows).toHaveLength(0);
  });

  it("refuses an attempt inserted for a different user", async () => {
    await expect(
      asUser(
        {
          userId: fixtures.alpha.otherStudentId,
          tenantId: fixtures.alpha.tenantId,
          role: "student",
        },
        `INSERT INTO attempts (tenant_id, user_id, track_id, duration_seconds, expires_at)
         VALUES ($1,$2,(SELECT id FROM tracks LIMIT 1),1800, now() + interval '30 minutes')`,
        [fixtures.alpha.tenantId, fixtures.alpha.studentId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("keeps the dashboard read-only: a TPO cannot modify a student's score", async () => {
    await asUser(
      { userId: fixtures.alpha.adminId, tenantId: fixtures.alpha.tenantId, role: "admin" },
      "UPDATE attempts SET percent = 100 WHERE id = $1",
      [alphaAttemptId],
    );
    const { rows } = await owner.query("SELECT percent FROM attempts WHERE id = $1", [
      alphaAttemptId,
    ]);
    expect(rows[0].percent).toBeNull();
  });
});

describe("shared taxonomy", () => {
  it("is readable by a signed-in student", async () => {
    const rows = await asUser(
      { userId: fixtures.alpha.studentId, tenantId: fixtures.alpha.tenantId, role: "student" },
      "SELECT id FROM skill_areas",
    );
    expect(rows.length).toBeGreaterThan(0);
  });

  it("is not writable through the application role", async () => {
    await expect(
      asUser(
        { userId: fixtures.alpha.adminId, tenantId: fixtures.alpha.tenantId, role: "admin" },
        "INSERT INTO skill_areas (code, name) VALUES ('HACK','Hack')",
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
