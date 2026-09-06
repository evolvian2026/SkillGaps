/**
 * The evaluation interface.
 *
 * Every scoring method sits behind this one type, so the method can change
 * without touching the data model or any caller. `interview_responses` stores
 * the same shape whether a rubric, a model, or a human produced it.
 */

export interface RubricCriterion {
  /** Stable identifier, e.g. "structure". Persisted in criterion scores. */
  key: string;
  label: string;
  /** What a strong answer does. Feeds both the heuristic and the model prompt. */
  description: string;
  /** Relative weight within the question. */
  weight: number;
}

export interface EvaluationRequest {
  questionPrompt: string;
  questionKind: "behavioral" | "technical" | "situational";
  responseText: string;
  criteria: RubricCriterion[];
}

export interface CriterionScore {
  key: string;
  /** 0-100 for this criterion. Meaningless when `assessed` is false. */
  score: number;
  comment: string;
  /**
   * False when the evaluator has no way to judge this criterion — the rubric
   * evaluator cannot assess technical correctness, for instance. Unassessed
   * criteria are excluded from the weighted score and shown as not assessed,
   * rather than given a made-up number that contradicts the caveat.
   */
  assessed: boolean;
}

export interface EvaluationResult {
  /** 0-100 overall for this response. */
  score: number;
  criterionScores: CriterionScore[];
  strengths: string[];
  improvements: string[];
  /**
   * When false the response was not scored and needs a human — the caller
   * stores it as `awaiting_review` rather than as a zero, because an unscored
   * answer is not a wrong answer.
   */
  scored: boolean;
}

export interface EvaluationOutcome {
  result: EvaluationResult;
  /** Recorded verbatim in `ai_evaluations` for audit and re-runs. */
  audit: {
    method: "rubric" | "model" | "manual";
    evaluatorVersion: string;
    modelId: string | null;
    input: unknown;
    output: unknown;
    usage: unknown;
    durationMs: number;
    error: string | null;
  };
}

export interface Evaluator {
  readonly method: "rubric" | "model" | "manual";
  readonly version: string;
  evaluate(request: EvaluationRequest): Promise<EvaluationOutcome>;
}

/** The criteria used when a question does not define its own. */
export const DEFAULT_CRITERIA: RubricCriterion[] = [
  {
    key: "structure",
    label: "Structure",
    description:
      "The answer follows a clear arc — situation, what they did, and the outcome — rather than wandering.",
    weight: 1,
  },
  {
    key: "specificity",
    label: "Specificity",
    description:
      "Concrete details: named technologies, numbers, and the candidate's own actions rather than generalities.",
    weight: 1,
  },
  {
    key: "clarity",
    label: "Clarity",
    description:
      "Plain, direct language a non-specialist interviewer could follow, without filler or jargon for its own sake.",
    weight: 1,
  },
  {
    key: "relevance",
    label: "Relevance",
    description: "The answer addresses what was actually asked.",
    weight: 1,
  },
];
