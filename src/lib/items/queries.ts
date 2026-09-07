import "server-only";
import { desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  itemAnalysisRuns,
  itemStatistics,
  questions,
  skillAreas,
  tracks,
} from "@/lib/db/schema";

/**
 * Reads for the item-quality report.
 *
 * Everything here is gated by the `super_admin`-only policies on the two
 * tables, so these are shaping queries rather than security boundaries.
 */

export interface DistractorRow {
  option_id: string;
  label: string;
  is_correct: boolean;
  chosen: number;
  share: number;
  mean_rest_percent: number | null;
  flags: string[];
}

export interface ItemRow {
  questionId: string;
  prompt: string;
  type: string;
  difficulty: number;
  skillArea: string;
  responses: number;
  facility: number | null;
  discrimination: number | null;
  discriminationP: number | null;
  verdict: string;
  flags: string[];
  message: string;
  distractors: DistractorRow[];
}

export async function latestRun(tx: Db) {
  const [run] = await tx
    .select({
      id: itemAnalysisRuns.id,
      trackName: tracks.name,
      analysedCount: itemAnalysisRuns.analysedCount,
      skippedCount: itemAnalysisRuns.skippedCount,
      urgentCount: itemAnalysisRuns.urgentCount,
      reviewCount: itemAnalysisRuns.reviewCount,
      okCount: itemAnalysisRuns.okCount,
      responseCount: itemAnalysisRuns.responseCount,
      minResponses: itemAnalysisRuns.minResponses,
      message: itemAnalysisRuns.message,
      createdAt: itemAnalysisRuns.createdAt,
    })
    .from(itemAnalysisRuns)
    .leftJoin(tracks, eq(tracks.id, itemAnalysisRuns.trackId))
    .orderBy(desc(itemAnalysisRuns.createdAt))
    .limit(1);
  return run ?? null;
}

export async function itemsForRun(tx: Db, runId: string): Promise<ItemRow[]> {
  const rows = await tx
    .select({
      questionId: itemStatistics.questionId,
      prompt: questions.prompt,
      type: questions.type,
      difficulty: questions.difficulty,
      skillArea: skillAreas.name,
      responses: itemStatistics.responses,
      facility: itemStatistics.facility,
      discrimination: itemStatistics.discrimination,
      discriminationP: itemStatistics.discriminationP,
      verdict: itemStatistics.verdict,
      flags: itemStatistics.flags,
      message: itemStatistics.message,
      distractors: itemStatistics.distractors,
    })
    .from(itemStatistics)
    .innerJoin(questions, eq(questions.id, itemStatistics.questionId))
    .innerJoin(skillAreas, eq(skillAreas.id, questions.skillAreaId))
    .where(eq(itemStatistics.runId, runId));

  // Worst first: the point of the report is the short list at the top.
  const rank: Record<string, number> = {
    urgent: 0,
    review: 1,
    ok: 2,
    not_analysed: 3,
  };

  return rows
    .map((r) => ({
      questionId: r.questionId,
      prompt: r.prompt,
      type: r.type as string,
      difficulty: r.difficulty,
      skillArea: r.skillArea,
      responses: r.responses,
      facility: r.facility === null ? null : Number(r.facility),
      discrimination: r.discrimination === null ? null : Number(r.discrimination),
      discriminationP: r.discriminationP === null ? null : Number(r.discriminationP),
      verdict: r.verdict,
      flags: r.flags ?? [],
      message: r.message,
      distractors: (r.distractors as DistractorRow[] | null) ?? [],
    }))
    .sort(
      (a, b) =>
        (rank[a.verdict] ?? 9) - (rank[b.verdict] ?? 9) ||
        (a.discrimination ?? Infinity) - (b.discrimination ?? Infinity),
    );
}

export async function runHistory(tx: Db, limit = 10) {
  return tx
    .select({
      id: itemAnalysisRuns.id,
      createdAt: itemAnalysisRuns.createdAt,
      analysedCount: itemAnalysisRuns.analysedCount,
      urgentCount: itemAnalysisRuns.urgentCount,
      reviewCount: itemAnalysisRuns.reviewCount,
      okCount: itemAnalysisRuns.okCount,
      trackName: tracks.name,
    })
    .from(itemAnalysisRuns)
    .leftJoin(tracks, eq(tracks.id, itemAnalysisRuns.trackId))
    .orderBy(desc(itemAnalysisRuns.createdAt))
    .limit(limit);
}
