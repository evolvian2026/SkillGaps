import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { rosterInvitations, users } from "@/lib/db/schema";
import type { RosterRow, RosterRowError } from "./csv";
import { INVITATION_TTL_DAYS, type IssuedLink } from "./shared";

export { INVITATION_TTL_DAYS, type IssuedLink };

/**
 * Turning a parsed roster into invitations.
 *
 * Split into a preview and a commit that share one classifier, so what the TPO
 * approves is exactly what runs. A roster import is the first thing a new
 * institution does with the product, on data they did not check, at a size
 * where they cannot eyeball the result — so it shows its work before writing
 * anything.
 */

const INVITE_TOKEN_BYTES = 32;

export function issueJoinToken(): { token: string; tokenHash: string } {
  const token = randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
  return { token, tokenHash: hashJoinToken(token) };
}

export function hashJoinToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function joinUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/join/${token}`;
}

/** What will happen to one row if the import is committed. */
export type RosterAction = "invite" | "update" | "reinvite" | "skip_registered";

export interface ClassifiedRow {
  row: RosterRow;
  action: RosterAction;
  /** Shown next to the row so the count is never unexplained. */
  reason: string;
}

export interface RosterPreview {
  classified: ClassifiedRow[];
  errors: RosterRowError[];
  ignoredColumns: string[];
  counts: Record<RosterAction, number>;
}

const ACTION_REASON: Record<RosterAction, string> = {
  invite: "New — will be invited",
  update: "Already invited — roster details will be updated, link unchanged",
  reinvite: "Invitation lapsed or was revoked — a fresh link will be issued",
  skip_registered: "Already has an account — left alone",
};

/**
 * Decides what happens to each row, without writing anything.
 *
 * The three lookups are batched rather than done per row: a 2,000-student
 * roster would otherwise be 4,000 round trips, which is slow enough that a TPO
 * assumes the page has hung.
 */
export async function classifyRoster(
  tx: Db,
  tenantId: string,
  rows: RosterRow[],
): Promise<ClassifiedRow[]> {
  if (rows.length === 0) return [];
  const emails = rows.map((r) => r.email);

  // An account may exist in another tenant entirely — email is globally
  // unique — so this read is deliberately not tenant-scoped in the query. RLS
  // still confines it to rows this staff member may see, which means a
  // collision with another institution's student surfaces at commit time as a
  // duplicate-key error rather than here. That is the safe direction: we never
  // reveal that an address belongs to somebody at another college.
  const registered = await tx
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.email, emails));
  const hasAccount = new Set(registered.map((r) => r.email));

  const existing = await tx
    .select({
      email: rosterInvitations.email,
      status: rosterInvitations.status,
      expiresAt: rosterInvitations.expiresAt,
    })
    .from(rosterInvitations)
    .where(
      and(
        eq(rosterInvitations.tenantId, tenantId),
        inArray(rosterInvitations.email, emails),
      ),
    );
  const invited = new Map(existing.map((r) => [r.email, r]));

  const now = new Date();
  return rows.map((row) => {
    let action: RosterAction;
    if (hasAccount.has(row.email)) {
      action = "skip_registered";
    } else {
      const prior = invited.get(row.email);
      if (!prior) action = "invite";
      else if (prior.status === "accepted") action = "skip_registered";
      else if (prior.status === "revoked" || prior.expiresAt <= now) action = "reinvite";
      else action = "update";
    }
    return { row, action, reason: ACTION_REASON[action] };
  });
}

export function countActions(classified: ClassifiedRow[]): Record<RosterAction, number> {
  const counts: Record<RosterAction, number> = {
    invite: 0,
    update: 0,
    reinvite: 0,
    skip_registered: 0,
  };
  for (const c of classified) counts[c.action]++;
  return counts;
}

export interface CommitResult {
  invited: number;
  updated: number;
  reinvited: number;
  skipped: number;
  /** Rows that lost a race with a concurrent signup, reported not swallowed. */
  failed: { email: string; message: string }[];
  /**
   * The join links minted by this import, returned once and never again.
   *
   * Only the hash is stored, so there is no way to recover a link later — the
   * same property that makes a database dump useless also means we cannot
   * re-display one. A row that kept its existing link is deliberately absent
   * here rather than shown blank: reissuing is an explicit act, because it
   * invalidates whatever was already sent to that student.
   */
  links: IssuedLink[];
}

/**
 * Writes the invitations a preview described.
 *
 * Re-classifies rather than trusting a classification posted back from the
 * browser: between preview and commit a student may have signed up, and the
 * form is client-supplied data either way.
 */
export async function commitRoster(
  tx: Db,
  tenantId: string,
  invitedBy: string,
  rows: RosterRow[],
): Promise<CommitResult> {
  const classified = await classifyRoster(tx, tenantId, rows);
  const result: CommitResult = {
    invited: 0,
    updated: 0,
    reinvited: 0,
    skipped: 0,
    failed: [],
    links: [],
  };

  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);

  for (const { row, action } of classified) {
    if (action === "skip_registered") {
      result.skipped++;
      continue;
    }

    // A fresh token for a new or lapsed invitation; an existing pending one
    // keeps its link, so a re-import does not invalidate links already sent.
    const rotate = action !== "update";
    const { token, tokenHash } = issueJoinToken();

    try {
      await tx
        .insert(rosterInvitations)
        .values({
          tenantId,
          email: row.email,
          fullName: row.fullName,
          rollNumber: row.rollNumber,
          branch: row.branch,
          section: row.section,
          batchYear: row.batchYear,
          tokenHash,
          status: "pending",
          invitedBy,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [rosterInvitations.tenantId, rosterInvitations.email],
          set: {
            fullName: row.fullName,
            rollNumber: row.rollNumber,
            branch: row.branch,
            section: row.section,
            batchYear: row.batchYear,
            status: "pending",
            revokedAt: null,
            updatedAt: new Date(),
            ...(rotate ? { tokenHash, expiresAt } : {}),
          },
          // Never resurrect an invitation somebody already redeemed: that
          // would detach a live account from its roster row.
          setWhere: sql`${rosterInvitations.status} <> 'accepted'`,
        });

      if (action === "invite") result.invited++;
      else if (action === "reinvite") result.reinvited++;
      else result.updated++;
      if (rotate) {
        result.links.push({ email: row.email, fullName: row.fullName, token });
      }
    } catch (err) {
      result.failed.push({
        email: row.email,
        message:
          err instanceof Error && /users_email_key|roster_invitations_token_hash/.test(err.message)
            ? "This address is already registered elsewhere on the platform."
            : "Could not be imported.",
      });
    }
  }

  return result;
}
