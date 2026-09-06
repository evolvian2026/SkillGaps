/**
 * Pure scoring logic. No database, no I/O — so it can be unit tested directly
 * and reused unchanged when Phase 2 adds a composite readiness score.
 */

export interface ScoredAnswer {
  skillAreaId: string;
  pointsAwarded: number;
  pointsPossible: number;
}

export interface SkillAreaScore {
  skillAreaId: string;
  score: number;
  maxScore: number;
  percent: number;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function percentOf(score: number, max: number): number {
  if (max <= 0) return 0;
  return round2((score / max) * 100);
}

export function aggregateBySkillArea(
  scored: readonly ScoredAnswer[],
): SkillAreaScore[] {
  const totals = new Map<string, { score: number; max: number }>();
  for (const answer of scored) {
    const bucket = totals.get(answer.skillAreaId) ?? { score: 0, max: 0 };
    bucket.score += answer.pointsAwarded;
    bucket.max += answer.pointsPossible;
    totals.set(answer.skillAreaId, bucket);
  }
  return [...totals.entries()].map(([skillAreaId, { score, max }]) => ({
    skillAreaId,
    score: round2(score),
    maxScore: round2(max),
    percent: percentOf(score, max),
  }));
}

/** Grades a short-answer response against the accepted answers list. */
export function gradeShortAnswer(
  response: string | null,
  accepted: readonly string[] | null,
): boolean {
  if (!response || !accepted || accepted.length === 0) return false;
  const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const given = normalise(response);
  return accepted.some((a) => normalise(a) === given);
}

/** Code questions score proportionally to test cases passed. */
export function gradeCodeAnswer(
  passedCount: number,
  totalCount: number,
  pointsPossible: number,
): number {
  if (totalCount <= 0) return 0;
  return round2((passedCount / totalCount) * pointsPossible);
}

export interface GapArea {
  skillAreaId: string;
  percent: number;
  hiringBarPercent: number | null;
  /** Percentage points below the bar. Null when no bar is configured. */
  gap: number | null;
}

/**
 * Rank weakest areas for the "focus here first" section of the report.
 *
 * Ordered by distance below the hiring bar rather than by raw score: an area
 * at 55% with a 50% bar is fine, while an area at 60% with an 85% bar is the
 * one costing the student interviews.
 */
export function rankGaps(areas: readonly GapArea[], limit = 3): GapArea[] {
  return [...areas]
    .map((area) => ({
      ...area,
      gap:
        area.hiringBarPercent === null
          ? null
          : round2(area.hiringBarPercent - area.percent),
    }))
    .filter((area) => (area.gap ?? 0) > 0)
    .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0))
    .slice(0, limit);
}

export type IntegritySummary = Record<string, number>;

/**
 * Turns raw integrity signals into the flag summary stored on the attempt.
 *
 * These are review hints, never a block: a student on a flaky hostel
 * connection will legitimately trigger tab/focus events, and treating that as
 * cheating would be both wrong and unfair.
 */
export function summariseIntegrity(
  eventTypes: readonly string[],
  elapsedSeconds: number,
  durationSeconds: number,
  fastCompletionRatio: number,
): IntegritySummary {
  const summary: IntegritySummary = {};
  for (const type of eventTypes) {
    summary[type] = (summary[type] ?? 0) + 1;
  }
  if (
    durationSeconds > 0 &&
    elapsedSeconds < durationSeconds * fastCompletionRatio
  ) {
    summary.fast_completion = 1;
  }
  return summary;
}
