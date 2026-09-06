import { describe, expect, it } from "vitest";
import { RubricEvaluator } from "@/lib/evaluation/rubric";
import { DEFAULT_CRITERIA } from "@/lib/evaluation/types";

const evaluator = new RubricEvaluator();
const QUESTION = "Tell me about a time you had to debug a difficult production issue.";

function score(responseText: string) {
  return evaluator.evaluate({
    questionPrompt: QUESTION,
    questionKind: "behavioral",
    responseText,
    criteria: DEFAULT_CRITERIA,
  });
}

const STRONG = `Last semester our college fest registration site started timing out on the
morning tickets opened. The problem was that every page load ran a count query over the
whole registrations table, which had grown past 40,000 rows.

First I reproduced it locally by seeding the same volume of data. Then I added logging
around the slow endpoint and found the query was taking 3.2 seconds. I decided to add an
index on the event_id column and cache the count in Redis with a 30 second TTL.

As a result response time dropped from 3.2 seconds to about 90 milliseconds, and we
handled around 1,200 concurrent users that day without a further outage. In the end the
lesson I took was to load-test with realistic data volumes before launch.`;

const WAFFLE = `So basically I mean like I just kind of worked on stuff and things like
that, you know, it was actually a difficult thing and obviously I sort of handled it and
etc. and so on.`;

describe("RubricEvaluator", () => {
  it("scores a detailed, structured answer well above a vague one", async () => {
    const strong = await score(STRONG);
    const waffle = await score(WAFFLE);

    expect(strong.result.score).toBeGreaterThan(waffle.result.score + 25);
    expect(strong.result.score).toBeGreaterThan(65);
    expect(waffle.result.score).toBeLessThan(55);
  });

  it("rewards concrete detail on the specificity criterion", async () => {
    const withNumbers = await score(STRONG);
    const withoutNumbers = await score(
      "I looked at the site, found the slow part, and made it faster by adding an index. " +
        "It was better afterwards and everyone was happy with the improvement we made.",
    );

    const specificity = (r: Awaited<ReturnType<typeof score>>) =>
      r.result.criterionScores.find((c) => c.key === "specificity")!.score;

    expect(specificity(withNumbers)).toBeGreaterThan(specificity(withoutNumbers));
  });

  it("penalises filler on the clarity criterion", async () => {
    const clarity = (r: Awaited<ReturnType<typeof score>>) =>
      r.result.criterionScores.find((c) => c.key === "clarity")!.score;

    expect(clarity(await score(WAFFLE))).toBeLessThan(clarity(await score(STRONG)));
  });

  it("treats an unanswered question as scored zero, not as needing review", async () => {
    const empty = await score("   ");
    expect(empty.result.score).toBe(0);
    expect(empty.result.scored).toBe(true);
    expect(empty.result.improvements[0]).toMatch(/No answer/i);
  });

  it("keeps every score within 0-100", async () => {
    for (const text of [STRONG, WAFFLE, "x", "word ".repeat(2000)]) {
      const result = await score(text);
      expect(result.result.score).toBeGreaterThanOrEqual(0);
      expect(result.result.score).toBeLessThanOrEqual(100);
      for (const c of result.result.criterionScores) {
        expect(c.score).toBeGreaterThanOrEqual(0);
        expect(c.score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("returns audit data for every evaluation, so nothing is unlogged", async () => {
    const result = await score(STRONG);
    expect(result.audit.method).toBe("rubric");
    expect(result.audit.evaluatorVersion).toBe("rubric-v1");
    expect(result.audit.input).toBeTruthy();
    expect(result.audit.output).toBeTruthy();
    expect(result.audit.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("names actionable improvements on a weak answer", async () => {
    const waffle = await score(WAFFLE);
    expect(waffle.result.improvements.length).toBeGreaterThan(0);
    expect(waffle.result.improvements.join(" ")).toMatch(/\w{4,}/);
  });
});

describe("criteria the rubric cannot judge", () => {
  const TECHNICAL_CRITERIA = [
    {
      key: "correctness",
      label: "Technical correctness",
      description: "The explanation is accurate.",
      weight: 2,
    },
    {
      key: "clarity",
      label: "Clarity",
      description: "Explains it in a way a colleague could follow.",
      weight: 1,
    },
  ];

  async function scoreTechnical(text: string) {
    return evaluator.evaluate({
      questionPrompt: "What is a database index, and what does it cost you?",
      questionKind: "technical",
      responseText: text,
      criteria: TECHNICAL_CRITERIA,
    });
  }

  it("marks correctness as not assessed rather than inventing a number", async () => {
    const result = await scoreTechnical(STRONG);
    const correctness = result.result.criterionScores.find(
      (c) => c.key === "correctness",
    )!;

    expect(correctness.assessed).toBe(false);
    expect(correctness.comment).toMatch(/not assessed/i);
  });

  it("still assesses the criteria it can judge", async () => {
    const result = await scoreTechnical(STRONG);
    const clarity = result.result.criterionScores.find((c) => c.key === "clarity")!;
    expect(clarity.assessed).toBe(true);
    expect(clarity.score).toBeGreaterThan(0);
  });

  it("excludes unassessed criteria from the weighted score", async () => {
    // Correctness carries twice clarity's weight. If it were counted as a
    // score, the overall would be dragged toward it; it must not be.
    const result = await scoreTechnical(STRONG);
    const clarity = result.result.criterionScores.find((c) => c.key === "clarity")!;
    expect(result.result.score).toBe(clarity.score);
  });

  it("never lists an unassessed criterion as a strength or an improvement", async () => {
    const result = await scoreTechnical(WAFFLE);
    const text = [...result.result.strengths, ...result.result.improvements].join(" ");
    expect(text).not.toMatch(/correctness/i);
  });
});
