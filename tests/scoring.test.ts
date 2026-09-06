import { describe, expect, it } from "vitest";
import {
  aggregateBySkillArea,
  gradeCodeAnswer,
  gradeShortAnswer,
  percentOf,
  rankGaps,
  summariseIntegrity,
} from "@/lib/assessment/scoring";

describe("percentOf", () => {
  it("computes a rounded percentage", () => {
    expect(percentOf(7, 10)).toBe(70);
    expect(percentOf(1, 3)).toBe(33.33);
  });

  it("returns 0 rather than dividing by zero for an empty paper", () => {
    expect(percentOf(0, 0)).toBe(0);
  });
});

describe("aggregateBySkillArea", () => {
  it("sums points per area and derives each area's percentage", () => {
    const result = aggregateBySkillArea([
      { skillAreaId: "dsa", pointsAwarded: 2, pointsPossible: 3 },
      { skillAreaId: "dsa", pointsAwarded: 1, pointsPossible: 1 },
      { skillAreaId: "sql", pointsAwarded: 0, pointsPossible: 2 },
    ]);

    expect(result).toHaveLength(2);
    const dsa = result.find((r) => r.skillAreaId === "dsa")!;
    expect(dsa.score).toBe(3);
    expect(dsa.maxScore).toBe(4);
    expect(dsa.percent).toBe(75);

    const sql = result.find((r) => r.skillAreaId === "sql")!;
    expect(sql.percent).toBe(0);
  });
});

describe("gradeShortAnswer", () => {
  it("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(gradeShortAnswer("  o(N) ", ["O(n)"])).toBe(true);
  });

  it("collapses internal whitespace before comparing", () => {
    expect(gradeShortAnswer("L1   regularisation", ["L1 regularisation"])).toBe(true);
  });

  it("rejects an unanswered or unmatched response", () => {
    expect(gradeShortAnswer(null, ["O(n)"])).toBe(false);
    expect(gradeShortAnswer("O(n log n)", ["O(n)"])).toBe(false);
    expect(gradeShortAnswer("anything", [])).toBe(false);
  });
});

describe("gradeCodeAnswer", () => {
  it("awards points in proportion to test cases passed", () => {
    expect(gradeCodeAnswer(3, 4, 3)).toBe(2.25);
    expect(gradeCodeAnswer(4, 4, 3)).toBe(3);
    expect(gradeCodeAnswer(0, 4, 3)).toBe(0);
  });

  it("awards nothing when a question has no test cases", () => {
    expect(gradeCodeAnswer(0, 0, 3)).toBe(0);
  });
});

describe("rankGaps", () => {
  const areas = [
    { skillAreaId: "dsa", percent: 60, hiringBarPercent: 70, gap: null },
    { skillAreaId: "sql", percent: 55, hiringBarPercent: 50, gap: null },
    { skillAreaId: "sysd", percent: 30, hiringBarPercent: 55, gap: null },
    { skillAreaId: "apti", percent: 68, hiringBarPercent: 70, gap: null },
  ];

  it("ranks by distance below the bar, not by raw score", () => {
    const ranked = rankGaps(areas);
    expect(ranked.map((r) => r.skillAreaId)).toEqual(["sysd", "dsa", "apti"]);
    expect(ranked[0].gap).toBe(25);
  });

  it("excludes areas already at or above the bar", () => {
    // sql scores lower than apti but is above its bar, so it must not appear.
    expect(rankGaps(areas).map((r) => r.skillAreaId)).not.toContain("sql");
  });

  it("ignores areas with no configured bar", () => {
    expect(rankGaps([{ skillAreaId: "x", percent: 10, hiringBarPercent: null, gap: null }]))
      .toHaveLength(0);
  });

  it("honours the limit", () => {
    expect(rankGaps(areas, 2)).toHaveLength(2);
  });
});

describe("summariseIntegrity", () => {
  it("counts repeated events by type", () => {
    const summary = summariseIntegrity(
      ["tab_blur", "tab_blur", "paste_blocked"],
      1800,
      2700,
      0.25,
    );
    expect(summary.tab_blur).toBe(2);
    expect(summary.paste_blocked).toBe(1);
  });

  it("flags a suspiciously fast completion", () => {
    const summary = summariseIntegrity([], 300, 2700, 0.25);
    expect(summary.fast_completion).toBe(1);
  });

  it("does not flag a normal-length attempt", () => {
    expect(summariseIntegrity([], 1800, 2700, 0.25).fast_completion).toBeUndefined();
  });

  it("produces no flags for a clean attempt", () => {
    expect(summariseIntegrity([], 2000, 2700, 0.25)).toEqual({});
  });
});
