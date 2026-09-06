import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * Employer isolation.
 *
 * The two invariants that matter, tested against a real database as the real
 * application role:
 *
 *   1. An employer sees nothing about a university that has not granted them
 *      access, and nothing once that grant is revoked or expired.
 *   2. An employer never sees an identifiable student without that student's
 *      own opt-in — which is separate from, and cannot be substituted by, the
 *      university's grant.
 */

const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.MIGRATION_DATABASE_URL ?? APP_URL;

let app: Client;
let owner: Client;

const ids = {
  granted: { tenantId: "", adminId: "", studentA: "", studentB: "" },
  ungranted: { tenantId: "", adminId: "", studentId: "" },
  employer: { employerId: "", orgTenantId: "", userId: "" },
  otherEmployer: { employerId: "", orgTenantId: "", userId: "" },
};

async function asUser<T = Record<string, unknown>>(
  identity: { userId: string; tenantId: string; role: string; employerId?: string },
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await app.query("BEGIN");
  try {
    await app.query(
      `SELECT set_config('app.user_id',$1,true), set_config('app.tenant_id',$2,true),
              set_config('app.user_role',$3,true), set_config('app.employer_id',$4,true)`,
      [identity.userId, identity.tenantId, identity.role, identity.employerId ?? ""],
    );
    const result = await app.query(sql, params);
    await app.query("COMMIT");
    return result.rows as T[];
  } catch (err) {
    await app.query("ROLLBACK");
    throw err;
  }
}

const asEmployer = (which: "employer" | "otherEmployer" = "employer") => ({
  userId: ids[which].userId,
  tenantId: ids[which].orgTenantId,
  role: "employer",
  employerId: ids[which].employerId,
});

const asStudent = (id: string) => ({
  userId: id,
  tenantId: ids.granted.tenantId,
  role: "student",
});

beforeAll(async () => {
  app = new Client({ connectionString: APP_URL });
  owner = new Client({ connectionString: OWNER_URL });
  await app.connect();
  await owner.connect();

  const mkTenant = async (slug: string, name: string) => {
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO tenants (name, slug, email_domains, invite_code)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [name, `p3-${slug}`, [`${slug}.p3test.edu`], `P3-${slug}`],
    );
    return rows[0].id;
  };
  const mkUser = async (
    tenantId: string,
    role: string,
    label: string,
    employerId: string | null = null,
  ) => {
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, full_name, role, employer_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [tenantId, `${label}@p3test.edu`, label, role, employerId],
    );
    return rows[0].id;
  };

  ids.granted.tenantId = await mkTenant("granted", "Granted University");
  ids.granted.adminId = await mkUser(ids.granted.tenantId, "admin", "p3-granted-tpo");
  ids.granted.studentA = await mkUser(ids.granted.tenantId, "student", "p3-student-a");
  ids.granted.studentB = await mkUser(ids.granted.tenantId, "student", "p3-student-b");

  ids.ungranted.tenantId = await mkTenant("ungranted", "Ungranted University");
  ids.ungranted.adminId = await mkUser(ids.ungranted.tenantId, "admin", "p3-ungranted-tpo");
  ids.ungranted.studentId = await mkUser(ids.ungranted.tenantId, "student", "p3-student-c");

  for (const key of ["employer", "otherEmployer"] as const) {
    const orgTenant = await mkTenant(key, `${key} org`);
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO employers (name, slug, email_domains, tenant_id)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [key, `p3-${key}`, [`${key}.test`], orgTenant],
    );
    ids[key].employerId = rows[0].id;
    ids[key].orgTenantId = orgTenant;
    ids[key].userId = await mkUser(orgTenant, "employer", `p3-${key}-user`, rows[0].id);
  }

  // Only the first employer is granted, and only on the granted tenant.
  await owner.query(
    `INSERT INTO employer_access_grants (employer_id, tenant_id, status, granted_at)
     VALUES ($1,$2,'active',now())`,
    [ids.employer.employerId, ids.granted.tenantId],
  );

  // Student A opts in; student B does not.
  await owner.query(
    `INSERT INTO profile_share_consents
       (tenant_id, user_id, employer_id, scope, granted, notice_text)
     VALUES ($1,$2,$3,'full_profile',true,'test notice')`,
    [ids.granted.tenantId, ids.granted.studentA, ids.employer.employerId],
  );
});

