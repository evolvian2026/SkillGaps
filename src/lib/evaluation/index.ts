import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import { aiEvaluations } from "@/lib/db/schema";
import { RubricEvaluator } from "./rubric";
import { ModelEvaluator, isModelEvaluatorAvailable } from "./model";
import type { EvaluationOutcome, EvaluationRequest, Evaluator } from "./types";

export * from "./types";
export { RUBRIC_VERSION } from "./rubric";

/**
 * Manual evaluator: records the response and routes it to a human.
 *
 * Not a stub — it is the honest option for an institution that wants faculty
 * to mark interviews, and it is what the other evaluators fall back to when
 * they cannot produce a score.
 */
class ManualEvaluator implements Evaluator {
  readonly method = "manual" as const;
  readonly version = "manual-v1";

  async evaluate(request: EvaluationRequest): Promise<EvaluationOutcome> {
    return {
      result: {
        score: 0,
        criterionScores: [],
        strengths: [],
        improvements: [],
        scored: false,
      },
      audit: {
        method: "manual",
        evaluatorVersion: this.version,
        modelId: null,
        input: request,
        output: null,
        usage: null,
        durationMs: 0,
        error: null,
      },
    };
  }
}

/**
 * Selects the evaluator.
 *
 * `EVALUATION_METHOD` picks explicitly; otherwise the model evaluator is used
 * when credentials exist and the rubric otherwise, so a deployment without an
 * API key still returns useful feedback instead of failing.
 */
export function selectEvaluator(): Evaluator {
  const configured = process.env.EVALUATION_METHOD;

  if (configured === "manual") return new ManualEvaluator();
  if (configured === "rubric") return new RubricEvaluator();
  if (configured === "model") {
    if (!isModelEvaluatorAvailable()) {
      console.warn(
        "[evaluation] EVALUATION_METHOD=model but no Anthropic credentials found; using rubric.",
      );
      return new RubricEvaluator();
    }
    return new ModelEvaluator();
  }

  return isModelEvaluatorAvailable() ? new ModelEvaluator() : new RubricEvaluator();
}

/**
 * Runs an evaluation and writes the audit row.
 *
 * The audit write is not optional and not best-effort: an unlogged evaluation
 * is one that cannot be re-run or defended, which is the whole point of the
 * table.
 */
export async function evaluateAndLog(
  tx: Db,
  args: {
    tenantId: string;
    subjectType: string;
    subjectId: string;
    request: EvaluationRequest;
    evaluator?: Evaluator;
  },
): Promise<EvaluationOutcome> {
  const evaluator = args.evaluator ?? selectEvaluator();
  const outcome = await evaluator.evaluate(args.request);

  await tx.insert(aiEvaluations).values({
    tenantId: args.tenantId,
    subjectType: args.subjectType,
    subjectId: args.subjectId,
    method: outcome.audit.method,
    status: outcome.audit.error
      ? "failed"
      : outcome.result.scored
        ? "succeeded"
        : "awaiting_review",
    evaluatorVersion: outcome.audit.evaluatorVersion,
    modelId: outcome.audit.modelId,
    input: outcome.audit.input as never,
    output: outcome.audit.output as never,
    errorMessage: outcome.audit.error,
    usage: outcome.audit.usage as never,
    durationMs: outcome.audit.durationMs,
  });

  return outcome;
}

/** Prior evaluations of one subject, newest first — the audit trail view. */
export async function evaluationHistory(tx: Db, subjectId: string) {
  return tx
    .select()
    .from(aiEvaluations)
    .where(eq(aiEvaluations.subjectId, subjectId));
}
