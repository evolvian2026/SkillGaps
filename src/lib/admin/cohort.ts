import "server-only";
import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  attempts,
  attemptSkillScores,
  benchmarkSets,
  placementOutcomes,
  readinessScores,
  skillAreas,
  studentProfiles,
  tracks,
  users,
} from "@/lib/db/schema";

export interface CohortFilters {
  trackId?: string;
  branch?: string;
  section?: string;
  batchYear?: number;
}

/**
 * Cohort filters as SQL.
 *
 * Note there is no tenant predicate here: RLS supplies it. Adding one would be
 * harmless but would also hide a policy regression behind an application
 * filter, and the point of the RLS work is that this layer cannot leak.
 */
function cohortPredicates(filters: CohortFilters): SQL[] {
  const where: SQL[] = [eq(attempts.status, "submitted")];
  if (filters.trackId) where.push(eq(attempts.trackId, filters.trackId));
  if (filters.branch) where.push(eq(studentProfiles.branch, filters.branch));
  if (filters.section) where.push(eq(studentProfiles.section, filters.section));
  if (filters.batchYear) where.push(eq(studentProfiles.batchYear, filters.batchYear));
  return where;
}

/**
 * Only each student's most recent submitted attempt counts toward cohort
 * averages. Counting every retake would let the keenest students dominate the
 * aggregate and would make the cohort look like it improved when in fact one
 * student simply practised.
 */
const latestAttemptPerStudent = sql`
  ${attempts.id} IN (
    SELECT DISTINCT ON (a.user_id, a.track_id) a.id
    FROM attempts a
    WHERE a.status = 'submitted'
    ORDER BY a.user_id, a.track_id, a.submitted_at DESC
  )
`;

export interface SkillAreaAggregate {
  skillAreaId: string;
  code: string;
  name: string;
  average: number;
  studentCount: number;
  belowBarCount: number;
  hiringBarPercent: number | null;
}

export async function loadSkillAreaAggregates(
  tx: Db,
  filters: CohortFilters,
): Promise<SkillAreaAggregate[]> {
  const rows = await tx
    .select({
      skillAreaId: skillAreas.id,
      code: skillAreas.code,
      name: skillAreas.name,
      displayOrder: skillAreas.displayOrder,
      average: sql<string>`ROUND(AVG(${attemptSkillScores.percent}), 1)`,
      studentCount: sql<number>`COUNT(DISTINCT ${attempts.userId})::int`,
      // Compared per row against the bar that row was actually scored
      // against, so this stays correct even across mixed tracks.
      belowBarCount: sql<number>`COUNT(DISTINCT ${attempts.userId}) FILTER (
        WHERE ${attemptSkillScores.hiringBarPercent} IS NOT NULL
          AND ${attemptSkillScores.percent} < ${attemptSkillScores.hiringBarPercent}
      )::int`,
      // Tracks can set different bars for the same skill area, so a single
      // number is only meaningful when every contributing row agrees. With
      // "all tracks" selected this correctly comes back null rather than
      // presenting one track's bar as the cohort's.
      hiringBar: sql<string | null>`CASE
        WHEN COUNT(DISTINCT ${attemptSkillScores.hiringBarPercent}) = 1
        THEN MAX(${attemptSkillScores.hiringBarPercent})
        ELSE NULL
      END`,
    })
    .from(attemptSkillScores)
    .innerJoin(attempts, eq(attempts.id, attemptSkillScores.attemptId))
    .innerJoin(skillAreas, eq(skillAreas.id, attemptSkillScores.skillAreaId))
    .leftJoin(studentProfiles, eq(studentProfiles.userId, attempts.userId))
    .where(and(...cohortPredicates(filters), latestAttemptPerStudent))
    .groupBy(skillAreas.id, skillAreas.code, skillAreas.name, skillAreas.displayOrder)
    .orderBy(asc(skillAreas.displayOrder));

  return rows.map((row) => ({
    skillAreaId: row.skillAreaId,
    code: row.code,
    name: row.name,
    average: Number(row.average ?? 0),
    studentCount: row.studentCount,
    belowBarCount: row.belowBarCount,
    hiringBarPercent: row.hiringBar === null ? null : Number(row.hiringBar),
  }));
}

export interface StudentRow {
  userId: string;
  fullName: string;
  email: string;
  rollNumber: string | null;
  branch: string | null;
  section: string | null;
  batchYear: number | null;
  attemptCount: number;
  latestPercent: number | null;
  latestTrack: string | null;
  latestSubmittedAt: Date | null;
  flaggedAttempts: number;
  /** Phase 2 composite. Null when the student has no component data at all. */
  readinessScore: number | null;
  /** How many of the three components fed that score, out of three. */
  readinessComponents: number;
  placementStatus: string | null;
}

