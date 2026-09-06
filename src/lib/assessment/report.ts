import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  attempts,
  attemptSkillScores,
  benchmarkSets,
  resources,
  skillAreas,
  tracks,
} from "@/lib/db/schema";
import { rankGaps, type GapArea } from "./scoring";

export interface ReportArea {
  skillAreaId: string;
  code: string;
  name: string;
  description: string | null;
  percent: number;
  score: number;
  maxScore: number;
  hiringBarPercent: number | null;
  gap: number | null;
}

export interface Resource {
  id: string;
  title: string;
  url: string;
  provider: string | null;
  kind: string;
  estimatedHours: number | null;
}

export interface AttemptReport {
  attemptId: string;
  trackName: string;
  trackCode: string;
  status: string;
  submittedAt: Date | null;
  percent: number;
  totalScore: number;
  maxScore: number;
  integrityFlags: Record<string, number>;
  benchmarkLabel: string | null;
  benchmarkIsProvisional: boolean;
  areas: ReportArea[];
  priorityAreas: ReportArea[];
  resourcesByArea: Record<string, Resource[]>;
}

export async function loadAttemptReport(
  tx: Db,
  attemptId: string,
): Promise<AttemptReport | null> {
  const [attempt] = await tx
    .select({
      id: attempts.id,
      status: attempts.status,
      submittedAt: attempts.submittedAt,
      percent: attempts.percent,
      totalScore: attempts.totalScore,
      maxScore: attempts.maxScore,
      integrityFlags: attempts.integrityFlags,
      trackName: tracks.name,
      trackCode: tracks.code,
      benchmarkLabel: benchmarkSets.label,
      benchmarkIsProvisional: benchmarkSets.isProvisional,
    })
    .from(attempts)
    .innerJoin(tracks, eq(tracks.id, attempts.trackId))
    .leftJoin(benchmarkSets, eq(benchmarkSets.id, attempts.benchmarkSetId))
    .where(eq(attempts.id, attemptId));

  if (!attempt) return null;

  const areaRows = await tx
    .select({
      skillAreaId: attemptSkillScores.skillAreaId,
      percent: attemptSkillScores.percent,
      score: attemptSkillScores.score,
      maxScore: attemptSkillScores.maxScore,
      hiringBarPercent: attemptSkillScores.hiringBarPercent,
      code: skillAreas.code,
      name: skillAreas.name,
      description: skillAreas.description,
      displayOrder: skillAreas.displayOrder,
    })
    .from(attemptSkillScores)
    .innerJoin(skillAreas, eq(skillAreas.id, attemptSkillScores.skillAreaId))
    .where(eq(attemptSkillScores.attemptId, attemptId))
    .orderBy(asc(skillAreas.displayOrder));

  const areas: ReportArea[] = areaRows.map((row) => {
    const percent = Number(row.percent);
    const bar = row.hiringBarPercent === null ? null : Number(row.hiringBarPercent);
    return {
      skillAreaId: row.skillAreaId,
      code: row.code,
      name: row.name,
      description: row.description,
      percent,
      score: Number(row.score),
      maxScore: Number(row.maxScore),
      hiringBarPercent: bar,
      gap: bar === null ? null : Math.round((bar - percent) * 100) / 100,
    };
  });

  const gapInput: GapArea[] = areas.map((a) => ({
    skillAreaId: a.skillAreaId,
    percent: a.percent,
    hiringBarPercent: a.hiringBarPercent,
    gap: a.gap,
  }));
  const ranked = rankGaps(gapInput, 3);
  const byId = new Map(areas.map((a) => [a.skillAreaId, a]));
  const priorityAreas = ranked
    .map((r) => byId.get(r.skillAreaId))
    .filter((a): a is ReportArea => Boolean(a));

  // Resources are fetched only for the areas actually being recommended, so a
  // report page does not pull the entire catalogue.
  const resourcesByArea: Record<string, Resource[]> = {};
  for (const area of priorityAreas) {
    const rows = await tx
      .select({
        id: resources.id,
        title: resources.title,
        url: resources.url,
        provider: resources.provider,
        kind: resources.kind,
        estimatedHours: resources.estimatedHours,
      })
      .from(resources)
      .where(
        and(
          eq(resources.skillAreaId, area.skillAreaId),
          eq(resources.isActive, true),
        ),
      )
      .orderBy(asc(resources.displayOrder))
      .limit(4);
    resourcesByArea[area.skillAreaId] = rows;
  }

  return {
    attemptId: attempt.id,
    trackName: attempt.trackName,
    trackCode: attempt.trackCode,
    status: attempt.status,
    submittedAt: attempt.submittedAt,
    percent: Number(attempt.percent ?? 0),
    totalScore: Number(attempt.totalScore ?? 0),
    maxScore: Number(attempt.maxScore ?? 0),
    integrityFlags: (attempt.integrityFlags ?? {}) as Record<string, number>,
    benchmarkLabel: attempt.benchmarkLabel,
    benchmarkIsProvisional: attempt.benchmarkIsProvisional ?? true,
    areas,
    priorityAreas,
    resourcesByArea,
  };
}

export interface TrendPoint {
  attemptId: string;
  submittedAt: Date;
  percent: number;
}

/** Score history for one track, oldest first, for the retake trend chart. */
export async function loadTrend(
  tx: Db,
  userId: string,
  trackId: string,
): Promise<TrendPoint[]> {
  const rows = await tx
    .select({
      attemptId: attempts.id,
      submittedAt: attempts.submittedAt,
      percent: attempts.percent,
    })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.trackId, trackId),
        eq(attempts.status, "submitted"),
      ),
    )
    .orderBy(desc(attempts.submittedAt))
    .limit(12);

  return rows
    .filter((r) => r.submittedAt !== null)
    .map((r) => ({
      attemptId: r.attemptId,
      submittedAt: r.submittedAt!,
      percent: Number(r.percent ?? 0),
    }))
    .reverse();
}
