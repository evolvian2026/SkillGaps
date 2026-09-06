/**
 * Trust and validation reporting.
 *
 * Produces the aggregate, anonymised statistics used as evidence in
 * conversations with universities and employers — "X% of students scoring
 * above Y were placed within Z months".
 *
 * Pure functions, so the suppression rules are testable. Two rules govern
 * everything here, because this output is the most likely to be quoted out of
 * context:
 *
 *  1. **Suppress rather than reveal.** Any figure computed from fewer than
 *     `MIN_COHORT` students is withheld. A statistic over four people is not
 *     evidence, and with a small enough group a percentage identifies someone.
 *
 *  2. **Never present a claim as stronger than its sample.** Every reportable
 *     figure carries its sample size and a confidence interval, and a
 *     statistic whose interval spans the no-effect point is labelled as not
 *     yet demonstrated rather than quietly rounded into a headline.
 */

/** Below this, a figure is withheld entirely. */
export const MIN_COHORT = 20;
/** Below this, a figure is reported but flagged as preliminary. */
export const CONFIDENT_COHORT = 50;

export interface OutcomeRecord {
  userId: string;
  /** 0-100 readiness or diagnostic score. */
  score: number;
  placed: boolean;
}

export interface BandStatistic {
  label: string;
  minScore: number;
  maxScore: number;
  sampleSize: number;
  placedCount: number;
  placementRate: number | null;
  /** 95% Wilson interval on the placement rate, as percentages. */
  confidenceLow: number | null;
  confidenceHigh: number | null;
  suppressed: boolean;
  note: string;
}

export interface TrustReport {
  totalStudents: number;
  reportableStudents: number;
  bands: BandStatistic[];
  /** The single headline claim, when the data supports one. */
  headline: string | null;
  caveats: string[];
}

const BANDS = [
  { label: "70% and above", minScore: 70, maxScore: 100 },
  { label: "50–69%", minScore: 50, maxScore: 69.999 },
  { label: "Below 50%", minScore: 0, maxScore: 49.999 },
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Wilson score interval.
 *
 * Chosen over the normal approximation because it stays sensible at small
 * samples and near 0% or 100% — exactly the conditions this report runs in.
 * The normal approximation happily produces intervals extending past 100%,
 * which would be embarrassing in a document handed to a university.
 */
export function wilsonInterval(
  successes: number,
  total: number,
  z = 1.96,
): { low: number; high: number } | null {
  if (total <= 0) return null;
  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const centre = p + (z * z) / (2 * total);
  const spread =
    z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total));

  return {
    low: round1(Math.max(0, ((centre - spread) / denominator) * 100)),
    high: round1(Math.min(1, (centre + spread) / denominator) * 100),
  };
}

export function buildTrustReport(records: readonly OutcomeRecord[]): TrustReport {
  const bands: BandStatistic[] = BANDS.map((band) => {
    const inBand = records.filter(
      (r) => r.score >= band.minScore && r.score <= band.maxScore,
    );
    const placed = inBand.filter((r) => r.placed).length;

    if (inBand.length < MIN_COHORT) {
      return {
        ...band,
        sampleSize: inBand.length,
        placedCount: 0,
        placementRate: null,
        confidenceLow: null,
        confidenceHigh: null,
        suppressed: true,
        note:
          inBand.length === 0
            ? "No students in this band yet."
            : `Withheld: only ${inBand.length} students, and we do not report on fewer than ${MIN_COHORT}.`,
      };
    }

    const interval = wilsonInterval(placed, inBand.length);
    return {
      ...band,
      sampleSize: inBand.length,
      placedCount: placed,
      placementRate: round1((placed / inBand.length) * 100),
      confidenceLow: interval?.low ?? null,
      confidenceHigh: interval?.high ?? null,
      suppressed: false,
      note:
        inBand.length < CONFIDENT_COHORT
          ? `Preliminary: based on ${inBand.length} students.`
          : `Based on ${inBand.length} students.`,
    };
  });

  const reportable = bands
    .filter((b) => !b.suppressed)
    .reduce((sum, b) => sum + b.sampleSize, 0);

  return {
    totalStudents: records.length,
    reportableStudents: reportable,
    bands,
    headline: buildHeadline(bands),
    caveats: buildCaveats(bands, records.length),
  };
}

/**
 * The one sentence anyone will actually quote.
 *
 * Only produced when the top and bottom bands are both reportable AND their
 * confidence intervals do not overlap. Without separation there is no
 * demonstrated relationship, and a headline claiming one would be the single
 * most misleading thing this platform could publish.
 */
function buildHeadline(bands: readonly BandStatistic[]): string | null {
  const top = bands.find((b) => b.minScore === 70);
  const bottom = bands.find((b) => b.maxScore < 50);

  if (!top || !bottom || top.suppressed || bottom.suppressed) return null;
  if (
    top.confidenceLow === null ||
    bottom.confidenceHigh === null ||
    top.placementRate === null ||
    bottom.placementRate === null
  ) {
    return null;
  }

  if (top.confidenceLow <= bottom.confidenceHigh) return null;

  return (
    `${top.placementRate}% of students scoring 70% or above were placed, ` +
    `against ${bottom.placementRate}% of those scoring below 50% ` +
    `(n=${top.sampleSize} and ${bottom.sampleSize}).`
  );
}

function buildCaveats(
  bands: readonly BandStatistic[],
  total: number,
): string[] {
  const caveats: string[] = [];
  const suppressed = bands.filter((b) => b.suppressed && b.sampleSize > 0);

  if (total < CONFIDENT_COHORT) {
    caveats.push(
      `These figures come from ${total} students in total. Treat them as early signal, not as established fact.`,
    );
  }
  if (suppressed.length > 0) {
    caveats.push(
      `${suppressed.length} score band(s) are withheld because too few students fall in them to report without risking identification.`,
    );
  }
  if (bands.some((b) => !b.suppressed && b.sampleSize < CONFIDENT_COHORT)) {
    caveats.push(
      "Bands marked preliminary have wide confidence intervals; the true rate could sit anywhere within them.",
    );
  }
  caveats.push(
    "This is an observed association between assessment scores and placement outcomes. It is not evidence that the assessment causes placement.",
  );
  return caveats;
}
