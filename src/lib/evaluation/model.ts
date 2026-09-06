import Anthropic from "@anthropic-ai/sdk";
import type {
  CriterionScore,
  EvaluationOutcome,
  EvaluationRequest,
  Evaluator,
} from "./types";

/**
 * Model-based evaluator.
 *
 * Judges what the rubric evaluator cannot: whether the answer actually
 * addresses the question, whether the reasoning holds, and what specifically
 * would make it stronger.
 *
 * Every call's input and output is returned in `audit` and written to
 * `ai_evaluations`, so a score can be traced to the exact prompt that produced
 * it and re-run when the rubric or model changes.
 */

const MODEL_ID = "claude-opus-5";
export const MODEL_EVALUATOR_VERSION = "model-v1";

const SYSTEM_PROMPT = `You are an experienced technical interviewer at an Indian product company, giving feedback on a written mock-interview answer from a final-year engineering student.

Score each rubric criterion from 0 to 100, where:
- 0-40: would not pass a first-round screen
- 41-65: passable but forgettable
- 66-85: a solid answer that would move forward
- 86-100: genuinely strong; specific, well-structured, and complete

Be honest and concrete. A student is better served by an accurate 55 with two clear fixes than by an inflated 80. Never invent details the student did not write. Address the student directly as "you", keep each comment to one or two sentences, and make every improvement actionable — name what to add or cut, not just that the answer is weak.`;

/**
 * Structured output schema. Constraining the response shape means the parsing
 * below cannot drift into guesswork over free text.
 */
function outputSchema(criterionKeys: string[]) {
  return {
    type: "json_schema" as const,
    schema: {
      type: "object",
      properties: {
        criterion_scores: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string", enum: criterionKeys },
              score: { type: "integer", minimum: 0, maximum: 100 },
              comment: { type: "string" },
            },
            required: ["key", "score", "comment"],
            additionalProperties: false,
          },
        },
        strengths: { type: "array", items: { type: "string" }, maxItems: 3 },
        improvements: { type: "array", items: { type: "string" }, maxItems: 3 },
      },
      required: ["criterion_scores", "strengths", "improvements"],
      additionalProperties: false,
    },
  };
}

interface ModelOutput {
  criterion_scores: { key: string; score: number; comment: string }[];
  strengths: string[];
  improvements: string[];
}

export function isModelEvaluatorAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export class ModelEvaluator implements Evaluator {
  readonly method = "model" as const;
  readonly version = MODEL_EVALUATOR_VERSION;

  private client = new Anthropic();

  async evaluate(request: EvaluationRequest): Promise<EvaluationOutcome> {
    const startedAt = Date.now();
    const text = request.responseText?.trim() ?? "";

    if (text.length === 0) {
      return emptyOutcome(this.version, startedAt);
    }

    const userPrompt = [
      `Interview question (${request.questionKind}):`,
      request.questionPrompt,
      "",
      "Rubric criteria:",
      ...request.criteria.map((c) => `- ${c.key} (${c.label}): ${c.description}`),
      "",
      "The student's answer:",
      "---",
      text,
      "---",
    ].join("\n");

    const input = { system: SYSTEM_PROMPT, user: userPrompt, model: MODEL_ID };

    try {
      const response = await this.client.messages.create({
        model: MODEL_ID,
        max_tokens: 16000,
        thinking: { type: "adaptive" },
        system: SYSTEM_PROMPT,
        output_config: {
          effort: "medium",
          format: outputSchema(request.criteria.map((c) => c.key)),
        },
        messages: [{ role: "user", content: userPrompt }],
      });

      // A safety decline is not a zero — it goes to a human.
      if (response.stop_reason === "refusal") {
        return reviewOutcome(
          this.version,
          input,
          { stop_reason: "refusal", stop_details: response.stop_details },
          startedAt,
          "Model declined to evaluate this response.",
        );
      }

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return reviewOutcome(
          this.version,
          input,
          { content: response.content },
          startedAt,
          "Model returned no text block.",
        );
      }

      const parsed = JSON.parse(textBlock.text) as ModelOutput;
      const byKey = new Map(parsed.criterion_scores.map((c) => [c.key, c]));

      // Drive the output off our own criteria list rather than the model's, so
      // a missing or extra criterion cannot change the shape we store.
      const criterionScores: CriterionScore[] = request.criteria.map((c) => {
        const scored = byKey.get(c.key);
        return {
          key: c.key,
          score: clampScore(scored?.score),
          comment: scored?.comment ?? "Not assessed.",
          // The model judges every criterion it is handed; a key it omitted
          // is a gap in its output, not a criterion it cannot assess.
          assessed: scored !== undefined,
        };
      });

      const totalWeight = request.criteria.reduce(
        (sum, c, i) => (criterionScores[i].assessed ? sum + c.weight : sum),
        0,
      );
      const weighted = request.criteria.reduce(
        (sum, c, i) =>
          criterionScores[i].assessed ? sum + criterionScores[i].score * c.weight : sum,
        0,
      );

      return {
        result: {
          score: totalWeight === 0 ? 0 : Math.round(weighted / totalWeight),
          criterionScores,
          strengths: parsed.strengths.slice(0, 3),
          improvements: parsed.improvements.slice(0, 3),
          scored: true,
        },
        audit: {
          method: "model",
          evaluatorVersion: this.version,
          modelId: MODEL_ID,
          input,
          output: parsed,
          usage: response.usage,
          durationMs: Date.now() - startedAt,
          error: null,
        },
      };
    } catch (err) {
      // Rate limits, outages and malformed JSON all land here. The response is
      // queued for review rather than scored zero — an infrastructure failure
      // must never look like a bad answer on a student's record.
      const message =
        err instanceof Anthropic.APIError
          ? `Anthropic API error ${err.status}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "Unknown evaluation failure";
      return reviewOutcome(this.version, input, null, startedAt, message);
    }
  }
}

function clampScore(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function emptyOutcome(version: string, startedAt: number): EvaluationOutcome {
  return {
    result: {
      score: 0,
      criterionScores: [],
      strengths: [],
      improvements: ["No answer was given for this question."],
      scored: true,
    },
    audit: {
      method: "model",
      evaluatorVersion: version,
      modelId: null,
      input: null,
      output: { skipped: "empty response" },
      usage: null,
      durationMs: Date.now() - startedAt,
      error: null,
    },
  };
}

function reviewOutcome(
  version: string,
  input: unknown,
  output: unknown,
  startedAt: number,
  error: string,
): EvaluationOutcome {
  return {
    result: {
      score: 0,
      criterionScores: [],
      strengths: [],
      improvements: [],
      scored: false,
    },
    audit: {
      method: "model",
      evaluatorVersion: version,
      modelId: MODEL_ID,
      input,
      output,
      usage: null,
      durationMs: Date.now() - startedAt,
      error,
    },
  };
}
