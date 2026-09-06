import { describe, expect, it } from "vitest";
import {
  computeReadiness,
  DEFAULT_WEIGHTS,
  normaliseWeights,
  readinessBand,
} from "@/lib/readiness/score";

describe("computeReadiness", () => {
  it("weights the three components as configured", () => {
    const result = computeReadiness({
      diagnosticPercent: 80,
      interviewPercent: 60,
      resumeMatchPercent: 50,
    });
    // 80*0.5 + 60*0.3 + 50*0.2 = 68
    expect(result.score).toBe(68);
    expect(result.componentsPresent).toBe(3);
    expect(result.missingComponents).toHaveLength(0);
  });

  it("renormalises rather than counting an absent component as zero", () => {
    const partial = computeReadiness({
      diagnosticPercent: 80,
      interviewPercent: null,
      resumeMatchPercent: null,
    });
    // Must be 80, not 40 — no interview is not a failed interview.
    expect(partial.score).toBe(80);
    expect(partial.componentsPresent).toBe(1);
    expect(partial.missingComponents).toEqual([
      "interviewPercent",
      "resumeMatchPercent",
    ]);
  });

  it("does not count a zero-weighted component as missing", () => {
    // An institution that does not run mock interviews.
    const result = computeReadiness(
      { diagnosticPercent: 80, interviewPercent: null, resumeMatchPercent: 60 },
      { diagnostic: 0.7, interview: 0, resume: 0.3 },
    );
    expect(result.missingComponents).not.toContain("interviewPercent");
    expect(result.score).toBe(74);
  });

  it("returns zero when the student has no data at all", () => {
    const result = computeReadiness({
      diagnosticPercent: null,
      interviewPercent: null,
      resumeMatchPercent: null,
    });
    expect(result.score).toBe(0);
    expect(result.componentsPresent).toBe(0);
  });

  it("reports the effective weights actually applied", () => {
    const result = computeReadiness({
      diagnosticPercent: 80,
      interviewPercent: 60,
      resumeMatchPercent: null,
    });
    // 0.5 and 0.3 renormalise to 0.625 / 0.375.
    expect(result.effectiveWeights.diagnostic).toBeCloseTo(0.63, 1);
    expect(result.effectiveWeights.interview).toBeCloseTo(0.38, 1);
    expect(result.effectiveWeights.resume).toBe(0);
  });

  it("clamps component values into 0-100", () => {
    const result = computeReadiness({
      diagnosticPercent: 140,
      interviewPercent: -20,
      resumeMatchPercent: null,
    });
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("ignores negative weights rather than inverting the score", () => {
    const result = computeReadiness(
      { diagnosticPercent: 80, interviewPercent: 20, resumeMatchPercent: null },
      { diagnostic: 1, interview: -5, resume: 0 },
    );
    expect(result.score).toBe(80);
  });
});

describe("normaliseWeights", () => {
  it("scales arbitrary weights to sum to one", () => {
    const result = normaliseWeights({ diagnostic: 5, interview: 3, resume: 2 });
    expect(result.diagnostic + result.interview + result.resume).toBeCloseTo(1, 2);
    expect(result.diagnostic).toBeCloseTo(0.5, 2);
  });

  it("falls back to defaults when everything is zero", () => {
    expect(normaliseWeights({ diagnostic: 0, interview: 0, resume: 0 })).toEqual(
      DEFAULT_WEIGHTS,
    );
  });
});

describe("readinessBand", () => {
  it("bands scores for the dashboard", () => {
    expect(readinessBand(85).tone).toBe("good");
    expect(readinessBand(60).tone).toBe("warn");
    expect(readinessBand(30).tone).toBe("risk");
  });
});
