import { describe, expect, it } from "vitest";
import { matchResumeToJd, missingByArea } from "@/lib/matching/match";
import type { ExtractedSkill } from "@/lib/matching/parser-client";

const skill = (
  name: string,
  area: string,
  weight: number,
  required = false,
  occurrences = 1,
): ExtractedSkill => ({
  skill: name,
  skillArea: area,
  weight,
  occurrences,
  required,
});

const JD = [
  skill("SQL", "SQL", 5, true),
  skill("Python", "PROG", 5, true),
  skill("Statistics", "STATS", 4, true),
  skill("Power BI", "PY_DATA", 3, false),
  skill("Communication", "APTI", 4, false),
];

describe("matchResumeToJd", () => {
  it("scores a full match at 100", () => {
    const result = matchResumeToJd(JD, JD);
    expect(result.score).toBe(100);
    expect(result.missing).toHaveLength(0);
    expect(result.requiredCoverage).toBe(100);
  });

  it("scores an empty resume at 0 and lists everything as missing", () => {
    const result = matchResumeToJd([], JD);
    expect(result.score).toBe(0);
    expect(result.missing).toHaveLength(JD.length);
    expect(result.requiredCoverage).toBe(0);
  });

  it("weights required skills above nice-to-haves", () => {
    // Same count of matches, but one covers the required half.
    const coversRequired = matchResumeToJd(
      [skill("SQL", "SQL", 5), skill("Python", "PROG", 5)],
      JD,
    );
    const coversOptional = matchResumeToJd(
      [skill("Power BI", "PY_DATA", 3), skill("Communication", "APTI", 4)],
      JD,
    );

    expect(coversRequired.score).toBeGreaterThan(coversOptional.score);
    expect(coversRequired.requiredCoverage).toBeGreaterThan(
      coversOptional.requiredCoverage,
    );
  });

  it("reports required coverage separately from the overall score", () => {
    const result = matchResumeToJd(
      [skill("Power BI", "PY_DATA", 3), skill("Communication", "APTI", 4)],
      JD,
    );
    expect(result.score).toBeGreaterThan(0);
    // Nothing required was covered, which is what a screener would notice.
    expect(result.requiredCoverage).toBe(0);
  });

  it("puts the most consequential gap first", () => {
    const result = matchResumeToJd([skill("SQL", "SQL", 5)], JD);
    expect(result.missing[0].required).toBe(true);
    // Required, highest weight first.
    expect(result.missing[0].skill).toBe("Python");
  });

  it("matches case-insensitively", () => {
    const result = matchResumeToJd([skill("sql", "SQL", 5)], [skill("SQL", "SQL", 5, true)]);
    expect(result.matched).toHaveLength(1);
  });

  it("lists resume skills the JD never asked for as extras", () => {
    const result = matchResumeToJd(
      [skill("SQL", "SQL", 5), skill("Docker", "CS_CORE", 3)],
      JD,
    );
    expect(result.extras).toContain("Docker");
    expect(result.extras).not.toContain("SQL");
  });

  it("treats a JD with no detected skills as full required coverage, not a crash", () => {
    const result = matchResumeToJd([skill("SQL", "SQL", 5)], []);
    expect(result.score).toBe(0);
    expect(result.requiredCoverage).toBe(100);
  });

  it("never returns a score outside 0-100", () => {
    for (const resume of [[], JD, [skill("Go", "PROG", 2)]]) {
      const result = matchResumeToJd(resume, JD);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });
});

describe("missingByArea", () => {
  it("groups gaps by skill area, largest group first", () => {
    const result = matchResumeToJd([], [
      skill("SQL", "SQL", 5, true),
      skill("Database Design", "SQL", 4, true),
      skill("Python", "PROG", 5, true),
    ]);
    const grouped = missingByArea(result.missing);
    expect(grouped[0].skillArea).toBe("SQL");
    expect(grouped[0].skills).toHaveLength(2);
  });
});
