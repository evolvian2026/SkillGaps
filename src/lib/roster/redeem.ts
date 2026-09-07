import "server-only";
import { sql } from "drizzle-orm";
import { rawDb, withRequestContext } from "@/lib/db/client";
import { consentRecords } from "@/lib/db/schema";
import {
  CONSENT_NOTICE,
  CONSENT_POLICY_KEY,
  CONSENT_VERSION,
} from "@/lib/privacy/consent";
import { assertPasswordStrength, hashPassword } from "@/lib/auth/password";
import { AuthError, type SessionUser, type UserRole } from "@/lib/auth/types";
import { hashJoinToken } from "./import";

/**
 * Redeeming a roster invitation.
 *
 * The redeemer has no identity yet — no user id, no tenant, no role — so every
 * database call here goes through a SECURITY DEFINER function rather than a
 * row policy. Reading back through the ordinary client would return nothing
 * and leave the caller dereferencing an empty result, which is exactly how
 * employer signup used to crash.
 */

export interface InvitationPreview {
  email: string;
  fullName: string;
  rollNumber: string | null;
  branch: string | null;
  section: string | null;
  batchYear: number | null;
  tenantName: string;
}

/** Rejects anything that cannot be a join token before it reaches the database. */
export function isWellFormedJoinToken(token: unknown): token is string {
  return (
    typeof token === "string" &&
    token.length >= 32 &&
    token.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(token)
  );
}

/**
 * What to show on the join page.
 *
 * Returns null for a token that is unknown, already redeemed, revoked or
 * expired — the caller cannot tell those apart, so a guessed token reveals
 * nothing about whether it ever existed.
 */
export async function previewInvitation(
  token: string,
): Promise<InvitationPreview | null> {
  if (!isWellFormedJoinToken(token)) return null;

  const result = await rawDb().execute(
    sql`SELECT * FROM app.roster_invitation_preview(${hashJoinToken(token)})`,
  );
  const row = (result.rows as Record<string, unknown>[])[0];
  if (!row) return null;

  return {
    email: row.email as string,
    fullName: row.full_name as string,
    rollNumber: (row.roll_number as string | null) ?? null,
    branch: (row.branch as string | null) ?? null,
    section: (row.section as string | null) ?? null,
    batchYear: (row.batch_year as number | null) ?? null,
    tenantName: row.tenant_name as string,
  };
}

export interface RedeemInput {
  token: string;
  password: string;
  consentGranted: boolean;
}

/**
 * Turns an invitation into an account.
 *
 * Consent is written in the *new user's own* context, under the same RLS that
 * will later govern reading it — the institution cannot consent on a student's
 * behalf, and importing a roster deliberately did not try to.
 */
export async function redeemInvitation(input: RedeemInput): Promise<SessionUser> {
  if (!isWellFormedJoinToken(input.token)) {
    throw new AuthError("This invitation link is not valid.", "unknown_tenant");
  }

  const weak = assertPasswordStrength(input.password);
  if (weak) throw new AuthError(weak, "weak_password");

  const passwordHash = await hashPassword(input.password);

  let row: Record<string, unknown> | undefined;
  try {
    const result = await rawDb().execute(
      sql`SELECT * FROM app.redeem_roster_invitation(
            ${hashJoinToken(input.token)}, ${passwordHash}
          )`,
    );
    row = (result.rows as Record<string, unknown>[])[0];
  } catch (err) {
    if (err instanceof Error && /invitation_not_redeemable/.test(err.message)) {
      throw new AuthError(
        "This invitation has already been used, or it has expired. Ask your placement office for a new link.",
        "unknown_tenant",
      );
    }
    if (err instanceof Error && /users_email_key/.test(err.message)) {
      throw new AuthError(
        "An account already exists for this email address. Sign in instead.",
        "email_taken",
      );
    }
    throw err;
  }
  if (!row) {
    throw new AuthError("This invitation could not be used.", "unknown_tenant");
  }

  const user: SessionUser = {
    userId: row.user_id as string,
    tenantId: row.tenant_id as string,
    role: "student" as UserRole,
    email: row.email as string,
    fullName: row.full_name as string,
    employerId: null,
  };

  await withRequestContext(
    { userId: user.userId, tenantId: user.tenantId, role: "student" },
    async (tx) => {
      await tx.insert(consentRecords).values({
        tenantId: user.tenantId,
        userId: user.userId,
        policyKey: CONSENT_POLICY_KEY,
        policyVersion: CONSENT_VERSION,
        granted: input.consentGranted,
        noticeText: CONSENT_NOTICE,
      });
    },
  );

  return user;
}