afterAll(async () => {
  await owner.query("DELETE FROM employers WHERE slug LIKE 'p3-%'");
  await owner.query("DELETE FROM tenants WHERE slug LIKE 'p3-%'");
  await app.end();
  await owner.end();
});

describe("a grant alone reveals no individual", () => {
  it("shows only the student who opted in, not the whole granted cohort", async () => {
    const rows = await asUser<{ id: string }>(
      asEmployer(),
      "SELECT id FROM users WHERE role = 'student'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(ids.granted.studentA);
  });

  it("hides a student who has not opted in, even in a granted tenant", async () => {
    const rows = await asUser(
      asEmployer(),
      "SELECT id FROM users WHERE id = $1",
      [ids.granted.studentB],
    );
    expect(rows).toHaveLength(0);
  });

  it("hides that student's attempts and readiness score too", async () => {
    for (const table of ["attempts", "readiness_scores", "student_profiles"]) {
      const rows = await asUser(
        asEmployer(),
        `SELECT 1 FROM ${table} WHERE user_id = $1`,
        [ids.granted.studentB],
      );
      expect(rows, `${table} leaked a non-consenting student`).toHaveLength(0);
    }
  });
});

describe("an ungranted university is invisible", () => {
  it("hides its students even when they would otherwise be visible", async () => {
    const rows = await asUser(
      asEmployer(),
      "SELECT id FROM users WHERE tenant_id = $1",
      [ids.ungranted.tenantId],
    );
    expect(rows).toHaveLength(0);
  });

  it("hides the institution's own record", async () => {
    const rows = await asUser(
      asEmployer(),
      "SELECT id FROM tenants WHERE id = $1",
      [ids.ungranted.tenantId],
    );
    expect(rows).toHaveLength(0);
  });
});

describe("an employer with no grant at all", () => {
  it("sees no students anywhere", async () => {
    const rows = await asUser(
      asEmployer("otherEmployer"),
      "SELECT id FROM users WHERE role = 'student'",
    );
    expect(rows).toHaveLength(0);
  });

  it("does not benefit from another employer's opt-in", async () => {
    // Student A shared with `employer`, not with `otherEmployer`.
    const rows = await asUser(
      asEmployer("otherEmployer"),
      "SELECT id FROM users WHERE id = $1",
      [ids.granted.studentA],
    );
    expect(rows).toHaveLength(0);
  });

  it("gets an empty candidate pool", async () => {
    const rows = await asUser(
      asEmployer("otherEmployer"),
      "SELECT * FROM app.employer_candidate_pool(NULL, 1)",
    );
    expect(rows).toHaveLength(0);
  });
});

describe("employers cannot widen their own reach", () => {
  it("cannot insert an already-active grant for themselves", async () => {
    await expect(
      asUser(
        asEmployer(),
        `INSERT INTO employer_access_grants (employer_id, tenant_id, status, granted_at)
         VALUES ($1,$2,'active',now())`,
        [ids.employer.employerId, ids.ungranted.tenantId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("may request access, which lands as pending", async () => {
    await asUser(
      asEmployer(),
      `INSERT INTO employer_access_grants (employer_id, tenant_id, status)
       VALUES ($1,$2,'pending')`,
      [ids.employer.employerId, ids.ungranted.tenantId],
    );
    const { rows } = await owner.query(
      "SELECT status FROM employer_access_grants WHERE employer_id=$1 AND tenant_id=$2",
      [ids.employer.employerId, ids.ungranted.tenantId],
    );
    expect(rows[0].status).toBe("pending");
  });

  it("cannot approve its own pending request", async () => {
    await asUser(
      asEmployer(),
      "UPDATE employer_access_grants SET status = 'active' WHERE employer_id = $1",
      [ids.employer.employerId],
    );
    // No UPDATE policy for employers, so the update matches no rows.
    const { rows } = await owner.query(
      "SELECT status FROM employer_access_grants WHERE employer_id=$1 AND tenant_id=$2",
      [ids.employer.employerId, ids.ungranted.tenantId],
    );
    expect(rows[0].status).toBe("pending");
  });

  it("cannot forge a consent record on a student's behalf", async () => {
    await expect(
      asUser(
        asEmployer(),
        `INSERT INTO profile_share_consents
           (tenant_id, user_id, employer_id, scope, granted, notice_text)
         VALUES ($1,$2,$3,'full_profile',true,'forged')`,
        [ids.granted.tenantId, ids.granted.studentB, ids.employer.employerId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot have staff grant consent on a student's behalf either", async () => {
    await expect(
      asUser(
        { userId: ids.granted.adminId, tenantId: ids.granted.tenantId, role: "admin" },
        `INSERT INTO profile_share_consents
           (tenant_id, user_id, employer_id, scope, granted, notice_text)
         VALUES ($1,$2,$3,'full_profile',true,'by staff')`,
        [ids.granted.tenantId, ids.granted.studentB, ids.employer.employerId],
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("revocation and withdrawal take effect immediately", () => {
  it("hides the student the moment they withdraw", async () => {
    await asUser(
      asStudent(ids.granted.studentA),
      `INSERT INTO profile_share_consents
         (tenant_id, user_id, employer_id, scope, granted, notice_text)
       VALUES ($1,$2,$3,'full_profile',false,'withdrawn')`,
      [ids.granted.tenantId, ids.granted.studentA, ids.employer.employerId],
    );

    const rows = await asUser(
      asEmployer(),
      "SELECT id FROM users WHERE role = 'student'",
    );
    expect(rows).toHaveLength(0);
  });

  it("restores visibility if the student opts back in", async () => {
    await asUser(
      asStudent(ids.granted.studentA),
      `INSERT INTO profile_share_consents
         (tenant_id, user_id, employer_id, scope, granted, notice_text)
       VALUES ($1,$2,$3,'full_profile',true,'re-granted')`,
      [ids.granted.tenantId, ids.granted.studentA, ids.employer.employerId],
    );
    const rows = await asUser(
      asEmployer(),
      "SELECT id FROM users WHERE role = 'student'",
    );
    expect(rows).toHaveLength(1);
  });

  it("hides everything once the university revokes the grant", async () => {
    await owner.query(
      `UPDATE employer_access_grants SET status='revoked', revoked_at=now()
       WHERE employer_id=$1 AND tenant_id=$2`,
      [ids.employer.employerId, ids.granted.tenantId],
    );

    const rows = await asUser(
      asEmployer(),
      "SELECT id FROM users WHERE role = 'student'",
    );
    // The student's consent still stands, but the grant no longer does.
    expect(rows).toHaveLength(0);

    await owner.query(
      `UPDATE employer_access_grants SET status='active', revoked_at=NULL
       WHERE employer_id=$1 AND tenant_id=$2`,
      [ids.employer.employerId, ids.granted.tenantId],
    );
  });

  it("treats an expired grant exactly like a revoked one", async () => {
    await owner.query(
      `UPDATE employer_access_grants SET expires_at = now() - interval '1 day'
       WHERE employer_id=$1 AND tenant_id=$2`,
      [ids.employer.employerId, ids.granted.tenantId],
    );
    const rows = await asUser(
      asEmployer(),
      "SELECT id FROM users WHERE role = 'student'",
    );
    expect(rows).toHaveLength(0);

    await owner.query(
      `UPDATE employer_access_grants SET expires_at = NULL
       WHERE employer_id=$1 AND tenant_id=$2`,
      [ids.employer.employerId, ids.granted.tenantId],
    );
  });
});

describe("an employer can see the institutions they deal with", () => {
  // Regression: the grant list joined `tenants`, which an employer's policy
  // does not admit — their own tenant is their organisation record, not a
  // university. The join silently returned nothing, leaving two pages
  // permanently empty with no error anywhere.

  it("lists their own grants with the institution named", async () => {
    const rows = await asUser<{ tenant_name: string; status: string }>(
      asEmployer(),
      "SELECT * FROM app.employer_grants()",
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => Boolean(r.tenant_name))).toBe(true);
  });

  it("shows pending and revoked grants too, not only active ones", async () => {
    const rows = await asUser<{ status: string }>(
      asEmployer(),
      "SELECT * FROM app.employer_grants()",
    );
    // The suite has created a pending request on the ungranted tenant.
    expect(rows.map((r) => r.status)).toContain("pending");
  });

  it("returns another employer's grants to nobody", async () => {
    const mine = await asUser<{ tenant_id: string }>(
      asEmployer("otherEmployer"),
      "SELECT * FROM app.employer_grants()",
    );
    // otherEmployer holds no grants at all.
    expect(mine).toHaveLength(0);
  });

  it("offers a directory of institutions without leaking invite codes", async () => {
    const rows = await asUser<Record<string, unknown>>(
      asEmployer(),
      "SELECT * FROM app.institution_directory()",
    );
    expect(rows.length).toBeGreaterThan(0);
    // Only an id and a name: an invite code would let the holder register as
    // one of that university's students.
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(["id", "name"]);
    }
  });

  it("excludes employer organisation tenants from the directory", async () => {
    const rows = await asUser<{ id: string }>(
      asEmployer(),
      "SELECT * FROM app.institution_directory()",
    );
    const listed = rows.map((r) => r.id);
    // Employer orgs carry a tenant row to satisfy the identity model; they are
    // not places anyone studies, so they must not be offered.
    expect(listed).not.toContain(ids.employer.orgTenantId);
    expect(listed).not.toContain(ids.otherEmployer.orgTenantId);
    // Real institutions are.
    expect(listed).toContain(ids.granted.tenantId);
  });

  it("cannot read the tenant row of an institution it deals with", async () => {
    // The reason both fixes above exist, asserted directly: a grant is not
    // read access to the university's own row, which carries its invite code.
    const rows = await asUser<{ id: string }>(
      asEmployer(),
      "SELECT id FROM tenants WHERE id = $1",
      [ids.granted.tenantId],
    );
    expect(rows).toHaveLength(0);
  });

  it("still reaches an opted-in student without joining tenants", async () => {
    // Regression: the shared-profiles list inner-joined `tenants` for the
    // institution name and therefore returned nothing, so a student could opt
    // in and never appear. Consent and identity are both readable; only the
    // name had to come from elsewhere.
    const rows = await asUser<{ user_id: string; full_name: string }>(
      asEmployer(),
      `SELECT c.user_id, u.full_name
         FROM profile_share_consents c
         JOIN users u ON u.id = c.user_id
        WHERE c.employer_id = $1 AND c.granted`,
      [ids.employer.employerId],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.user_id)).toContain(ids.granted.studentA);
    expect(rows.every((r) => Boolean(r.full_name))).toBe(true);

    // And the grant function supplies the institution name for that row.
    const grants = await asUser<{ tenant_id: string; tenant_name: string }>(
      asEmployer(),
      "SELECT * FROM app.employer_grants()",
    );
    const named = grants.find((g) => g.tenant_id === ids.granted.tenantId);
    expect(named?.tenant_name).toBeTruthy();
  });

  it("gives a non-employer nothing from either function", async () => {
    const grants = await asUser(
      asStudent(ids.granted.studentA),
      "SELECT * FROM app.employer_grants()",
    );
    const directory = await asUser(
      asStudent(ids.granted.studentA),
      "SELECT * FROM app.institution_directory()",
    );
    expect(grants).toHaveLength(0);
    expect(directory).toHaveLength(0);
  });
});

describe("students can see who they are deciding about", () => {
  it("shows an employer with active access to their institution", async () => {
    const rows = await asUser<{ id: string }>(
      asStudent(ids.granted.studentA),
      "SELECT id FROM employers",
    );
    expect(rows.map((r) => r.id)).toContain(ids.employer.employerId);
  });

  it("hides an employer whose grant is only pending", async () => {
    // A student cannot act on an employer who cannot see their cohort anyway.
    const rows = await asUser<{ id: string }>(
      asStudent(ids.granted.studentA),
      "SELECT id FROM employers",
    );
    expect(rows.map((r) => r.id)).not.toContain(ids.otherEmployer.employerId);
  });

  it("hides the employer again once the grant is revoked", async () => {
    await owner.query(
      `UPDATE employer_access_grants SET status='revoked', revoked_at=now()
       WHERE employer_id=$1 AND tenant_id=$2`,
      [ids.employer.employerId, ids.granted.tenantId],
    );
    const rows = await asUser<{ id: string }>(
      asStudent(ids.granted.studentA),
      "SELECT id FROM employers",
    );
    expect(rows.map((r) => r.id)).not.toContain(ids.employer.employerId);

    await owner.query(
      `UPDATE employer_access_grants SET status='active', revoked_at=NULL
       WHERE employer_id=$1 AND tenant_id=$2`,
      [ids.employer.employerId, ids.granted.tenantId],
    );
  });

  it("does not show an employer to a student at a different institution", async () => {
    const rows = await asUser<{ id: string }>(
      {
        userId: ids.ungranted.studentId,
        tenantId: ids.ungranted.tenantId,
        role: "student",
      },
      "SELECT id FROM employers",
    );
    expect(rows).toHaveLength(0);
  });
});

describe("resumes stay off-limits to employers entirely", () => {
  it("hides a resume even for a student who opted in", async () => {
    await owner.query(
      `INSERT INTO resumes
         (tenant_id, user_id, file_name, content_type, size_bytes, storage_key, retain_until)
       VALUES ($1,$2,'cv.pdf','application/pdf',10,'k/p3', now() + interval '90 days')`,
      [ids.granted.tenantId, ids.granted.studentA],
    );
    const rows = await asUser(asEmployer(), "SELECT id FROM resumes");
    expect(rows).toHaveLength(0);
  });
});

describe("verified profiles", () => {
  it("are private to their owner", async () => {
    await owner.query(
      `INSERT INTO verified_profiles
         (tenant_id, user_id, public_id, token_hash, snapshot)
       VALUES ($1,$2,'SG-P3TEST','hash-p3','{}'::jsonb)`,
      [ids.granted.tenantId, ids.granted.studentA],
    );

    const owned = await asUser(
      asStudent(ids.granted.studentA),
      "SELECT id FROM verified_profiles",
    );
    expect(owned).toHaveLength(1);

    for (const identity of [
      asStudent(ids.granted.studentB),
      { userId: ids.granted.adminId, tenantId: ids.granted.tenantId, role: "admin" },
      asEmployer(),
    ]) {
      const rows = await asUser(identity, "SELECT id FROM verified_profiles");
      expect(rows).toHaveLength(0);
    }
  });

  it("resolve by token hash regardless of who is asking", async () => {
    const rows = await asUser(
      asStudent(ids.granted.studentB),
      "SELECT * FROM app.resolve_verified_profile('hash-p3')",
    );
    expect(rows).toHaveLength(1);
  });

  it("stop resolving once revoked", async () => {
    await owner.query(
      "UPDATE verified_profiles SET revoked_at = now() WHERE token_hash = 'hash-p3'",
    );
    const rows = await asUser(
      asStudent(ids.granted.studentB),
      "SELECT * FROM app.resolve_verified_profile('hash-p3')",
    );
    expect(rows).toHaveLength(0);
  });
});
