import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

/**
 * Employer account creation.
 *
 * This exists because of a real crash: the code created the user through a
 * SECURITY DEFINER function, then ran a *second* query to find that user's
 * tenant. Signup has no identity set, so the `users` policy correctly returned
 * nothing and the caller dereferenced an empty result —
 * "Cannot read properties of undefined (reading 'tenant_id')".
 *
 * The invariant: creating an account must return everything the caller needs,
 * because at that moment there is no session with which to look anything up.
 */

let owner: Client;
let app: Client;
let employerId: string;
let orgTenantId: string;

beforeAll(async () => {
  owner = new Client({
    connectionString: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL,
  });
  app = new Client({ connectionString: process.env.DATABASE_URL });
  await owner.connect();
  await app.connect();

  const { rows: tenant } = await owner.query<{ id: string }>(
    `INSERT INTO tenants (name, slug, email_domains, invite_code)
     VALUES ('Signup Test Org','signuptest-org','{}','SIGNUPORG') RETURNING id`,
  );
  orgTenantId = tenant[0].id;

  const { rows: employer } = await owner.query<{ id: string }>(
    `INSERT INTO employers (name, slug, email_domains, tenant_id)
     VALUES ('Signup Test Co','signuptest','{signuptest.example}',$1) RETURNING id`,
    [orgTenantId],
  );
  employerId = employer[0].id;
});

afterAll(async () => {
  await owner.query("DELETE FROM employers WHERE slug = 'signuptest'");
  await owner.query("DELETE FROM tenants WHERE slug = 'signuptest-org'");
  await app.end();
  await owner.end();
});

describe("app.create_employer_user", () => {
  it("returns the tenant, so no follow-up read is needed", async () => {
    // Deliberately run with NO identity GUCs — exactly the state signup is in.
    const { rows } = await app.query<{ user_id: string; tenant_id: string }>(
      "SELECT * FROM app.create_employer_user($1,$2,$3,$4)",
      [employerId, "new.recruiter@signuptest.example", "New Recruiter", "hash"],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBeTruthy();
    expect(rows[0].tenant_id).toBe(orgTenantId);
  });

  it("cannot be used to mint a non-employer account", async () => {
    // The role is fixed inside the function, whatever the caller wants.
    const { rows } = await app.query<{ user_id: string }>(
      "SELECT * FROM app.create_employer_user($1,$2,$3,$4)",
      [employerId, "another@signuptest.example", "Another", "hash"],
    );
    const { rows: created } = await owner.query<{ role: string }>(
      "SELECT role FROM users WHERE id = $1",
      [rows[0].user_id],
    );
    expect(created[0].role).toBe("employer");
  });

  it("refuses an employer with no organisation tenant", async () => {
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO employers (name, slug, email_domains, tenant_id)
       VALUES ('No Tenant Co','signuptest-notenant','{}',NULL) RETURNING id`,
    );
    await expect(
      app.query("SELECT * FROM app.create_employer_user($1,$2,$3,$4)", [
        rows[0].id,
        "x@signuptest.example",
        "X",
        "hash",
      ]),
    ).rejects.toThrow(/no organisation tenant/i);
    await owner.query("DELETE FROM employers WHERE slug = 'signuptest-notenant'");
  });
});

describe("app.resolve_employer_by_domain", () => {
  it("matches an active employer by email domain, case-insensitively", async () => {
    const { rows } = await app.query<{ employer_id: string }>(
      "SELECT * FROM app.resolve_employer_by_domain($1)",
      ["SignupTest.Example"],
    );
    expect(rows[0]?.employer_id).toBe(employerId);
  });

  it("returns nothing for an unknown domain", async () => {
    const { rows } = await app.query(
      "SELECT * FROM app.resolve_employer_by_domain($1)",
      ["unknown-company.example"],
    );
    expect(rows).toHaveLength(0);
  });

  it("returns nothing for an inactive employer", async () => {
    await owner.query("UPDATE employers SET is_active = false WHERE id = $1", [
      employerId,
    ]);
    const { rows } = await app.query(
      "SELECT * FROM app.resolve_employer_by_domain($1)",
      ["signuptest.example"],
    );
    expect(rows).toHaveLength(0);
    await owner.query("UPDATE employers SET is_active = true WHERE id = $1", [
      employerId,
    ]);
  });

  it("returns nothing for an empty domain", async () => {
    const { rows } = await app.query(
      "SELECT * FROM app.resolve_employer_by_domain($1)",
      [""],
    );
    expect(rows).toHaveLength(0);
  });
});
