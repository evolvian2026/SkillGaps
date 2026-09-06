import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  employerAssessments,
  employers,
  profileShareConsents,
  readinessScores,
  tracks,
  users,
} from "@/lib/db/schema";

/**
 * Employer-side reads.
 *
 * Every one of these is additionally constrained by RLS — an employer cannot
 * reach a tenant without an active grant, or a student without that student's
 * own opt-in. The filters here are for shaping results, not for security.
 */

export interface GrantRow {
  id: string;
  tenantName: string;
  tenantId: string;
  status: string;
  batchYear: number | null;
  branch: string | null;
  grantedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

/**
 * The employer's grants, with each institution's name.
 *
 * Goes through `app.employer_grants` rather than joining `tenants` directly.
 * An employer's own tenant is their organisation record, so the `tenants`
 * policy does not admit the universities they deal with — a direct join
 * silently returns nothing, which is exactly what this page used to do.
 */
export async function listGrants(tx: Db): Promise<GrantRow[]> {
  const result = await tx.execute(sql`SELECT * FROM app.employer_grants()`);
  return (result.rows as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    tenantId: row.tenant_id as string,
    tenantName: row.tenant_name as string,
    status: row.status as string,
    batchYear: row.batch_year === null ? null : Number(row.batch_year),
    branch: (row.branch as string | null) ?? null,
    grantedAt: row.granted_at ? new Date(row.granted_at as string) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
    revokedAt: row.revoked_at ? new Date(row.revoked_at as string) : null,
  }));
}

/**
 * Institutions the employer may request access from.
 *
 * Name and id only — never an invite code, which would let the holder register
 * as one of that university's students.
 */
export async function institutionDirectory(
  tx: Db,
): Promise<{ id: string; name: string }[]> {
  const result = await tx.execute(sql`SELECT * FROM app.institution_directory()`);
  return (result.rows as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    name: row.name as string,
  }));
}

export interface PoolBucket {
  tenantName: string;
  skillAreaCode: string;
  skillAreaName: string;
  band: string;
  studentCount: number;
}

/**
 * Anonymised candidate pool.
 *
 * Goes through `app.employer_candidate_pool`, which runs SECURITY DEFINER and
 * suppresses buckets below the k-anonymity threshold. The employer role holds
 * no row access to the students being counted, so browsing the pool can never
 * become a way to identify one.
 */
export async function candidatePool(
  tx: Db,
  options: { trackId?: string; minBucket?: number } = {},
): Promise<PoolBucket[]> {
  const result = await tx.execute(
    sql`SELECT * FROM app.employer_candidate_pool(
      ${options.trackId ?? null}::uuid,
      ${options.minBucket ?? 5}::integer
    )`,
  );
  return (result.rows as Record<string, unknown>[]).map((row) => ({
    tenantName: row.tenant_name as string,
    skillAreaCode: row.skill_area_code as string,
    skillAreaName: row.skill_area_name as string,
    band: row.band as string,
    studentCount: Number(row.student_count),
  }));
}

/**
 * Students who have opted in to sharing with this employer.
 *
 * Returns rows only for students whose most recent consent event grants a full
 * profile — the RLS policy on `users` enforces that independently, so a bug
 * here cannot widen the set.
 *
 * The institution name is resolved from the employer's own grants rather than
 * joined from `tenants`: an employer cannot read a university's tenant row (it
 * holds the invite code), so an inner join silently dropped every shared
 * profile and the section was permanently empty. A student the employer may
 * see always came from a tenant the employer holds a grant to — the consent
 * policy requires it — so the name is always there to find.
 */
export async function optedInCandidates(tx: Db, employerId: string) {
  const [rows, grants] = await Promise.all([
    tx
      .select({
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        tenantId: profileShareConsents.tenantId,
        readinessScore: readinessScores.score,
        readinessComponents: readinessScores.componentsPresent,
        sharedAt: sql<Date>`MAX(${profileShareConsents.recordedAt})`,
      })
      .from(profileShareConsents)
      .innerJoin(users, eq(users.id, profileShareConsents.userId))
      .leftJoin(readinessScores, eq(readinessScores.userId, users.id))
      .where(
        and(
          eq(profileShareConsents.employerId, employerId),
          eq(profileShareConsents.granted, true),
        ),
      )
      .groupBy(
        users.id,
        users.fullName,
        users.email,
        profileShareConsents.tenantId,
        readinessScores.score,
        readinessScores.componentsPresent,
      )
      .orderBy(desc(sql`MAX(${profileShareConsents.recordedAt})`)),
    listGrants(tx),
  ]);

  const nameOf = new Map(grants.map((g) => [g.tenantId, g.tenantName]));
  return rows.map(({ tenantId, ...row }) => ({
    ...row,
    tenantName: nameOf.get(tenantId) ?? "Unknown institution",
  }));
}

export async function listAssessments(tx: Db, employerId: string) {
  return tx
    .select({
      id: employerAssessments.id,
      title: employerAssessments.title,
      description: employerAssessments.description,
      isActive: employerAssessments.isActive,
      opensAt: employerAssessments.opensAt,
      closesAt: employerAssessments.closesAt,
      tenantIds: employerAssessments.tenantIds,
      trackName: tracks.name,
      createdAt: employerAssessments.createdAt,
      attemptCount: sql<number>`(
        SELECT COUNT(*)::int FROM employer_assessment_attempts ea
        WHERE ea.assessment_id = ${employerAssessments.id}
      )`,
    })
    .from(employerAssessments)
    .innerJoin(tracks, eq(tracks.id, employerAssessments.trackId))
    .where(eq(employerAssessments.employerId, employerId))
    .orderBy(desc(employerAssessments.createdAt));
}

export async function employerProfile(tx: Db, employerId: string) {
  const [row] = await tx
    .select()
    .from(employers)
    .where(eq(employers.id, employerId));
  return row ?? null;
}

/** Assessments open to the calling student, for their dashboard. */
export async function openEmployerAssessments(tx: Db) {
  return tx
    .select({
      id: employerAssessments.id,
      title: employerAssessments.title,
      description: employerAssessments.description,
      trackId: employerAssessments.trackId,
      trackName: tracks.name,
      closesAt: employerAssessments.closesAt,
      employerName: employers.name,
      durationSeconds: employerAssessments.durationSeconds,
    })
    .from(employerAssessments)
    .innerJoin(tracks, eq(tracks.id, employerAssessments.trackId))
    .innerJoin(employers, eq(employers.id, employerAssessments.employerId))
    .where(
      and(
        eq(employerAssessments.isActive, true),
        sql`(${employerAssessments.opensAt} IS NULL OR ${employerAssessments.opensAt} <= now())`,
        sql`(${employerAssessments.closesAt} IS NULL OR ${employerAssessments.closesAt} > now())`,
      ),
    )
    .orderBy(desc(employerAssessments.createdAt));
}
