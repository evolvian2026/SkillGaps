import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  attempts,
  attemptSkillScores,
  interviewSessions,
  readinessScores,
  skillAreas,
  tenants,
  tracks,
  verifiedProfiles,
} from "@/lib/db/schema";
import { hashToken } from "./token";

/**
 * The frozen snapshot behind a verification link.
 *
 * Frozen deliberately: an employer checking a link weeks after it was shared
 * should see what the student actually claimed, not a moving target that has
 * since improved or regressed. Re-sharing an updated record means issuing a
 * new link.
 *
 * What it deliberately does NOT contain: the student's email, their resume,
 * their cohort identifiers, or per-question answers. A verification link is
 * evidence of a result, not a data export.
 */
export interface ProfileSnapshot {
  version: 1;
  fullName: string;
  institution: string;
  issuedAt: string;
  diagnostics: {
    track: string;
    percent: number;
    submittedAt: string;
    areas: { name: string; percent: number; hiringBar: number | null }[];
  }[];
  interviews: { track: string; score: number; evaluatedAt: string; method: string }[];
  readiness: {
    score: number;
    componentsPresent: number;
    /** Repeated inside the snapshot so the public page cannot omit it. */
    provisional: true;
  } | null;
}

export async function buildSnapshot(
  tx: Db,
  user: { userId: string; tenantId: string; fullName: string },
): Promise<ProfileSnapshot> {
  const [tenant] = await tx
    .select({ name: tenants.name })
    .from(tenants)
    .where(eq(tenants.id, user.tenantId));

  // Best submitted attempt per track — a verification link should show what a
  // student can do, and a retake that went worse is not evidence they lost it.
  const attemptRows = await tx
    .select({
      id: attempts.id,
      percent: attempts.percent,
      submittedAt: attempts.submittedAt,
      trackName: tracks.name,
    })
    .from(attempts)
    .innerJoin(tracks, eq(tracks.id, attempts.trackId))
    .where(
      and(eq(attempts.userId, user.userId), eq(attempts.status, "submitted")),
    )
    .orderBy(desc(attempts.percent));

  const bestByTrack = new Map<string, (typeof attemptRows)[number]>();
  for (const row of attemptRows) {
    if (!bestByTrack.has(row.trackName)) bestByTrack.set(row.trackName, row);
  }

  const diagnostics: ProfileSnapshot["diagnostics"] = [];
  for (const row of bestByTrack.values()) {
    const areas = await tx
      .select({
        name: skillAreas.name,
        percent: attemptSkillScores.percent,
        hiringBar: attemptSkillScores.hiringBarPercent,
      })
      .from(attemptSkillScores)
      .innerJoin(skillAreas, eq(skillAreas.id, attemptSkillScores.skillAreaId))
      .where(eq(attemptSkillScores.attemptId, row.id))
      .orderBy(skillAreas.displayOrder);

    diagnostics.push({
      track: row.trackName,
      percent: Number(row.percent ?? 0),
      submittedAt: (row.submittedAt ?? new Date()).toISOString(),
      areas: areas.map((a) => ({
        name: a.name,
        percent: Number(a.percent),
        hiringBar: a.hiringBar === null ? null : Number(a.hiringBar),
      })),
    });
  }

  const interviewRows = await tx
    .select({
      score: interviewSessions.overallScore,
      evaluatedAt: interviewSessions.evaluatedAt,
      method: interviewSessions.evaluationMethod,
      trackName: tracks.name,
    })
    .from(interviewSessions)
    .innerJoin(tracks, eq(tracks.id, interviewSessions.trackId))
    .where(
      and(
        eq(interviewSessions.userId, user.userId),
        eq(interviewSessions.status, "evaluated"),
      ),
    )
    .orderBy(desc(interviewSessions.evaluatedAt))
    .limit(5);

  const [readiness] = await tx
    .select()
    .from(readinessScores)
    .where(eq(readinessScores.userId, user.userId));

  return {
    version: 1,
    fullName: user.fullName,
    institution: tenant?.name ?? "—",
    issuedAt: new Date().toISOString(),
    diagnostics,
    interviews: interviewRows
      .filter((r) => r.score !== null && r.evaluatedAt !== null)
      .map((r) => ({
        track: r.trackName,
        score: Number(r.score),
        evaluatedAt: r.evaluatedAt!.toISOString(),
        method: r.method ?? "unknown",
      })),
    readiness: readiness
      ? {
          score: Number(readiness.score),
          componentsPresent: readiness.componentsPresent,
          provisional: true,
        }
      : null,
  };
}

/** Resolve a shared token to its snapshot, or null when revoked or expired. */
export async function resolveProfile(tx: Db, token: string) {
  const result = await tx.execute(
    sql`SELECT * FROM app.resolve_verified_profile(${hashToken(token)})`,
  );
  const row = (result.rows as Record<string, unknown>[])[0];
  if (!row) return null;

  return {
    publicId: row.public_id as string,
    snapshot: row.snapshot as ProfileSnapshot,
    issuedAt: new Date(row.issued_at as string),
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
    label: (row.label as string | null) ?? null,
  };
}

export async function recordProfileView(tx: Db, token: string): Promise<void> {
  await tx.execute(sql`SELECT app.record_profile_view(${hashToken(token)})`);
}

/** The student's own list of links they have issued. */
export async function listProfiles(tx: Db, userId: string) {
  return tx
    .select({
      id: verifiedProfiles.id,
      publicId: verifiedProfiles.publicId,
      label: verifiedProfiles.label,
      issuedAt: verifiedProfiles.issuedAt,
      expiresAt: verifiedProfiles.expiresAt,
      revokedAt: verifiedProfiles.revokedAt,
      viewCount: verifiedProfiles.viewCount,
      lastViewedAt: verifiedProfiles.lastViewedAt,
    })
    .from(verifiedProfiles)
    .where(eq(verifiedProfiles.userId, userId))
    .orderBy(desc(verifiedProfiles.issuedAt));
}
