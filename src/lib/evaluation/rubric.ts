import type {
  CriterionScore,
  EvaluationOutcome,
  EvaluationRequest,
  Evaluator,
} from "./types";

/**
 * Deterministic rubric evaluator.
 *
 * Scores observable surface features of an answer — length, structural
 * signals, concrete detail, overlap with the question — without a model. It is
 * the default because it needs no API key, costs nothing, and is reproducible.
 *
 * What it is NOT: a judge of whether the content is correct or the story is
 * true. It is a writing-quality signal, and the UI says so. When a model
 * evaluator is configured it supersedes this for content judgement.
 */

export const RUBRIC_VERSION = "rubric-v1";

const FILLER = [
  "basically", "actually", "literally", "just", "kind of", "sort of",
  "you know", "i mean", "like i said", "etc", "and so on", "stuff",
  "things like that", "obviously",
];

/** Signals that an answer walks through a situation and its resolution. */
const STRUCTURE_MARKERS = [
  "first", "then", "after", "finally", "because", "so that", "as a result",
  "the problem", "my role", "i decided", "i built", "i led", "we shipped",
  "the outcome", "in the end", "which meant", "initially", "eventually",
];

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "of", "to", "in", "on", "for",
  "with", "as", "by", "at", "from", "is", "are", "was", "were", "be", "been",
  "it", "its", "this", "that", "these", "those", "you", "your", "i", "my",
  "we", "our", "they", "their", "he", "she", "do", "does", "did", "have",
  "has", "had", "can", "could", "would", "should", "will", "about", "what",
  "when", "how", "why", "tell", "me", "describe", "explain", "time",
]);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countOccurrences(haystack: string, needles: string[]): number {
  return needles.reduce(
    (total, needle) => total + (haystack.includes(needle) ? 1 : 0),
    0,
  );
}

interface Signals {
  wordCount: number;
  sentenceCount: number;
  structureHits: number;
  fillerHits: number;
  numberCount: number;
  overlapRatio: number;
  firstPersonRatio: number;
}

function measure(request: EvaluationRequest): Signals {
  const text = request.responseText.trim();
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  const questionTokens = new Set(tokenise(request.questionPrompt));
  const answerTokens = tokenise(text);
  const overlap = answerTokens.filter((t) => questionTokens.has(t)).length;

  const firstPerson = (lower.match(/\b(i|my|me)\b/g) ?? []).length;

  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    structureHits: countOccurrences(lower, STRUCTURE_MARKERS),
    fillerHits: countOccurrences(lower, FILLER),
    numberCount: (text.match(/\b\d[\d,.]*\b|\b\d+%/g) ?? []).length,
    overlapRatio: questionTokens.size === 0 ? 0 : overlap / questionTokens.size,
    firstPersonRatio: words.length === 0 ? 0 : firstPerson / words.length,
  };
}

/**
 * A length score that rewards a usable answer without rewarding padding:
 * rises to a plateau across roughly 90-260 words, then falls away again.
 */
function lengthScore(wordCount: number): number {
  if (wordCount < 15) return 5;
  if (wordCount < 90) return 25 + ((wordCount - 15) / 75) * 55;
  if (wordCount <= 260) return 80 + Math.min(15, (wordCount - 90) / 12);
  return Math.max(45, 95 - (wordCount - 260) / 12);
}

