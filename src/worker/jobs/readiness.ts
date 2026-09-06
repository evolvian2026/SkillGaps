import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  attempts,
  interviewSessions,
  readinessScores,
  readinessWeights,
  resumeMatches,
} from "@/lib/db/schema";
import {
  computeReadiness,
  DEFAULT_WEIGHTS,
  type ReadinessWeights,
} from "@/lib/readiness/score";
import type { RecomputeReadinessJob } from "@/lib/queue/types";
import { withJobContext } from "../context";

/**
 * Recomputes one student's readiness score.
 *
 * Materialised rather than computed on read because the institution dashboard
 * sorts on it across a whole cohort. Triggered whenever a component changes —
 * a submitted assessment, an evaluated interview, a completed match.
 */
export async function recomputeReadiness(
  job: RecomputeReadinessJob,
): Promise<void> {
  await withJobContext(job.userId, async (tx, ctx) => {
    await recomputeFor(tx, ctx.tenantId, ctx.userId);
  });
}

export async function recomputeFor(
  tx: Db,
  tenantId: string,
  userId: string,
): Promise<void> {
  const weights = await loadWeights(tx, tenantId);

  const [latestAttempt] = await tx
    .select({ percent: attempts.percent })
    .from(attempts)
    .where(and(eq(attempts.userId, userId), eq(attempts.status, "submitted")))
    .orderBy(desc(attempts.submittedAt))
    .limit(1);

  const [latestInterview] = await tx
    .select({ score: interviewSessions.overallScore })
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.userId, userId),
        eq(interviewSessions.status, "evaluated"),
      ),
    )
    .orderBy(desc(interviewSessions.evaluatedAt))
    .limit(1);

  // Best match rather than latest: a student iterating on their resume against
  // several JDs should be credited with their strongest fit, not their most
  // recent experiment.
  const [bestMatch] = await tx
    .select({ score: resumeMatches.matchScore })
    .from(resumeMatches)
    .where(
      and(eq(resumeMatches.userId, userId), eq(resumeMatches.status, "succeeded")),
    )
    .orderBy(desc(resumeMatches.matchScore))
    .limit(1);

  const result = computeReadiness(
    {
      diagnosticPercent: toNumber(latestAttempt?.percent),
      interviewPercent: toNumber(latestInterview?.score),
      resumeMatchPercent: toNumber(bestMatch?.score),
    },
    weights,
  );

  await tx
    .insert(readinessScores)
    .values({
      tenantId,
      userId,
      score: String(result.score),
      diagnosticPercent: stringOrNull(toNumber(latestAttempt?.percent)),
      interviewPercent: stringOrNull(toNumber(latestInterview?.score)),
      resumeMatchPercent: stringOrNull(toNumber(bestMatch?.score)),
      componentsPresent: result.componentsPresent,
      weightsUsed: result.effectiveWeights as never,
    })
    .onConflictDoUpdate({
      target: readinessScores.userId,
      set: {
        score: String(result.score),
        diagnosticPercent: stringOrNull(toNumber(latestAttempt?.percent)),
        interviewPercent: stringOrNull(toNumber(latestInterview?.score)),
        resumeMatchPercent: stringOrNull(toNumber(bestMatch?.score)),
        componentsPresent: result.componentsPresent,
        weightsUsed: result.effectiveWeights as never,
        computedAt: new Date(),
      },
    });
}

async function loadWeights(tx: Db, tenantId: string): Promise<ReadinessWeights> {
  const [row] = await tx
    .select()
    .from(readinessWeights)
    .where(eq(readinessWeights.tenantId, tenantId));
  if (!row) return DEFAULT_WEIGHTS;
  return {
    diagnostic: Number(row.diagnosticWeight),
    interview: Number(row.interviewWeight),
    resume: Number(row.resumeWeight),
  };
}

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: number | null): string | null {
  return value === null ? null : String(value);
}
