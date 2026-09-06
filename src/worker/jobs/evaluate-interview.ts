import { and, asc, eq } from "drizzle-orm";
import {
  interviewQuestions,
  interviewResponses,
  interviewSessions,
} from "@/lib/db/schema";
import {
  DEFAULT_CRITERIA,
  evaluateAndLog,
  selectEvaluator,
  type RubricCriterion,
} from "@/lib/evaluation";
import type { EvaluateInterviewJob } from "@/lib/queue/types";
import { withJobContext } from "../context";
import { recomputeFor } from "./readiness";

/**
 * Evaluates every response in a submitted interview session.
 *
 * Runs as a job rather than inline: model-based evaluation of a six-question
 * interview takes far longer than a request should, and a transient API
 * failure must be retryable without the student resubmitting.
 */
export async function evaluateInterview(job: EvaluateInterviewJob): Promise<void> {
  await withJobContext(job.userId, async (tx, ctx) => {
    const [session] = await tx
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, job.sessionId));

    if (!session) throw new Error(`Interview session ${job.sessionId} not found`);
    if (session.status === "evaluated") return; // idempotent on retry

    const rows = await tx
      .select({
        responseId: interviewResponses.id,
        responseText: interviewResponses.responseText,
        evaluationStatus: interviewResponses.evaluationStatus,
        prompt: interviewQuestions.prompt,
        kind: interviewQuestions.kind,
        rubricCriteria: interviewQuestions.rubricCriteria,
      })
      .from(interviewResponses)
      .innerJoin(
        interviewQuestions,
        eq(interviewQuestions.id, interviewResponses.questionId),
      )
      .where(eq(interviewResponses.sessionId, job.sessionId))
      .orderBy(asc(interviewResponses.position));

    // One evaluator for the whole session, so every answer in a single
    // interview is judged by the same method and version.
    const evaluator = selectEvaluator();
    let anyAwaitingReview = false;

    for (const row of rows) {
      // Skip work already done, so a retry after a partial failure does not
      // re-evaluate (and re-bill) responses that already succeeded.
      if (row.evaluationStatus === "succeeded") continue;

      const outcome = await evaluateAndLog(tx, {
        tenantId: ctx.tenantId,
        subjectType: "interview_response",
        subjectId: row.responseId,
        request: {
          questionPrompt: row.prompt,
          questionKind: row.kind,
          responseText: row.responseText ?? "",
          criteria: normaliseCriteria(row.rubricCriteria),
        },
        evaluator,
      });

      if (!outcome.result.scored) anyAwaitingReview = true;

      await tx
        .update(interviewResponses)
        .set({
          score: outcome.result.scored ? String(outcome.result.score) : null,
          criterionScores: outcome.result.criterionScores as never,
          strengths: outcome.result.strengths,
          improvements: outcome.result.improvements,
          evaluationStatus: outcome.result.scored ? "succeeded" : "awaiting_review",
        })
        .where(eq(interviewResponses.id, row.responseId));
    }

    // Read scores back rather than accumulating in memory, so responses scored
    // on an earlier attempt at this job are included in the average.
    const scored = await tx
      .select({ score: interviewResponses.score })
      .from(interviewResponses)
      .where(
        and(
          eq(interviewResponses.sessionId, job.sessionId),
          eq(interviewResponses.evaluationStatus, "succeeded"),
        ),
      );
    const values = scored
      .map((r) => Number(r.score))
      .filter((n) => Number.isFinite(n));

    const overall =
      values.length === 0
        ? null
        : Math.round(
            (values.reduce((sum, s) => sum + s, 0) / values.length) * 100,
          ) / 100;

    await tx
      .update(interviewSessions)
      .set({
        status: "evaluated",
        evaluatedAt: new Date(),
        overallScore: overall === null ? null : String(overall),
        evaluationMethod: evaluator.method,
        summaryFeedback: buildSummary(overall, anyAwaitingReview, evaluator.method),
      })
      .where(eq(interviewSessions.id, job.sessionId));

    // A new interview score changes the readiness composite. Recomputed here
    // rather than queued as a follow-up job: it is sub-second work, and it
    // reuses the RLS context this job already holds, so there is no window
    // where the interview is scored but the composite still says otherwise.
    await recomputeFor(tx, ctx.tenantId, ctx.userId);
  });
}

/** Question-level criteria when present, the shared default otherwise. */
function normaliseCriteria(raw: unknown): RubricCriterion[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_CRITERIA;
  const parsed = raw.filter(
    (c): c is RubricCriterion =>
      typeof c === "object" &&
      c !== null &&
      typeof (c as RubricCriterion).key === "string",
  );
  return parsed.length > 0 ? parsed : DEFAULT_CRITERIA;
}

function buildSummary(
  overall: number | null,
  awaitingReview: boolean,
  method: string,
): string {
  if (overall === null) {
    return "This interview could not be scored automatically and is waiting for a reviewer.";
  }
  const band =
    overall >= 75
      ? "Your answers were well structured and specific."
      : overall >= 55
        ? "Your answers covered the ground but would land harder with more concrete detail."
        : "Your answers need more structure and specific examples to hold up in a real interview.";

  // The rubric evaluator judges writing, not correctness. Saying so is the
  // difference between useful feedback and a misleading score.
  const caveat =
    method === "rubric"
      ? " Scores here reflect how your answers are written — structure, specificity and clarity — not whether the technical content is correct."
      : "";
  const review = awaitingReview
    ? " Some responses could not be scored and are waiting for a reviewer."
    : "";

  return band + caveat + review;
}
