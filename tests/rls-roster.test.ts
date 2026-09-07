import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { Client } from "pg";

/**
 * Roster invitation isolation.
 *
 * A roster is a list of every student's name and email address at an
 * institution, so the interesting questions are all about who may read it, and
 * what a stranger holding a guessed link can learn. Tested against a real
 * database as the real application role.
 */

const APP_URL = process.env.DATABASE_URL!;
const OWNER_URL = process.env.MIGRATION_DATABASE_URL ?? APP_URL;

let app: Client;
let owner: Client;

const ids = {
  home: { tenantId: "", adminId: "", studentId: "" },
  other: { tenantId: "", adminId: "" },
  invitation: { pending: "", expired: "", revoked: "" },
};

const tokens = { pending: "", expired: "", revoked: "", unknown: "" };

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const freshToken = () => randomBytes(32).toString("base64url");

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

/** No identity at all — the state a student redeeming a link is actually in. */
async function asStranger<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await app.query(sql, params);
  return result.rows as T[];
}

const asAdmin = (which: "home" | "other" = "home") => ({
  userId: ids[which].adminId,
  tenantId: ids[which].tenantId,
  role: "admin",
});

async function seedInvitation(
  tenantId: string,
  email: string,
  token: string,
  overrides: { status?: string; expiresInDays?: number } = {},
): Promise<string> {
  // The expiry is passed as a number of days and turned into an interval in
  // SQL: a bind parameter is a value, never an expression like `now() + ...`.
  const { rows } = await owner.query<{ id: string }>(
    `INSERT INTO roster_invitations
       (tenant_id, email, full_name, roll_number, branch, section, batch_year,
        token_hash, status, expires_at)
     VALUES ($1,$2,$3,'R-1','CSE','A',2026,$4,$5,
             now() + make_interval(days => $6::int))
     RETURNING id`,
    [
      tenantId,
      email,
      `Roster ${email.split("@")[0]}`,
      hash(token),
      overrides.status ?? "pending",
      overrides.expiresInDays ?? 30,
    ],
  );
  return rows[0].id;
}

