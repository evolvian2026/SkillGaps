import { describe, expect, it } from "vitest";
import {
  THIN_COHORT,
  focusForSubject,
  rankAreas,
  summarise,
  type AreaPerformance,
} from "@/lib/faculty/subject-focus";
import type { ReferenceTopic } from "@/lib/curriculum/compare";

/**
 * A lecturer's view has one job: say which of the things *they teach* their
 * class is weakest at. These tests are mostly about what it must refuse to
 * claim — a class of four is not a pattern, and an area the subject does not
 * teach is not the lecturer's problem.
 */

const ref = (
  id: string,
  skillArea: string,
  topic: string,
  demandWeight = 1,
  aliases: string[] = [],
): ReferenceTopic => ({ id, skillArea, topic, aliases, demandWeight });

const REFERENCE: ReferenceTopic[] = [
  ref("1", "SQL", "Window Functions", 3),
  ref("2", "SQL", "Joins", 2),
  ref("3", "SQL", "Query Optimisation", 3),
  ref("4", "DSA", "Dynamic Programming", 3),
  ref("5", "DSA", "Binary Search", 2),
  ref("6", "ML", "Gradient Descent", 2),
];

const perf = (
  code: string,
  over: Partial<AreaPerformance> = {},
): AreaPerformance => ({
  skillAreaId: `id-${code}`,
  code,
  name: code,
  average: 60,
  studentCount: 30,
  belowBarCount: 5,
  hiringBarPercent: 70,
  ...over,
});

describe("mapping a syllabus to what it teaches", () => {
  it("claims only the areas the syllabus actually covers", () => {
    const focus = focusForSubject(["Joins", "Window Functions"], REFERENCE);
    expect(focus.areaCodes).toEqual(["SQL"]);
  });

  it("lists gaps only inside the areas it teaches", () => {
    // A SQL lecturer is not answerable for Gradient Descent. Listing every
    // in-demand topic would bury the ones they can act on.
    const focus = focusForSubject(["Joins"], REFERENCE);
    expect(focus.missingTopics.map((t) => t.topic)).toEqual([
      "Window Functions",
      "Query Optimisation",
    ]);
    expect(focus.missingTopics.some((t) => t.skillArea === "ML")).toBe(false);
  });

  it("orders gaps by demand, so the costliest is first", () => {
    const focus = focusForSubject(["Joins"], REFERENCE);
    expect(focus.missingTopics[0].demandWeight).toBeGreaterThanOrEqual(
      focus.missingTopics[1].demandWeight,
    );
  });

  it("reports syllabus topics that match nothing in the reference list", () => {
    // Not a criticism of the topic — it is how a lecturer finds out the
    // benchmark has never heard of something they teach.
    const focus = focusForSubject(["Joins", "Departmental Viva"], REFERENCE);
    expect(focus.unmatchedTopics).toEqual(["Departmental Viva"]);
  });

  it("ranks the area a subject covers most heavily first", () => {
    const focus = focusForSubject(
      ["Joins", "Window Functions", "Binary Search"],
      REFERENCE,
    );
    expect(focus.areaCodes[0]).toBe("SQL");
  });

  it("returns nothing for an empty syllabus rather than claiming everything", () => {
    const focus = focusForSubject([], REFERENCE);
    expect(focus.areaCodes).toEqual([]);
    expect(focus.missingTopics).toEqual([]);
  });
});

describe("ranking what the class is weakest at", () => {
  const focus = focusForSubject(["Joins", "Dynamic Programming"], REFERENCE);

  it("puts the weakest area first", () => {
    const ranked = rankAreas(focus, [
      perf("SQL", { belowBarCount: 2, studentCount: 30 }),
      perf("DSA", { belowBarCount: 20, studentCount: 30, average: 41 }),
    ]);
    expect(ranked[0].code).toBe("DSA");
    expect(ranked[0].verdict).toBe("weak");
  });

  it("calls half the class below the bar weak", () => {
    const ranked = rankAreas(focus, [perf("SQL", { belowBarCount: 15, studentCount: 30 })]);
    expect(ranked[0].verdict).toBe("weak");
    expect(ranked[0].message).toContain("15 of 30");
  });

  it("calls a quarter below the bar worth watching, not weak", () => {
    const ranked = rankAreas(focus, [perf("SQL", { belowBarCount: 8, studentCount: 30 })]);
    expect(ranked[0].verdict).toBe("watch");
  });

  it("calls a class mostly above the bar fine", () => {
    const ranked = rankAreas(focus, [perf("SQL", { belowBarCount: 2, studentCount: 30 })]);
    expect(ranked[0].verdict).toBe("fine");
  });

  it("refuses to read a pattern from a handful of students", () => {
    // A lecturer acting on a three-student average would be acting on noise.
    const ranked = rankAreas(focus, [
      perf("SQL", { studentCount: THIN_COHORT - 1, belowBarCount: 4 }),
    ]);
    expect(ranked[0].verdict).toBe("thin");
    expect(ranked[0].message).toMatch(/too few/i);
  });

  it("says plainly when nobody has been assessed", () => {
    const ranked = rankAreas(focus, []);
    expect(ranked.every((a) => a.verdict === "no_data")).toBe(true);
    expect(ranked[0].message).toMatch(/no one in this class/i);
  });

  it("does not invent a threshold when no single bar applies", () => {
    // Mixed tracks set different bars, so there is nothing to be "below".
    const ranked = rankAreas(focus, [
      perf("SQL", { hiringBarPercent: null, belowBarCount: 0 }),
    ]);
    expect(ranked[0].verdict).toBe("watch");
    expect(ranked[0].message).toMatch(/different ones/i);
    expect(ranked[0].message).not.toMatch(/below the null/);
  });

  it("carries the lecturer's own topics on each area", () => {
    // So the message names the thing they teach, not just a skill area.
    const ranked = rankAreas(focus, [perf("SQL")]);
    expect(ranked.find((a) => a.code === "SQL")?.topics).toContain("Joins");
  });

  it("never reports an area the subject does not teach", () => {
    const ranked = rankAreas(focus, [perf("SQL"), perf("ML", { belowBarCount: 29 })]);
    expect(ranked.map((a) => a.code)).not.toContain("ML");
  });
});

describe("the one-line summary", () => {
  const focus = focusForSubject(["Joins", "Dynamic Programming"], REFERENCE);

  it("says nothing to report when no one has been assessed", () => {
    expect(summarise(rankAreas(focus, []))).toMatch(/no one/i);
  });

  it("names the weak areas when there are some", () => {
    const ranked = rankAreas(focus, [
      perf("SQL", { name: "SQL", belowBarCount: 20, studentCount: 30 }),
      perf("DSA", { name: "DSA", belowBarCount: 2, studentCount: 30 }),
    ]);
    expect(summarise(ranked)).toContain("SQL");
    expect(summarise(ranked)).not.toContain("DSA");
  });

  it("does not manufacture a problem when there is none", () => {
    const ranked = rankAreas(focus, [
      perf("SQL", { belowBarCount: 1, studentCount: 30 }),
      perf("DSA", { belowBarCount: 1, studentCount: 30 }),
    ]);
    expect(summarise(ranked)).toMatch(/no area/i);
  });

  it("does not count a thin cohort as evidence either way", () => {
    const ranked = rankAreas(focus, [perf("SQL", { studentCount: 3, belowBarCount: 3 })]);
    expect(summarise(ranked)).toMatch(/no one|nothing to report/i);
  });
});
