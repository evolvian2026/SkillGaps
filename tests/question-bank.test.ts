import { describe, expect, it } from "vitest";
import { QUESTIONS } from "../scripts/seed-data/questions";
import { PRACTICE_QUESTIONS } from "../scripts/seed-data/practice";
import { TRACKS, SKILL_AREAS } from "../scripts/seed-data/taxonomy";
import { MIN_CHECK_LENGTH } from "@/lib/practice/progress";

/**
 * The diagnostic bank.
 *
 * A mistake here is worse than a mistake in practice: these items are graded,
 * and their answers are never shown, so a wrong key silently corrupts a
 * student's report, their institution's cohort averages, the employer pools and
 * the item statistics — with nothing on any screen to reveal it.
 *
 * The depth checks matter for a different reason. When a blueprint quota equals
 * the pool depth, randomisation is an illusion: every student sits the same
 * section and a retake is identical, which makes the paper trivially shareable.
 */

const MCQ = QUESTIONS.filter((q) => q.type === "mcq");

/** A paper should be able to vary, and a retake should differ from the first. */
const MIN_DEPTH_RATIO = 2.5;

describe("every diagnostic item is well formed", () => {
  it("gives multiple-choice questions exactly one correct option", () => {
    const broken = MCQ.filter(
      (q) => (q.options ?? []).filter((o) => o.correct).length !== 1,
    ).map((q) => q.prompt);
    expect(broken).toEqual([]);
  });

  it("offers at least three options, so a guess is not a coin flip", () => {
    const thin = MCQ.filter((q) => (q.options ?? []).length < 3).map((q) => q.prompt);
    expect(thin).toEqual([]);
  });

  it("has no duplicate option labels within one question", () => {
    const dupes = MCQ.filter((q) => {
      const labels = (q.options ?? []).map((o) => o.label);
      return new Set(labels).size !== labels.length;
    }).map((q) => q.prompt);
    expect(dupes).toEqual([]);
  });

  it("has no duplicate prompts", () => {
    const seen = new Map<string, number>();
    for (const q of QUESTIONS) seen.set(q.prompt, (seen.get(q.prompt) ?? 0) + 1);
    expect([...seen.entries()].filter(([, n]) => n > 1).map(([p]) => p)).toEqual([]);
  });

  it("names a real skill area and real tracks", () => {
    const areas = new Set(SKILL_AREAS.map((a) => a.code));
    const tracks = new Set(TRACKS.map((t) => t.code));
    for (const q of QUESTIONS) {
      expect(areas, q.prompt).toContain(q.skillArea);
      expect(q.tracks.length, `${q.prompt} is on no track`).toBeGreaterThan(0);
      for (const track of q.tracks) expect(tracks, q.prompt).toContain(track);
    }
  });

  it("uses a difficulty the balanced draw understands", () => {
    for (const q of QUESTIONS) expect([1, 2, 3], q.prompt).toContain(q.difficulty);
  });

  it("gives every short-answer question an accepted answer", () => {
    const broken = QUESTIONS.filter(
      (q) => q.type === "short" && (q.acceptedAnswers ?? []).length === 0,
    ).map((q) => q.prompt);
    expect(broken).toEqual([]);
  });

  it("gives every code question at least one test case", () => {
    const broken = QUESTIONS.filter(
      (q) => q.type === "code" && (q.testCases ?? []).length === 0,
    ).map((q) => q.prompt);
    expect(broken).toEqual([]);
  });
});

describe("the diagnostic and practice pools never overlap", () => {
  it("shares no prompt between the two banks", () => {
    // Practice reveals the answer. A prompt appearing in both would hand a
    // student the key to a question they are later graded on.
    const practice = new Set(PRACTICE_QUESTIONS.map((q) => q.prompt.trim()));
    const shared = QUESTIONS.filter((q) => practice.has(q.prompt.trim())).map(
      (q) => q.prompt,
    );
    expect(shared).toEqual([]);
  });
});

describe("each blueprint quota has enough depth to randomise", () => {
  const quotas = TRACKS.flatMap((track) =>
    (track.blueprint ?? []).map((item) => ({
      track: track.code,
      area: item.skillArea,
      quota: item.questionCount,
    })),
  );

  it("has a blueprint to check", () => {
    expect(quotas.length).toBeGreaterThan(0);
  });

  it("never sets a quota the pool can only just fill", () => {
    // Quota === pool means every student sits an identical section and a
    // retake asks the same questions in the same order of difficulty.
    const tight = quotas
      .map((q) => {
        const pool = QUESTIONS.filter(
          (item) => item.skillArea === q.area && item.tracks.includes(q.track),
        ).length;
        return { ...q, pool, ratio: pool / q.quota };
      })
      .filter((q) => q.ratio < MIN_DEPTH_RATIO)
      .map((q) => `${q.track}/${q.area}: quota ${q.quota}, pool ${q.pool}`);
    expect(tight).toEqual([]);
  });
});

describe("every area can support a skill check", () => {
  it("has enough diagnostic multiple-choice items per area", () => {
    // A check draws from the diagnostic pool for one area. Below the floor the
    // report hides the button, which works but leaves a gap a student cannot
    // measure.
    const thin = SKILL_AREAS.map((area) => ({
      code: area.code,
      n: MCQ.filter((q) => q.skillArea === area.code).length,
    }))
      .filter((a) => a.n < MIN_CHECK_LENGTH)
      .map((a) => `${a.code} has ${a.n}`);
    expect(thin).toEqual([]);
  });

  it("has room to prefer questions a student has not already seen", () => {
    // A check that can only serve items from the student's last paper is
    // measuring recall of that paper.
    for (const area of SKILL_AREAS) {
      const n = MCQ.filter((q) => q.skillArea === area.code).length;
      expect(n, `${area.code} has only ${n} multiple-choice items`).toBeGreaterThan(
        MIN_CHECK_LENGTH,
      );
    }
  });
});