beforeAll(async () => {
  app = new Client({ connectionString: APP_URL });
  owner = new Client({ connectionString: OWNER_URL });
  await app.connect();
  await owner.connect();

  for (const key of ["home", "other"] as const) {
    const { rows } = await owner.query<{ id: string }>(
      `INSERT INTO tenants (name, slug, email_domains, invite_code)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [`Roster ${key}`, `ros-${key}`, [`ros-${key}.edu.in`], `ROS-${key.toUpperCase()}`],
    );
    ids[key].tenantId = rows[0].id;

    const admin = await owner.query<{ id: string }>(
      `INSERT INTO users (tenant_id, email, full_name, role)
       VALUES ($1,$2,'Roster Admin','admin') RETURNING id`,
      [rows[0].id, `admin@ros-${key}.edu.in`],
    );
    ids[key].adminId = admin.rows[0].id;
  }

  const student = await owner.query<{ id: string }>(
    `INSERT INTO users (tenant_id, email, full_name, role)
     VALUES ($1,'student@ros-home.edu.in','Roster Student','student') RETURNING id`,
    [ids.home.tenantId],
  );
  ids.home.studentId = student.rows[0].id;

  tokens.pending = freshToken();
  tokens.expired = freshToken();
  tokens.revoked = freshToken();
  tokens.unknown = freshToken();

  ids.invitation.pending = await seedInvitation(
    ids.home.tenantId,
    "pending@ros-home.edu.in",
    tokens.pending,
  );
  ids.invitation.expired = await seedInvitation(
    ids.home.tenantId,
    "expired@ros-home.edu.in",
    tokens.expired,
    { expiresInDays: -1 },
  );
  ids.invitation.revoked = await seedInvitation(
    ids.home.tenantId,
    "revoked@ros-home.edu.in",
    tokens.revoked,
    { status: "revoked" },
  );
});

afterAll(async () => {
  await owner.query("DELETE FROM tenants WHERE slug LIKE 'ros-%'");
  await app.end();
  await owner.end();
});

describe("a roster belongs to its institution", () => {
  it("lets staff read their own roster", async () => {
    const rows = await asUser(
      asAdmin(),
      "SELECT id FROM roster_invitations WHERE tenant_id = $1",
      [ids.home.tenantId],
    );
    expect(rows).toHaveLength(3);
  });

  it("shows another institution's staff nothing of it", async () => {
    const rows = await asUser(
      asAdmin("other"),
      "SELECT id FROM roster_invitations WHERE tenant_id = $1",
      [ids.home.tenantId],
    );
    expect(rows).toHaveLength(0);
  });

  it("hides the roster from students, including their own institution's", async () => {
    // A roster is a directory of every classmate's name and email address.
    const rows = await asUser(
      { userId: ids.home.studentId, tenantId: ids.home.tenantId, role: "student" },
      "SELECT id FROM roster_invitations",
    );
    expect(rows).toHaveLength(0);
  });

  it("refuses staff writing an invitation into another institution", async () => {
    await expect(
      asUser(
        asAdmin("other"),
        `INSERT INTO roster_invitations
           (tenant_id, email, full_name, token_hash, expires_at)
         VALUES ($1,'smuggled@x.in','Smuggled',$2, now() + interval '1 day')`,
        [ids.home.tenantId, hash(freshToken())],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("refuses staff revoking another institution's invitation", async () => {
    const updated = await asUser(
      asAdmin("other"),
      `UPDATE roster_invitations SET status = 'revoked'
        WHERE id = $1 RETURNING id`,
      [ids.invitation.pending],
    );
    // Not an error — simply no row is visible to update, which is the same
    // outcome and the reason the application also filters on tenant_id.
    expect(updated).toHaveLength(0);
  });

  it("refuses a student writing themselves onto a roster", async () => {
    await expect(
      asUser(
        { userId: ids.home.studentId, tenantId: ids.home.tenantId, role: "student" },
        `INSERT INTO roster_invitations
           (tenant_id, email, full_name, token_hash, expires_at)
         VALUES ($1,'self@ros-home.edu.in','Self',$2, now() + interval '1 day')`,
        [ids.home.tenantId, hash(freshToken())],
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe("previewing a join link", () => {
  it("resolves a live token for someone with no identity at all", async () => {
    const rows = await asStranger<{ email: string; tenant_name: string }>(
      "SELECT * FROM app.roster_invitation_preview($1)",
      [hash(tokens.pending)],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("pending@ros-home.edu.in");
    expect(rows[0].tenant_name).toBe("Roster home");
  });

  it("returns only that one student's own details", async () => {
    const rows = await asStranger<Record<string, unknown>>(
      "SELECT * FROM app.roster_invitation_preview($1)",
      [hash(tokens.pending)],
    );
    expect(Object.keys(rows[0]).sort()).toEqual([
      "batch_year",
      "branch",
      "email",
      "full_name",
      "roll_number",
      "section",
      "tenant_name",
    ]);
  });

  it("gives nothing for an unknown, expired or revoked token alike", async () => {
    // Indistinguishable on purpose: a guessed token must not reveal whether it
    // ever existed.
    for (const token of [tokens.unknown, tokens.expired, tokens.revoked]) {
      const rows = await asStranger(
        "SELECT * FROM app.roster_invitation_preview($1)",
        [hash(token)],
      );
      expect(rows).toHaveLength(0);
    }
  });
});

describe("redeeming a join link", () => {
  it("creates the student, their profile, and returns the tenant", async () => {
    const token = freshToken();
    await seedInvitation(ids.home.tenantId, "redeemer@ros-home.edu.in", token);

    const rows = await asStranger<{
      user_id: string;
      tenant_id: string;
      email: string;
    }>("SELECT * FROM app.redeem_roster_invitation($1,$2)", [hash(token), "hash-1"]);

    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("redeemer@ros-home.edu.in");
    // Returned rather than looked up: the caller has no identity yet, so a
    // follow-up read of `users` would correctly return nothing.
    expect(rows[0].tenant_id).toBe(ids.home.tenantId);

    const { rows: profile } = await owner.query(
      `SELECT roll_number, branch, section, batch_year, tenant_id
         FROM student_profiles WHERE user_id = $1`,
      [rows[0].user_id],
    );
    expect(profile[0]).toMatchObject({
      roll_number: "R-1",
      branch: "CSE",
      section: "A",
      batch_year: 2026,
      tenant_id: ids.home.tenantId,
    });

    const { rows: user } = await owner.query(
      "SELECT role FROM users WHERE id = $1",
      [rows[0].user_id],
    );
    // The role is fixed inside the function; nothing a redeemer supplies can
    // change what kind of account this mints.
    expect(user[0].role).toBe("student");
  });

  it("is single-use: the same link cannot be redeemed twice", async () => {
    const token = freshToken();
    await seedInvitation(ids.home.tenantId, "twice@ros-home.edu.in", token);

    await asStranger("SELECT * FROM app.redeem_roster_invitation($1,$2)", [
      hash(token),
      "hash-1",
    ]);
    await expect(
      asStranger("SELECT * FROM app.redeem_roster_invitation($1,$2)", [
        hash(token),
        "hash-2",
      ]),
    ).rejects.toThrow(/invitation_not_redeemable/);
  });

  it("refuses an expired invitation", async () => {
    await expect(
      asStranger("SELECT * FROM app.redeem_roster_invitation($1,$2)", [
        hash(tokens.expired),
        "hash-1",
      ]),
    ).rejects.toThrow(/invitation_not_redeemable/);
  });

  it("refuses a revoked invitation", async () => {
    await expect(
      asStranger("SELECT * FROM app.redeem_roster_invitation($1,$2)", [
        hash(tokens.revoked),
        "hash-1",
      ]),
    ).rejects.toThrow(/invitation_not_redeemable/);
  });

  it("refuses an unknown token without saying it is unknown", async () => {
    await expect(
      asStranger("SELECT * FROM app.redeem_roster_invitation($1,$2)", [
        hash(tokens.unknown),
        "hash-1",
      ]),
    ).rejects.toThrow(/invitation_not_redeemable/);
  });

  it("leaves the invitation marked accepted and linked to the account", async () => {
    const token = freshToken();
    const id = await seedInvitation(ids.home.tenantId, "linked@ros-home.edu.in", token);
    const rows = await asStranger<{ user_id: string }>(
      "SELECT * FROM app.redeem_roster_invitation($1,$2)",
      [hash(token), "hash-1"],
    );

    const { rows: after } = await owner.query(
      "SELECT status, accepted_at, accepted_user_id FROM roster_invitations WHERE id = $1",
      [id],
    );
    expect(after[0].status).toBe("accepted");
    expect(after[0].accepted_at).not.toBeNull();
    expect(after[0].accepted_user_id).toBe(rows[0].user_id);
  });

  it("stores only the hash, so the table never holds a working link", async () => {
    const { rows } = await owner.query<{ token_hash: string }>(
      "SELECT token_hash FROM roster_invitations WHERE id = $1",
      [ids.invitation.pending],
    );
    expect(rows[0].token_hash).toBe(hash(tokens.pending));
    expect(rows[0].token_hash).not.toContain(tokens.pending);
  });
});
