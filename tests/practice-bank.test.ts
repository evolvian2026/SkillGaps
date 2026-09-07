import { describe, expect, it } from "vitest";
import { PRACTICE_QUESTIONS } from "../scripts/seed-data/practice";
import { PRACTICE_LENGTH } from "@/lib/practice/session";

/**
 * The practice bank is hand-authored content, and a slip in it is worse than a
 * missing question: an item with two correct options, or none, quietly teaches
 * a student the wrong thing and they have no way to tell. These checks are
 * cheap and catch exactly the mistakes that authoring at volume produces.
 */

const AREAS = [...new Set(PRACTICE_QUESTIONS.map((q) => q.skillArea))];

describe("every practice item is well formed", () => {
  it("has exactly one correct option", () => {
    const broken = PRACTICE_QUESTIONS.filter(
      (q) => q.options.filter((o) => o.correct).length !== 1,
    ).map((q) => q.prompt);
    expect(broken).toEqual([]);
  });

  it("offers at least three options, so a guess is not a coin flip", () => {
    const thin = PRACTICE_QUESTIONS.filter((q) => q.options.length < 3).map(
      (q) => q.prompt,
    );
    expect(thin).toEqual([]);
  });

  it("has no duplicate option labels within one question", () => {
    const dupes = PRACTICE_QUESTIONS.filter(
      (q) => new Set(q.options.map((o) => o.label)).size !== q.options.length,
    ).map((q) => q.prompt);
    expect(dupes).toEqual([]);
  });

  it("carries an explanation, which is the entire point of practice", () => {
    const missing = PRACTICE_QUESTIONS.filter(
      (q) => !q.explanation || q.explanation.trim().length < 40,
    ).map((q) => q.prompt);
    expect(missing).toEqual([]);
  });

  it("uses a difficulty the draw understands", () => {
    for (const q of PRACTICE_QUESTIONS) {
      expect([1, 2, 3], q.prompt).toContain(q.difficulty);
    }
  });

  it("has no duplicate prompts", () => {
    const seen = new Map<string, number>();
    for (const q of PRACTICE_QUESTIONS) {
      seen.set(q.prompt, (seen.get(q.prompt) ?? 0) + 1);
    }
    expect([...seen.entries()].filter(([, n]) => n > 1).map(([p]) => p)).toEqual([]);
  });
});

describe("the bank can actually serve a practice run", () => {
  it("holds enough items per area to fill a session", () => {
    // A session draws PRACTICE_LENGTH items. An area with fewer serves a short
    // run, which works but is not what the page promises.
    for (const area of AREAS) {
      const n = PRACTICE_QUESTIONS.filter((q) => q.skillArea === area).length;
      expect(n, `${area} has only ${n} practice items`).toBeGreaterThanOrEqual(
        PRACTICE_LENGTH,
      );
    }
  });

  it("holds enough for more than one distinct session per area", () => {
    // The point of growing the bank: a student who practises twice should not
    // see the same six questions again.
    for (const area of AREAS) {
      const n = PRACTICE_QUESTIONS.filter((q) => q.skillArea === area).length;
      expect(n, `${area} cannot serve two distinct sessions`).toBeGreaterThan(
        PRACTICE_LENGTH,
      );
    }
  });

  it("spreads each area across more than one difficulty", () => {
    // A single-difficulty area makes the difficulty-balanced draw meaningless.
    for (const area of AREAS) {
      const levels = new Set(
        PRACTICE_QUESTIONS.filter((q) => q.skillArea === area).map((q) => q.difficulty),
      );
      expect(levels.size, `${area} is all one difficulty`).toBeGreaterThan(1);
    }
  });
});