function scoreCriterion(key: string, s: Signals, kind: string): CriterionScore {
  switch (key) {
    case "structure": {
      const marker = Math.min(45, s.structureHits * 11);
      const sentences = s.sentenceCount >= 3 ? 25 : s.sentenceCount * 8;
      const base = lengthScore(s.wordCount) * 0.3;
      const score = clamp(marker + sentences + base);
      return {
        key,
        score,
        assessed: true,
        comment:
          s.structureHits >= 3
            ? "The answer moves through the situation and its resolution in a followable order."
            : "Walk through it in order — the situation, what you did, and how it ended.",
      };
    }
    case "specificity": {
      const numbers = Math.min(35, s.numberCount * 12);
      const ownership =
        kind === "behavioral" ? Math.min(30, s.firstPersonRatio * 500) : 22;
      const length = lengthScore(s.wordCount) * 0.35;
      const score = clamp(numbers + ownership + length);
      return {
        key,
        score,
        assessed: true,
        comment:
          s.numberCount > 0
            ? "Concrete details are present, which is what makes an answer memorable."
            : "Add specifics — a number, a tool name, a measurable outcome.",
      };
    }
    case "clarity": {
      const penalty = Math.min(40, s.fillerHits * 9);
      const avgSentence =
        s.sentenceCount === 0 ? 40 : s.wordCount / s.sentenceCount;
      // Very long sentences are the usual clarity problem in written answers.
      const pacing = avgSentence > 32 ? 60 : avgSentence < 6 ? 65 : 90;
      const score = clamp(pacing - penalty + lengthScore(s.wordCount) * 0.1);
      return {
        key,
        score,
        assessed: true,
        comment:
          s.fillerHits > 2
            ? "Cut the filler phrases — they dilute otherwise good points."
            : "The writing is direct and easy to follow.",
      };
    }
    case "relevance": {
      const score = clamp(35 + s.overlapRatio * 160);
      return {
        key,
        score,
        assessed: true,
        comment:
          s.overlapRatio > 0.15
            ? "The answer engages with what was actually asked."
            : "Tie the answer back to the question more explicitly.",
      };
    }
    default: {
      // Correctness, depth, and anything else a question's rubric defines that
      // this evaluator has no signal for. Reporting a number here would claim
      // an assessment that did not happen.
      return {
        key,
        score: 0,
        assessed: false,
        comment:
          "Not assessed — this automated rubric judges how an answer is written, not whether its technical content is correct.",
      };
    }
  }
}

export class RubricEvaluator implements Evaluator {
  readonly method = "rubric" as const;
  readonly version = RUBRIC_VERSION;

  async evaluate(request: EvaluationRequest): Promise<EvaluationOutcome> {
    const startedAt = Date.now();
    const text = request.responseText?.trim() ?? "";

    if (text.length === 0) {
      return {
        result: {
          score: 0,
          criterionScores: [],
          strengths: [],
          improvements: ["No answer was given for this question."],
          scored: true,
        },
        audit: {
          method: "rubric",
          evaluatorVersion: this.version,
          modelId: null,
          input: request,
          output: { skipped: "empty response" },
          usage: null,
          durationMs: Date.now() - startedAt,
          error: null,
        },
      };
    }

    const signals = measure(request);
    const criterionScores = request.criteria.map((c) =>
      scoreCriterion(c.key, signals, request.questionKind),
    );

    // Only assessed criteria count, so a question whose rubric asks for
    // technical correctness is scored on what this evaluator could actually
    // judge rather than being dragged toward an invented middle.
    const totalWeight = request.criteria.reduce(
      (sum, c, i) => (criterionScores[i].assessed ? sum + c.weight : sum),
      0,
    );
    const weighted = request.criteria.reduce(
      (sum, c, i) =>
        criterionScores[i].assessed ? sum + criterionScores[i].score * c.weight : sum,
      0,
    );
    const score = totalWeight === 0 ? 0 : Math.round(weighted / totalWeight);

    const ranked = [...criterionScores]
      .filter((c) => c.assessed)
      .sort((a, b) => b.score - a.score);
    const labelOf = (key: string) =>
      request.criteria.find((c) => c.key === key)?.label ?? key;

    return {
      result: {
        score,
        criterionScores,
        strengths: ranked
          .filter((c) => c.score >= 65)
          .slice(0, 2)
          .map((c) => `${labelOf(c.key)}: ${c.comment}`),
        improvements: ranked
          .filter((c) => c.score < 65)
          .reverse()
          .slice(0, 2)
          .map((c) => `${labelOf(c.key)}: ${c.comment}`),
        scored: true,
      },
      audit: {
        method: "rubric",
        evaluatorVersion: this.version,
        modelId: null,
        input: { request, signals },
        output: { score, criterionScores },
        usage: null,
        durationMs: Date.now() - startedAt,
        error: null,
      },
    };
  }
}
