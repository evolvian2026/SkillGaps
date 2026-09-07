import { describe, expect, it } from "vitest";
import {
  CHECK_COOLDOWN_HOURS,
  MIN_CHECK_LENGTH,
  TARGET_CHECK_LENGTH,
  canStartCheck,
  marginFor,
  prioritiseGaps,
  readCheck,
  readPractice,
} from "@/lib/practice/progress";

/**
 * A skill check is eight questions. That is short enough that one lucky guess
 * is twelve and a half points, so most of these tests are about what the
 * product must refuse to claim — telling a student they improved when the
 * measurement cannot tell would be the most believable lie here.
 */

describe("reading a check against the diagnostic", () => {
  it("calls a large improvement an improvement", () => {
    const outcome = readCheck(80, 40, TARGET_CHECK_LENGTH);
    expect(outcome.verdict).toBe("improved");
    expect(outcome.delta).toBe(40);
    expect(outcome.message).toContain("up 40 points");
  });

  it("calls a large drop a drop, and points at practice", () => {
    const outcome = readCheck(30, 75, TARGET_CHECK_LENGTH);
    expect(outcome.verdict).toBe("declined");
    expect(outcome.message).toMatch(/down 45 points/);
    expect(outcome.message).toMatch(/practising/i);
  });

  it("refuses to call a one-question move an improvement", () => {
    // 12.5 points is a single item on an eight-item check.
    const outcome = readCheck(62.5, 50, TARGET_CHECK_LENGTH);
    expect(outcome.verdict).toBe("too_close");
    expect(outcome.message).toMatch(/cannot tell/i);
  });

  it("refuses just inside the margin and accepts just outside it", () => {
    const margin = marginFor(TARGET_CHECK_LENGTH);
    expect(readCheck(50 + margin - 1, 50, TARGET_CHECK_LENGTH).verdict).toBe("too_close");
    expect(readCheck(50 + margin, 50, TARGET_CHECK_LENGTH).verdict).toBe("improved");
  });

  it("demands a bigger move from a shorter, noisier check", () => {
    // The same 40-point move is evidence on an eight-item check and not on a
    // five-item one. The instrument changed, so the claim must too.
    expect(readCheck(80, 40, 8).verdict).toBe("improved");
    expect(readCheck(80, 40, 5).verdict).toBe("too_close");
  });

  it("treats an identical score as too close rather than as no change", () => {
    const outcome = readCheck(50, 50, TARGET_CHECK_LENGTH);
    expect(outcome.verdict).toBe("too_close");
    expect(outcome.delta).toBe(0);
    expect(outcome.message).toMatch(/no change/);
  });

  it("blames the measurement, not the student, when it cannot tell", () => {
    expect(readCheck(55, 50, TARGET_CHECK_LENGTH).message).toMatch(/a check this short/i);
  });

  it("says so when there is no diagnostic to compare against", () => {
    const outcome = readCheck(70, null, TARGET_CHECK_LENGTH);
    expect(outcome.verdict).toBe("no_baseline");
    expect(outcome.delta).toBeNull();
    expect(outcome.message).toMatch(/no diagnostic score/i);
  });

  it("never claims a check replaces the diagnostic", () => {
    // The report, the readiness score and every employer-facing number come
    // from the full paper. A check is a personal signal only.
    expect(readCheck(90, 40, TARGET_CHECK_LENGTH).message).toMatch(
      /full diagnostic is what counts/i,
    );
  });
});

describe("how much evidence a check of a given length needs", () => {
  it("demands more from a shorter check", () => {
    expect(marginFor(5)).toBeGreaterThan(marginFor(8));
    expect(marginFor(8)).toBeGreaterThan(marginFor(20));
  });

  it("tracks two standard errors of a proportion", () => {
    // 100/sqrt(n): 45 points at five items, 35 at eight.
    expect(marginFor(5)).toBe(45);
    expect(marginFor(8)).toBe(35);
  });

  it("refuses to claim anything from a check with no questions", () => {
    expect(marginFor(0)).toBe(100);
  });
});

describe("when a check may be taken", () => {
  const now = new Date("2026-03-01T12:00:00Z");

  it("allows a first check when the area has enough questions", () => {
    expect(
      canStartCheck({ availableQuestions: MIN_CHECK_LENGTH, lastCheckAt: null, now }),
    ).toEqual({ allowed: true });
  });

  it("refuses an area without enough questions, and says so", () => {
    const result = canStartCheck({
      availableQuestions: MIN_CHECK_LENGTH - 1,
      lastCheckAt: null,
      now,
    });
    expect(result.allowed).toBe(false);
    expect(result).toHaveProperty("reason", expect.stringMatching(/questions available/i));
  });

  it("refuses a repeat inside the cooldown", () => {
    // Without this a student can re-roll until a lucky run, which measures the
    // bank's exposure rather than their skill.
    const result = canStartCheck({
      availableQuestions: 20,
      lastCheckAt: new Date(now.getTime() - 60 * 60_000),
      now,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toMatch(/measures the question bank/i);
      expect(result.retryAfter).toBeInstanceOf(Date);
    }
  });

  it("allows it again once the cooldown has passed", () => {
    const result = canStartCheck({
      availableQuestions: 20,
      lastCheckAt: new Date(now.getTime() - (CHECK_COOLDOWN_HOURS + 1) * 3_600_000),
      now,
    });
    expect(result.allowed).toBe(true);
  });

  it("counts down in whole hours, never zero", () => {
    const result = canStartCheck({
      availableQuestions: 20,
      lastCheckAt: new Date(now.getTime() - (CHECK_COOLDOWN_HOURS * 3_600_000 - 60_000)),
      now,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toMatch(/1 hour/);
  });
});

describe("what practice says at the end", () => {
  it("points at the check when everything was right", () => {
    expect(readPractice({ attempted: 5, correct: 5 })).toMatch(/skill check/i);
  });

  it("points at the explanations when something was missed", () => {
    const message = readPractice({ attempted: 5, correct: 3 });
    expect(message).toContain("3 of 5");
    expect(message).toMatch(/explanations on the 2/i);
  });

  it("does not grade: practice feeds no score", () => {
    const message = readPractice({ attempted: 5, correct: 1 });
    expect(message).not.toMatch(/fail|poor|weak|bad/i);
  });

  it("handles an untouched session", () => {
    expect(readPractice({ attempted: 0, correct: 0 })).toMatch(/no questions/i);
  });
});

describe("which gaps to offer first", () => {
  const area = (
    code: string,
    percent: number,
    hiringBarPercent: number | null = 70,
  ) => ({ skillAreaId: code, code, name: code, percent, hiringBarPercent });

  it("keeps only areas below their own bar", () => {
    const gaps = prioritiseGaps([area("A", 80), area("B", 40)]);
    expect(gaps.map((g) => g.code)).toEqual(["B"]);
  });

  it("ranks by distance below the bar, not by raw score", () => {
    // B scores higher but is further below its own, higher bar.
    const gaps = prioritiseGaps([area("A", 40, 50), area("B", 45, 90)]);
    expect(gaps.map((g) => g.code)).toEqual(["B", "A"]);
  });

  it("falls back to a sensible line when no bar applies", () => {
    const gaps = prioritiseGaps([area("A", 55, null), area("B", 65, null)]);
    expect(gaps.map((g) => g.code)).toEqual(["A"]);
  });

  it("returns nothing when the student is above every bar", () => {
    expect(prioritiseGaps([area("A", 90), area("B", 85)])).toEqual([]);
  });
});
