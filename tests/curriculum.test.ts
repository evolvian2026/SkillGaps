import { describe, expect, it } from "vitest";
import {
  compareCurriculum,
  normaliseTopic,
  parseTopicList,
  topicMatches,
  type ReferenceTopic,
} from "@/lib/curriculum/compare";

const ref = (
  topic: string,
  skillArea: string,
  demandWeight: number,
  aliases: string[] = [],
): ReferenceTopic => ({ id: topic, topic, skillArea, aliases, demandWeight });

const REFERENCE = [
  ref("Joins and Subqueries", "SQL", 5, ["inner join", "left join"]),
  ref("Window Functions", "SQL", 4, ["rank", "partition by"]),
  ref("Indexing and Query Plans", "SQL", 4, ["index", "query optimization"]),
  ref("Version Control", "CS_CORE", 5, ["git", "branching"]),
];

describe("topicMatches", () => {
  it("matches regardless of case, punctuation and ampersands", () => {
    expect(topicMatches("JOINS & SUBQUERIES", REFERENCE[0])).toBe(true);
    expect(topicMatches("joins and subqueries", REFERENCE[0])).toBe(true);
  });

  it("matches an alias", () => {
    expect(topicMatches("Left Join operations", REFERENCE[0])).toBe(true);
  });

  it("matches when a syllabus line bundles the topic with others", () => {
    expect(
      topicMatches("SQL basics: joins and subqueries, grouping", REFERENCE[0]),
    ).toBe(true);
  });

  it("does not match an unrelated topic", () => {
    expect(topicMatches("Thermodynamics", REFERENCE[0])).toBe(false);
    expect(topicMatches("Engineering Drawing", REFERENCE[3])).toBe(false);
  });

  it("does not claim coverage from a single shared word", () => {
    // "Functions" alone must not cover "Window Functions" — a false positive
    // would tell a university it teaches something it does not.
    expect(topicMatches("Functions", REFERENCE[1])).toBe(false);
  });

  it("ignores empty topics", () => {
    expect(topicMatches("   ", REFERENCE[0])).toBe(false);
  });
});

describe("compareCurriculum", () => {
  const syllabus = [
    {
      subjectId: "s1",
      subjectName: "Database Management Systems",
      topics: ["Joins and subqueries", "Normalization", "Indexing and query plans"],
    },
    {
      subjectId: "s2",
      subjectName: "Software Engineering Lab",
      topics: ["Version control with Git", "Agile methodology"],
    },
  ];

  it("reports covered and missing topics per area", () => {
    const result = compareCurriculum(syllabus, REFERENCE);
    const sql = result.areas.find((a) => a.skillArea === "SQL")!;

    expect(sql.covered.map((c) => c.topic)).toContain("Joins and Subqueries");
    expect(sql.missing.map((m) => m.topic)).toContain("Window Functions");
  });

  it("names which subject covers each topic", () => {
    const result = compareCurriculum(syllabus, REFERENCE);
    const sql = result.areas.find((a) => a.skillArea === "SQL")!;
    const joins = sql.covered.find((c) => c.topic === "Joins and Subqueries")!;
    expect(joins.coveredBy).toContain("Database Management Systems");
  });

  it("weights coverage by demand rather than by topic count", () => {
    // SQL: covered weight 5+4=9 of 13 total.
    const result = compareCurriculum(syllabus, REFERENCE);
    const sql = result.areas.find((a) => a.skillArea === "SQL")!;
    expect(sql.coveragePercent).toBeCloseTo(69.2, 0);
  });

  it("puts the weakest area first", () => {
    const result = compareCurriculum(
      [{ subjectId: "s1", subjectName: "DBMS", topics: ["Joins and subqueries"] }],
      REFERENCE,
    );
    expect(result.areas[0].coveragePercent).toBeLessThanOrEqual(
      result.areas[result.areas.length - 1].coveragePercent,
    );
  });

  it("ranks priority gaps by demand weight", () => {
    const result = compareCurriculum([], REFERENCE);
    expect(result.priorityGaps[0].demandWeight).toBe(5);
    expect(result.overallCoverage).toBe(0);
  });

  it("reports full coverage when everything is taught", () => {
    const complete = REFERENCE.map((r) => r.topic);
    const result = compareCurriculum(
      [{ subjectId: "s1", subjectName: "Everything", topics: complete }],
      REFERENCE,
    );
    expect(result.overallCoverage).toBe(100);
    expect(result.priorityGaps).toHaveLength(0);
  });

  it("lists syllabus topics that match no reference topic", () => {
    const result = compareCurriculum(syllabus, REFERENCE);
    expect(result.unmatchedSyllabusTopics).toContain("Agile methodology");
  });

  it("handles an empty reference list without dividing by zero", () => {
    const result = compareCurriculum(syllabus, []);
    expect(result.overallCoverage).toBe(100);
    expect(result.areas).toHaveLength(0);
  });
});

describe("parseTopicList", () => {
  it("splits on newlines, commas and semicolons", () => {
    expect(parseTopicList("Joins\nIndexing, Views; Triggers")).toEqual([
      "Joins",
      "Indexing",
      "Views",
      "Triggers",
    ]);
  });

  it("strips bullet and numbering prefixes", () => {
    expect(parseTopicList("1. Joins\n- Indexing\n* Views")).toEqual([
      "Joins",
      "Indexing",
      "Views",
    ]);
  });

  it("drops empty entries", () => {
    expect(parseTopicList("Joins\n\n\n,,,\nIndexing")).toEqual(["Joins", "Indexing"]);
  });
});

describe("normaliseTopic", () => {
  it("expands ampersands and flattens punctuation", () => {
    expect(normaliseTopic("Data Structures & Algorithms!")).toBe(
      "data structures and algorithms",
    );
  });
});
