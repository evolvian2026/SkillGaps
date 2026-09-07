/**
 * Reading a skill check honestly.
 *
 * A check is eight questions on one named area. That is short enough that the
 * score moves around a lot for reasons that have nothing to do with the
 * student: one lucky guess is twelve and a half points. Presenting a
 * three-point move as "you improved" would be the most tempting lie this
 * product could tell, and the one students would most reasonably believe.
 *
 * So the rule here is: report the numbers always, make a *claim* only when the
 * margin is bigger than the noise, and say plainly when it is not.
 *
 * Pure — no I/O — so these rules are testable and cannot drift from what the
 * page says.
 */

/**
 * Questions in one check: as many as eight, but never fewer than five.
 *
 * Eight is the target. The floor exists because a real question bank does not
 * hold eight items for every skill area, and refusing to run at all would make
 * the loop unusable in exactly the areas a student most needs it. What changes
 * with a shorter check is not whether it runs but what it is allowed to claim
 * — see `marginFor`.
 */
export const TARGET_CHECK_LENGTH = 8;
export const MIN_CHECK_LENGTH = 5;

/**
 * How much a check must move before it is called a change.
 *
 * Derived from the length rather than fixed, because a shorter check is a
 * noisier instrument and must therefore claim less. For n binary items near
 * 50% the standard error is about 50/√n points, so this is roughly two
 * standard errors:
 *
 *     5 items → 45 points     8 items → 35 points     12 items → 29 points
 *
 * That is a demanding bar, and deliberately so. The honest consequence is that
 * a short check will often say "too close to call" — which is true, and far
 * better than telling a student they improved when one lucky guess is twelve
 * points.
 */
export function marginFor(checkLength: number): number {
  if (checkLength <= 0) return 100;
  return Math.round(100 / Math.sqrt(checkLength));
}

/** A student may re-check one area this often. */
export const CHECK_COOLDOWN_HOURS = 12;

export type ProgressVerdict =
  | "improved"
  | "declined"
  | "too_close"
  | "no_baseline";

export interface CheckOutcome {
  percent: number;
  baselinePercent: number | null;
  delta: number | null;
  verdict: ProgressVerdict;
  message: string;
}

export function readCheck(
  percent: number,
  baselinePercent: number | null,
  checkLength: number = TARGET_CHECK_LENGTH,
): CheckOutcome {
  const margin = marginFor(checkLength);
  if (baselinePercent === null) {
    return {
      percent,
      baselinePercent: null,
      delta: null,
      verdict: "no_baseline",
      message: `You scored ${percent}% on this check. There is no diagnostic score for this area to compare it against yet.`,
    };
  }

  const delta = Math.round(percent - baselinePercent);

  if (Math.abs(delta) < margin) {
    return {
      percent,
      baselinePercent,
      delta,
      verdict: "too_close",
      // Named as a limit of the measurement, not of the student.
      message: `You scored ${percent}%, against ${baselinePercent}% on your diagnostic. A check this short cannot tell ${
        delta === 0 ? "no change" : `a ${Math.abs(delta)}-point move`
      } apart from luck — take it again after some practice.`,
    };
  }

  if (delta > 0) {
    return {
      percent,
      baselinePercent,
      delta,
      verdict: "improved",
      message: `You scored ${percent}%, up ${delta} points on your ${baselinePercent}% diagnostic. That is a big enough move to be worth something — the full diagnostic is what counts for your report.`,
    };
  }

  return {
    percent,
    baselinePercent,
    delta,
    verdict: "declined",
    message: `You scored ${percent}%, down ${Math.abs(delta)} points on your ${baselinePercent}% diagnostic. Worth practising this area before you sit another full paper.`,
  };
}

export type CheckBlock =
  | { allowed: true }
  | { allowed: false; reason: string; retryAfter?: Date };

/**
 * Whether a student may start a check on an area right now.
 *
 * The cooldown is not bureaucracy: without it a student can re-check an area
 * repeatedly until a lucky run produces a number they like, and they would be
 * measuring the bank's item exposure rather than their own skill.
 */
export function canStartCheck(input: {
  availableQuestions: number;
  lastCheckAt: Date | null;
  now?: Date;
}): CheckBlock {
  const now = input.now ?? new Date();

  if (input.availableQuestions < MIN_CHECK_LENGTH) {
    return {
      allowed: false,
      reason: `This area does not have ${MIN_CHECK_LENGTH} questions available for a check yet. The practice set and the resources on your report are the next best thing.`,
    };
  }

  if (input.lastCheckAt) {
    const retryAfter = new Date(
      input.lastCheckAt.getTime() + CHECK_COOLDOWN_HOURS * 3_600_000,
    );
    if (retryAfter > now) {
      const hours = Math.max(
        1,
        Math.ceil((retryAfter.getTime() - now.getTime()) / 3_600_000),
      );
      return {
        allowed: false,
        reason: `You checked this area recently. You can take it again in about ${hours} ${
          hours === 1 ? "hour" : "hours"
        } — repeating it straight away measures the question bank, not your progress.`,
        retryAfter,
      };
    }
  }

  return { allowed: true };
}

export interface PracticeSummary {
  attempted: number;
  correct: number;
}

/**
 * What to say at the end of a practice run.
 *
 * Practice is not scored into anything, so this deliberately avoids the
 * language of assessment: it points at what to do next rather than grading.
 */
export function readPractice(summary: PracticeSummary): string {
  const { attempted, correct } = summary;
  if (attempted === 0) return "No questions answered yet.";

  const wrong = attempted - correct;
  if (wrong === 0) {
    return `All ${attempted} right. When you are ready, take the skill check to see whether it shows up against your diagnostic.`;
  }
  return `${correct} of ${attempted} right. Read the explanations on the ${wrong} you missed, then take the skill check when you want to measure it.`;
}

/** Ordering for a student's gap list: worst first, and only real gaps. */
export interface AreaGap {
  skillAreaId: string;
  code: string;
  name: string;
  percent: number;
  hiringBarPercent: number | null;
}

export function prioritiseGaps(areas: readonly AreaGap[]): AreaGap[] {
  return areas
    .filter((a) =>
      a.hiringBarPercent === null ? a.percent < 60 : a.percent < a.hiringBarPercent,
    )
    .sort((a, b) => {
      // Furthest below its own bar first, so areas scored against different
      // bars are ranked comparably rather than by raw percentage.
      const gapA = (a.hiringBarPercent ?? 60) - a.percent;
      const gapB = (b.hiringBarPercent ?? 60) - b.percent;
      return gapB - gapA;
    });
}
