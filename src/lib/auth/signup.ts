import "server-only";
import { sql } from "drizzle-orm";
import { rawDb, withRequestContext } from "@/lib/db/client";
import { consentRecords } from "@/lib/db/schema";
import { CONSENT_NOTICE, CONSENT_POLICY_KEY, CONSENT_VERSION } from "@/lib/privacy/consent";
import { assertPasswordStrength, hashPassword, verifyPassword } from "./password";
import { AuthError, type SessionUser, type UserRole } from "./types";

export function emailDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

/**
 * Resolve which university a signup belongs to.
 *
 * Invite code wins when supplied, so a student on a personal address can still
 * join. Otherwise the email domain is matched against the tenant's registered
 * domains. No match means no account: we never silently create an orphan
 * tenant-less user, because a row with no tenant would sit outside RLS's reach.
 */
export async function resolveSignupTenant(
  email: string,
  inviteCode: string | null,
): Promise<{ tenantId: string; tenantName: string }> {
  const result = await rawDb().execute(
    sql`SELECT * FROM app.resolve_signup_tenant(${inviteCode ?? ""}, ${emailDomain(email)})`,
  );
  const row = (result.rows as Record<string, unknown>[])[0];
  if (!row) {
    throw new AuthError(
      "We could not match you to a university. Check your invite code, or sign up with your college email address.",
      "unknown_tenant",
    );
  }
  return { tenantId: row.tenant_id as string, tenantName: row.tenant_name as string };
}

export interface SignupInput {
  email: string;
  password: string;
  fullName: string;
  inviteCode: string | null;
  consentGranted: boolean;
}

export async function registerStudent(input: SignupInput): Promise<SessionUser> {
  const email = input.email.trim().toLowerCase();
  const { tenantId } = await resolveSignupTenant(email, input.inviteCode);

  const weak = assertPasswordStrength(input.password);
  if (weak) throw new AuthError(weak, "weak_password");

  const passwordHash = await hashPassword(input.password);

  let userId: string;
  try {
    const result = await rawDb().execute(
      sql`SELECT app.create_student(
            ${tenantId}::uuid, ${email}, ${input.fullName.trim()},
            ${passwordHash}, ${null}
          ) AS id`,
    );
    userId = (result.rows as Record<string, unknown>[])[0].id as string;
  } catch (err) {
    if (err instanceof Error && /users_email_key/.test(err.message)) {
      throw new AuthError("An account already exists for this email.", "email_taken");
    }
    throw err;
  }

  const user: SessionUser = {
    userId,
    tenantId,
    role: "student" as UserRole,
    email,
    fullName: input.fullName.trim(),
    employerId: null,
  };

  // Recorded as an event, in the new user's own context, so the consent row is
  // written under the same RLS rules that will later govern reading it.
  await withRequestContext(
    { userId, tenantId, role: "student" },
    async (tx) => {
      await tx.insert(consentRecords).values({
        tenantId,
        userId,
        policyKey: CONSENT_POLICY_KEY,
        policyVersion: CONSENT_VERSION,
        granted: input.consentGranted,
        noticeText: CONSENT_NOTICE,
      });
    },
  );

  return user;
}

/**
 * A real scrypt hash of a value nobody can supply. Used to keep the cost of a
 * failed lookup identical to the cost of a wrong password.
 */
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$" +
  "Ea3JmJ3xGxhZC1PZQ1kUxJXkCQ0iZ8bqLpVvE5oR4Jt0Wv8xQKz9nS7mYc2bH1dGfN3sT6uP0aXwL4kM8vB2Ag";

export interface EmployerSignupInput {
  email: string;
  password: string;
  fullName: string;
}

/**
 * Registers an employer user.
 *
 * The organisation is resolved from the email domain, so an employer account
 * can only be created against an organisation the platform has already set up
 * — there is no self-serve path to inventing one. The role is fixed inside
 * `app.create_employer_user`, so this form cannot mint any other kind of
 * account.
 */
export async function registerEmployerUser(
  input: EmployerSignupInput,
): Promise<SessionUser> {
  const email = input.email.trim().toLowerCase();

  const lookup = await rawDb().execute(
    sql`SELECT * FROM app.resolve_employer_by_domain(${emailDomain(email)})`,
  );
  const org = (lookup.rows as Record<string, unknown>[])[0];
  if (!org) {
    throw new AuthError(
      "We could not match that email address to a registered employer. Contact your SkillGaps administrator to have your organisation added.",
      "unknown_tenant",
    );
  }

  const weak = assertPasswordStrength(input.password);
  if (weak) throw new AuthError(weak, "weak_password");

  const passwordHash = await hashPassword(input.password);

  // The function returns the tenant it inserted into. Looking it up afterwards
  // would mean reading `users` with no identity set, which RLS correctly
  // refuses — leaving the caller to dereference an empty result.
  let userId: string;
  let tenantId: string;
  try {
    const result = await rawDb().execute(
      sql`SELECT * FROM app.create_employer_user(
            ${org.employer_id as string}::uuid, ${email},
            ${input.fullName.trim()}, ${passwordHash}
          )`,
    );
    const row = (result.rows as Record<string, unknown>[])[0];
    if (!row) throw new Error("Employer account was not created.");
    userId = row.user_id as string;
    tenantId = row.tenant_id as string;
  } catch (err) {
    if (err instanceof Error && /users_email_key/.test(err.message)) {
      throw new AuthError("An account already exists for this email.", "email_taken");
    }
    throw err;
  }

  return {
    userId,
    tenantId,
    role: "employer" as UserRole,
    email,
    fullName: input.fullName.trim(),
    employerId: org.employer_id as string,
  };
}

export async function authenticate(
  email: string,
  password: string,
): Promise<SessionUser> {
  const result = await rawDb().execute(
    sql`SELECT * FROM app.credential_for_login(${email.trim().toLowerCase()})`,
  );
  const row = (result.rows as Record<string, unknown>[])[0];

  // Verify against a throwaway hash when the email is unknown, so that an
  // unregistered address costs the same time as a wrong password and cannot be
  // distinguished by timing.
  const ok = await verifyPassword(
    password,
    (row?.password_hash as string | null) ?? DUMMY_HASH,
  );
  if (!row || !ok) {
    throw new AuthError("Incorrect email or password.", "invalid_credentials");
  }

  await rawDb().execute(sql`SELECT app.touch_last_login(${row.user_id as string}::uuid)`);

  return {
    userId: row.user_id as string,
    tenantId: row.tenant_id as string,
    role: row.user_role as UserRole,
    email: email.trim().toLowerCase(),
    fullName: row.full_name as string,
    employerId: (row.employer_id as string | null) ?? null,
  };
}
