import { describe, expect, it } from "vitest";
import {
  buildTrustReport,
  CONFIDENT_COHORT,
  MIN_COHORT,
  wilsonInterval,
  type OutcomeRecord,
} from "@/lib/trust/report";

function cohort(
  count: number,
  score: number,
  placedRate: number,
  prefix = "u",
): OutcomeRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    userId: `${prefix}${i}`,
    score,
    placed: i < Math.round(count * placedRate),
  }));
}

describe("wilsonInterval", () => {
  it("stays inside 0-100 even at the extremes", () => {
    const all = wilsonInterval(20, 20)!;
    expect(all.high).toBeLessThanOrEqual(100);
    const none = wilsonInterval(0, 20)!;
    expect(none.low).toBeGreaterThanOrEqual(0);
  });

  it("narrows as the sample grows", () => {
    const small = wilsonInterval(15, 20)!;
    const large = wilsonInterval(150, 200)!;
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });

  it("returns nothing for an empty sample", () => {
    expect(wilsonInterval(0, 0)).toBeNull();
  });
});

describe("buildTrustReport suppression", () => {
  it("withholds a band below the minimum cohort size", () => {
    const report = buildTrustReport(cohort(MIN_COHORT - 1, 80, 0.9));
    const top = report.bands.find((b) => b.minScore === 70)!;

    expect(top.suppressed).toBe(true);
    expect(top.placementRate).toBeNull();
    expect(top.note).toMatch(new RegExp(String(MIN_COHORT)));
  });

  it("reports a band at exactly the minimum", () => {
    const report = buildTrustReport(cohort(MIN_COHORT, 80, 0.9));
    const top = report.bands.find((b) => b.minScore === 70)!;
    expect(top.suppressed).toBe(false);
    expect(top.placementRate).toBeGreaterThan(0);
  });

  it("never leaks a count through a suppressed band's placement figures", () => {
    const report = buildTrustReport(cohort(3, 80, 1));
    const top = report.bands.find((b) => b.minScore === 70)!;
    expect(top.placedCount).toBe(0);
    expect(top.confidenceLow).toBeNull();
    expect(top.confidenceHigh).toBeNull();
  });

  it("flags a reportable but small band as preliminary", () => {
    const report = buildTrustReport(cohort(MIN_COHORT + 5, 80, 0.8));
    const top = report.bands.find((b) => b.minScore === 70)!;
    expect(top.note).toMatch(/preliminary/i);
  });
});

describe("buildTrustReport headline", () => {
  const strongEvidence = [
    ...cohort(120, 85, 0.85, "high"),
    ...cohort(120, 30, 0.15, "low"),
  ];

  it("produces a headline when the bands separate clearly", () => {
    const report = buildTrustReport(strongEvidence);
    expect(report.headline).not.toBeNull();
    expect(report.headline).toMatch(/70% or above/);
    // The claim must carry its sample size.
    expect(report.headline).toMatch(/n=/);
  });

  it("refuses a headline when the intervals overlap", () => {
    // Both bands place at a similar rate: no demonstrated relationship.
    const noEffect = [
      ...cohort(120, 85, 0.5, "high"),
      ...cohort(120, 30, 0.48, "low"),
    ];
    expect(buildTrustReport(noEffect).headline).toBeNull();
  });

  it("refuses a headline when either band is suppressed", () => {
    const thinTop = [...cohort(5, 85, 1, "high"), ...cohort(120, 30, 0.1, "low")];
    expect(buildTrustReport(thinTop).headline).toBeNull();
  });

  it("refuses a headline on an empty dataset", () => {
    const report = buildTrustReport([]);
    expect(report.headline).toBeNull();
    expect(report.totalStudents).toBe(0);
  });
});

describe("buildTrustReport caveats", () => {
  it("always states that this is association, not causation", () => {
    const report = buildTrustReport(cohort(200, 85, 0.8));
    expect(report.caveats.join(" ")).toMatch(/not evidence that the assessment causes/i);
  });

  it("warns when the whole dataset is small", () => {
    const report = buildTrustReport(cohort(MIN_COHORT, 80, 0.5));
    expect(report.caveats.join(" ")).toMatch(/early signal/i);
  });

  it("says when bands were withheld", () => {
    const report = buildTrustReport([
      ...cohort(120, 85, 0.8, "high"),
      ...cohort(3, 30, 0, "low"),
    ]);
    expect(report.caveats.join(" ")).toMatch(/withheld/i);
  });

  it("does not claim early-signal status for a large dataset", () => {
    const report = buildTrustReport(cohort(500, 85, 0.8));
    expect(report.caveats.join(" ")).not.toMatch(/early signal/i);
  });
});

describe("reportableStudents", () => {
  it("counts only students in bands that survived suppression", () => {
    const report = buildTrustReport([
      ...cohort(120, 85, 0.8, "high"),
      ...cohort(4, 30, 0, "low"),
    ]);
    expect(report.totalStudents).toBe(124);
    expect(report.reportableStudents).toBe(120);
  });
});

it("thresholds are ordered sensibly", () => {
  expect(MIN_COHORT).toBeLessThan(CONFIDENT_COHORT);
});
