/**
 * Placement readiness score.
 *
 * A weighted composite of the three Phase 1/2 signals. Pure functions so the
 * arithmetic is testable and so the same code can run in a request or a job.
 */

export interface ReadinessWeights {
  diagnostic: number;
  interview: number;
  resume: number;
}

export interface ReadinessComponents {
  /** 0-100, latest diagnostic attempt. Null when never assessed. */
  diagnosticPercent: number | null;
  /** 0-100, latest evaluated mock interview. */
  interviewPercent: number | null;
  /** 0-100, best resume-JD match. */
  resumeMatchPercent: number | null;
}

export interface ReadinessResult {
  score: number;
  componentsPresent: number;
  /** The weights actually applied, after dropping absent components. */
  effectiveWeights: ReadinessWeights;
  missingComponents: (keyof ReadinessComponents)[];
}

export const DEFAULT_WEIGHTS: ReadinessWeights = {
  diagnostic: 0.5,
  interview: 0.3,
  resume: 0.2,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Computes the composite.
 *
 * Absent components are dropped and the remaining weights renormalised, rather
 * than counted as zero. A student who has taken the diagnostic but not yet done
 * a mock interview is not less ready than one who scored badly at both — and
 * scoring them as if they were would make the dashboard rank students by how
 * many features they had tried, not by how prepared they are.
 *
 * `componentsPresent` travels with the score so the UI can say how complete a
 * picture it is.
 */
export function computeReadiness(
  components: ReadinessComponents,
  weights: ReadinessWeights = DEFAULT_WEIGHTS,
): ReadinessResult {
  const entries: {
    key: keyof ReadinessComponents;
    value: number | null;
    weight: number;
  }[] = [
    {
      key: "diagnosticPercent",
      value: components.diagnosticPercent,
      weight: Math.max(0, weights.diagnostic),
    },
    {
      key: "interviewPercent",
      value: components.interviewPercent,
      weight: Math.max(0, weights.interview),
    },
    {
      key: "resumeMatchPercent",
      value: components.resumeMatchPercent,
      weight: Math.max(0, weights.resume),
    },
  ];

  // A component weighted to zero by the institution is not "missing" — it is
  // deliberately excluded, and must not drag the completeness signal down.
  const usable = entries.filter((e) => e.value !== null && e.weight > 0);
  const missing = entries
    .filter((e) => e.value === null && e.weight > 0)
    .map((e) => e.key);

  const totalWeight = usable.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight === 0) {
    return {
      score: 0,
      componentsPresent: 0,
      effectiveWeights: { diagnostic: 0, interview: 0, resume: 0 },
      missingComponents: missing,
    };
  }

  const score = usable.reduce(
    (sum, e) => sum + clampPercent(e.value!) * (e.weight / totalWeight),
    0,
  );

  const effective = (key: keyof ReadinessComponents): number => {
    const entry = usable.find((e) => e.key === key);
    return entry ? round2(entry.weight / totalWeight) : 0;
  };

  return {
    score: round2(score),
    componentsPresent: usable.length,
    effectiveWeights: {
      diagnostic: effective("diagnosticPercent"),
      interview: effective("interviewPercent"),
      resume: effective("resumeMatchPercent"),
    },
    missingComponents: missing,
  };
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/** Normalises admin-entered weights to sum to 1. */
export function normaliseWeights(weights: ReadinessWeights): ReadinessWeights {
  const total = weights.diagnostic + weights.interview + weights.resume;
  if (total <= 0) return DEFAULT_WEIGHTS;
  return {
    diagnostic: round2(weights.diagnostic / total),
    interview: round2(weights.interview / total),
    resume: round2(weights.resume / total),
  };
}

/** Plain-language band for the dashboard. Provisional, like the hiring bars. */
export function readinessBand(score: number): {
  label: string;
  tone: "good" | "warn" | "risk";
} {
  if (score >= 70) return { label: "On track", tone: "good" };
  if (score >= 50) return { label: "Needs work", tone: "warn" };
  return { label: "At risk", tone: "risk" };
}
