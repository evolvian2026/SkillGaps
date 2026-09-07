import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { practiceSessions, skillAreas, skillChecks } from "@/lib/db/schema";

/**
 * A student's own practice and check history.
 *
 * Read only by the student and their institution's staff, per the RLS on both
 * tables. Nothing here feeds a cohort figure or an employer pool.
 */

export interface CheckHistoryRow {
  id: string;
  skillAreaId: string;
  areaName: string;
  percent: number | null;
  baselinePercent: number | null;
  correctCount: number;
  totalCount: number;
  completedAt: Date | null;
}

export async function recentChecks(
  tx: Db,
  userId: string,
  limit = 10,
): Promise<CheckHistoryRow[]> {
  const rows = await tx
    .select({
      id: skillChecks.id,
      skillAreaId: skillChecks.skillAreaId,
      areaName: skillAreas.name,
      percent: skillChecks.percent,
      baselinePercent: skillChecks.baselinePercent,
      correctCount: skillChecks.correctCount,
      totalCount: skillChecks.totalCount,
      completedAt: skillChecks.completedAt,
    })
    .from(skillChecks)
    .innerJoin(skillAreas, eq(skillAreas.id, skillChecks.skillAreaId))
    .where(eq(skillChecks.userId, userId))
    .orderBy(desc(skillChecks.startedAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    percent: r.percent === null ? null : Number(r.percent),
    baselinePercent: r.baselinePercent === null ? null : Number(r.baselinePercent),
  }));
}

export interface PracticeHistoryRow {
  id: string;
  areaName: string;
  correctCount: number;
  totalCount: number;
  completedAt: Date | null;
  startedAt: Date;
}

export async function recentPractice(
  tx: Db,
  userId: string,
  limit = 5,
): Promise<PracticeHistoryRow[]> {
  return tx
    .select({
      id: practiceSessions.id,
      areaName: skillAreas.name,
      correctCount: practiceSessions.correctCount,
      totalCount: practiceSessions.totalCount,
      completedAt: practiceSessions.completedAt,
      startedAt: practiceSessions.startedAt,
    })
    .from(practiceSessions)
    .innerJoin(skillAreas, eq(skillAreas.id, practiceSessions.skillAreaId))
    .where(eq(practiceSessions.userId, userId))
    .orderBy(desc(practiceSessions.startedAt))
    .limit(limit);
}

/** How many practice questions a student has answered, across every area. */
export async function practiceAnswered(tx: Db, userId: string): Promise<number> {
  const [row] = await tx
    .select({ n: sql<number>`COALESCE(SUM(${practiceSessions.correctCount}), 0)::int` })
    .from(practiceSessions)
    .where(eq(practiceSessions.userId, userId));
  return row?.n ?? 0;
}
