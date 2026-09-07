import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { rosterInvitations, users } from "@/lib/db/schema";

/**
 * Roster reads for the institution dashboard.
 *
 * "Expired" is derived here rather than stored, so the table never needs a
 * sweep job to stay truthful — a lapsed invitation is simply one whose
 * `expires_at` has passed while still pending.
 */

export type RosterStatus = "pending" | "expired" | "accepted" | "revoked";

export interface RosterEntry {
  id: string;
  email: string;
  fullName: string;
  rollNumber: string | null;
  branch: string | null;
  section: string | null;
  batchYear: number | null;
  status: RosterStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  invitedByName: string | null;
}

const DERIVED_STATUS = sql<RosterStatus>`
  CASE
    WHEN ${rosterInvitations.status} = 'accepted' THEN 'accepted'
    WHEN ${rosterInvitations.status} = 'revoked'  THEN 'revoked'
    WHEN ${rosterInvitations.expiresAt} <= now()  THEN 'expired'
    ELSE 'pending'
  END
`;

export async function listRoster(
  tx: Db,
  filter: { status?: RosterStatus } = {},
): Promise<RosterEntry[]> {
  const rows = await tx
    .select({
      id: rosterInvitations.id,
      email: rosterInvitations.email,
      fullName: rosterInvitations.fullName,
      rollNumber: rosterInvitations.rollNumber,
      branch: rosterInvitations.branch,
      section: rosterInvitations.section,
      batchYear: rosterInvitations.batchYear,
      status: DERIVED_STATUS,
      expiresAt: rosterInvitations.expiresAt,
      acceptedAt: rosterInvitations.acceptedAt,
      createdAt: rosterInvitations.createdAt,
      invitedByName: users.fullName,
    })
    .from(rosterInvitations)
    .leftJoin(users, eq(users.id, rosterInvitations.invitedBy))
    .orderBy(desc(rosterInvitations.createdAt));

  return filter.status ? rows.filter((r) => r.status === filter.status) : rows;
}

export interface RosterSummary {
  total: number;
  pending: number;
  expired: number;
  accepted: number;
  revoked: number;
}

export function summariseRoster(entries: RosterEntry[]): RosterSummary {
  const summary: RosterSummary = {
    total: entries.length,
    pending: 0,
    expired: 0,
    accepted: 0,
    revoked: 0,
  };
  for (const entry of entries) summary[entry.status]++;
  return summary;
}

/** One invitation, scoped by RLS to the caller's own institution. */
export async function findInvitation(tx: Db, id: string) {
  const [row] = await tx
    .select()
    .from(rosterInvitations)
    .where(eq(rosterInvitations.id, id));
  return row ?? null;
}

/** Whether an invitation is still in a state that a fresh link would help. */
export async function isReissuable(tx: Db, id: string): Promise<boolean> {
  const [row] = await tx
    .select({ status: rosterInvitations.status })
    .from(rosterInvitations)
    .where(
      and(eq(rosterInvitations.id, id), eq(rosterInvitations.status, "pending")),
    );
  return Boolean(row);
}