export async function loadStudentRows(
  tx: Db,
  filters: CohortFilters,
): Promise<StudentRow[]> {
  const where: SQL[] = [eq(users.role, "student")];
  if (filters.branch) where.push(eq(studentProfiles.branch, filters.branch));
  if (filters.section) where.push(eq(studentProfiles.section, filters.section));
  if (filters.batchYear) where.push(eq(studentProfiles.batchYear, filters.batchYear));

  const trackFilter = filters.trackId
    ? sql`AND a.track_id = ${filters.trackId}`
    : sql``;

  const rows = await tx
    .select({
      userId: users.id,
      fullName: users.fullName,
      email: users.email,
      rollNumber: studentProfiles.rollNumber,
      branch: studentProfiles.branch,
      section: studentProfiles.section,
      batchYear: studentProfiles.batchYear,
      attemptCount: sql<number>`(
        SELECT COUNT(*)::int FROM attempts a
        WHERE a.user_id = ${users.id} AND a.status = 'submitted' ${trackFilter}
      )`,
      latestPercent: sql<string | null>`(
        SELECT a.percent FROM attempts a
        WHERE a.user_id = ${users.id} AND a.status = 'submitted' ${trackFilter}
        ORDER BY a.submitted_at DESC LIMIT 1
      )`,
      latestTrack: sql<string | null>`(
        SELECT t.name FROM attempts a
        JOIN tracks t ON t.id = a.track_id
        WHERE a.user_id = ${users.id} AND a.status = 'submitted' ${trackFilter}
        ORDER BY a.submitted_at DESC LIMIT 1
      )`,
      latestSubmittedAt: sql<Date | null>`(
        SELECT a.submitted_at FROM attempts a
        WHERE a.user_id = ${users.id} AND a.status = 'submitted' ${trackFilter}
        ORDER BY a.submitted_at DESC LIMIT 1
      )`,
      flaggedAttempts: sql<number>`(
        SELECT COUNT(*)::int FROM attempts a
        WHERE a.user_id = ${users.id} AND a.status = 'submitted'
          AND a.integrity_flags <> '{}'::jsonb ${trackFilter}
      )`,
      readinessScore: readinessScores.score,
      readinessComponents: readinessScores.componentsPresent,
      placementStatus: placementOutcomes.status,
    })
    .from(users)
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .leftJoin(readinessScores, eq(readinessScores.userId, users.id))
    .leftJoin(placementOutcomes, eq(placementOutcomes.userId, users.id))
    .where(and(...where))
    .orderBy(asc(users.fullName));

  return rows.map((row) => ({
    ...row,
    latestPercent: row.latestPercent === null ? null : Number(row.latestPercent),
    latestSubmittedAt: row.latestSubmittedAt ? new Date(row.latestSubmittedAt) : null,
    readinessScore:
      row.readinessScore === null ? null : Number(row.readinessScore),
    readinessComponents: row.readinessComponents ?? 0,
    placementStatus: row.placementStatus ?? null,
  }));
}

export interface CohortSummary {
  studentCount: number;
  assessedCount: number;
  averagePercent: number | null;
  flaggedCount: number;
}

export async function loadCohortSummary(
  tx: Db,
  filters: CohortFilters,
): Promise<CohortSummary> {
  const [studentTotals] = await tx
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(users)
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .where(
      and(
        eq(users.role, "student"),
        ...(filters.branch ? [eq(studentProfiles.branch, filters.branch)] : []),
        ...(filters.section ? [eq(studentProfiles.section, filters.section)] : []),
        ...(filters.batchYear ? [eq(studentProfiles.batchYear, filters.batchYear)] : []),
      ),
    );

  const [attemptTotals] = await tx
    .select({
      assessed: sql<number>`COUNT(DISTINCT ${attempts.userId})::int`,
      average: sql<string | null>`ROUND(AVG(${attempts.percent}), 1)`,
      flagged: sql<number>`COUNT(*) FILTER (
        WHERE ${attempts.integrityFlags} <> '{}'::jsonb
      )::int`,
    })
    .from(attempts)
    .leftJoin(studentProfiles, eq(studentProfiles.userId, attempts.userId))
    .where(and(...cohortPredicates(filters), latestAttemptPerStudent));

  return {
    studentCount: studentTotals?.count ?? 0,
    assessedCount: attemptTotals?.assessed ?? 0,
    averagePercent:
      attemptTotals?.average === null || attemptTotals?.average === undefined
        ? null
        : Number(attemptTotals.average),
    flaggedCount: attemptTotals?.flagged ?? 0,
  };
}

export interface FilterOptions {
  branches: string[];
  sections: string[];
  batchYears: number[];
  tracks: { id: string; name: string }[];
}

export async function loadFilterOptions(tx: Db): Promise<FilterOptions> {
  const profileRows = await tx
    .select({
      branch: studentProfiles.branch,
      section: studentProfiles.section,
      batchYear: studentProfiles.batchYear,
    })
    .from(studentProfiles);

  const trackRows = await tx
    .select({ id: tracks.id, name: tracks.name })
    .from(tracks)
    .where(eq(tracks.isActive, true))
    .orderBy(asc(tracks.displayOrder));

  const unique = <T>(values: (T | null)[]): T[] =>
    [...new Set(values.filter((v): v is T => v !== null && v !== undefined))];

  return {
    branches: unique(profileRows.map((r) => r.branch)).sort(),
    sections: unique(profileRows.map((r) => r.section)).sort(),
    batchYears: unique(profileRows.map((r) => r.batchYear)).sort((a, b) => b - a),
    tracks: trackRows,
  };
}

/** Which benchmark set the displayed bars come from, for the provisional note. */
export async function loadBenchmarkContext(
  tx: Db,
  trackId?: string,
): Promise<{ label: string; isProvisional: boolean } | null> {
  if (!trackId) return null;
  const [row] = await tx
    .select({ label: benchmarkSets.label, isProvisional: benchmarkSets.isProvisional })
    .from(benchmarkSets)
    .where(and(eq(benchmarkSets.trackId, trackId), eq(benchmarkSets.isActive, true)))
    .limit(1);
  return row ?? null;
}
