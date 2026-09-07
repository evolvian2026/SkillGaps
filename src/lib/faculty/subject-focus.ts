/**
 * What one subject actually teaches, and how its students are doing at it.
 *
 * A placement dashboard answers "is this cohort employable". A lecturer needs a
 * different question answered: "of the things *I* teach, which are my students
 * weakest at, and which does my syllabus not cover at all". This turns a
 * subject's topic list into that answer.
 *
 * Pure — no I/O — so the rules that decide what a lecturer is shown are
 * testable without a database, and so the same code can serve a future digest
 * email without being rewritten.
 */

import { topicMatches, type ReferenceTopic } from "@/lib/curriculum/compare";

/** A cohort smaller than this is reported, but never as a signal. */
export const THIN_COHORT = 8;

export interface AreaPerformance {
  skillAreaId: string;
  code: string;
  name: string;
  average: number;
  studentCount: number;
  belowBarCount: number;
  hiringBarPercent: number | null;
}

export interface SubjectFocus {
  /** Reference topics this subject's syllabus does cover, by skill area code. */
  coveredTopics: Record<string, ReferenceTopic[]>;
  /** In-demand topics in this subject's own areas that it does not cover. */
  missingTopics: (ReferenceTopic & { skillAreaCode: string })[];
  /** Syllabus topics matching no reference topic at all. */
  unmatchedTopics: string[];
  /** Skill area codes this subject teaches, highest coverage first. */
  areaCodes: string[];
}

/**
 * Maps a subject's syllabus topics onto the reference list.
 *
 * A subject "teaches" a skill area when at least one of its topics matches a
 * reference topic in that area. Deliberately not the other way round: a
 * lecturer should not be handed responsibility for an area merely because the
 * area exists.
 */
export function focusForSubject(
  syllabusTopics: readonly string[],
  reference: readonly ReferenceTopic[],
): SubjectFocus {
  const covered: Record<string, ReferenceTopic[]> = {};
  const matchedSyllabus = new Set<string>();

  for (const referenceTopic of reference) {
    for (const topic of syllabusTopics) {
      if (topicMatches(topic, referenceTopic)) {
        (covered[referenceTopic.skillArea] ??= []).push(referenceTopic);
        matchedSyllabus.add(topic);
        break;
      }
    }
  }

  const areaCodes = Object.keys(covered).sort(
    (a, b) => covered[b].length - covered[a].length,
  );
  const taught = new Set(areaCodes);

  // Only gaps inside the areas this subject already teaches. Listing every
  // in-demand topic in the catalogue would bury the ones the lecturer can
  // actually do something about.
  const missingTopics = reference
    .filter(
      (r) =>
        taught.has(r.skillArea) &&
        !covered[r.skillArea]?.some((c) => c.id === r.id),
    )
    .map((r) => ({ ...r, skillAreaCode: r.skillArea }))
    .sort((a, b) => b.demandWeight - a.demandWeight);

  return {
    coveredTopics: covered,
    missingTopics,
    unmatchedTopics: syllabusTopics.filter((t) => !matchedSyllabus.has(t)),
    areaCodes,
  };
}

export type AreaVerdict = "weak" | "watch" | "fine" | "thin" | "no_data";

export interface RankedArea extends AreaPerformance {
  verdict: AreaVerdict;
  message: string;
  /** Reference topics from this lecturer's own syllabus in this area. */
  topics: string[];
}

/**
 * Ranks the areas a subject teaches, weakest first.
 *
 * The verdict is stated in terms of the hiring bar where there is one, because
 * that is the only threshold in the product with any external meaning — and it
 * is still provisional, which the page says.
 */
export function rankAreas(
  focus: SubjectFocus,
  performance: readonly AreaPerformance[],
): RankedArea[] {
  const byCode = new Map(performance.map((p) => [p.code, p]));

  const ranked: RankedArea[] = focus.areaCodes.map((code) => {
    const topics = (focus.coveredTopics[code] ?? []).map((t) => t.topic);
    const stat = byCode.get(code);

    if (!stat || stat.studentCount === 0) {
      return {
        skillAreaId: stat?.skillAreaId ?? code,
        code,
        name: stat?.name ?? code,
        average: 0,
        studentCount: 0,
        belowBarCount: 0,
        hiringBarPercent: stat?.hiringBarPercent ?? null,
        verdict: "no_data",
        message: "No one in this class has taken a diagnostic yet.",
        topics,
      };
    }

    const base = { ...stat, topics };

    if (stat.studentCount < THIN_COHORT) {
      return {
        ...base,
        verdict: "thin",
        message: `Only ${stat.studentCount} ${
          stat.studentCount === 1 ? "student has" : "students have"
        } been assessed — too few to read as a pattern yet.`,
      };
    }

    const belowShare = stat.belowBarCount / stat.studentCount;

    if (stat.hiringBarPercent === null) {
      // Without an agreed bar there is nothing to be "below", so say what is
      // known rather than inventing a threshold.
      return {
        ...base,
        verdict: "watch",
        message: `Class average ${stat.average}%. No single hiring bar applies here, because this class sits across tracks that set different ones.`,
      };
    }

    if (belowShare >= 0.5) {
      return {
        ...base,
        verdict: "weak",
        message: `${stat.belowBarCount} of ${stat.studentCount} are below the ${stat.hiringBarPercent}% bar (class average ${stat.average}%).`,
      };
    }
    if (belowShare >= 0.25) {
      return {
        ...base,
        verdict: "watch",
        message: `${stat.belowBarCount} of ${stat.studentCount} are below the ${stat.hiringBarPercent}% bar (class average ${stat.average}%).`,
      };
    }
    return {
      ...base,
      verdict: "fine",
      message: `${stat.studentCount - stat.belowBarCount} of ${stat.studentCount} are at or above the ${stat.hiringBarPercent}% bar (class average ${stat.average}%).`,
    };
  });

  // Weakest first: the point of the page is the top of the list.
  const order: Record<AreaVerdict, number> = {
    weak: 0,
    watch: 1,
    fine: 2,
    thin: 3,
    no_data: 4,
  };
  return ranked.sort(
    (a, b) => order[a.verdict] - order[b.verdict] || a.average - b.average,
  );
}

/** A one-line summary for the top of a lecturer's page. */
export function summarise(areas: readonly RankedArea[]): string {
  const weak = areas.filter((a) => a.verdict === "weak");
  const assessed = areas.filter((a) => a.verdict !== "no_data" && a.verdict !== "thin");

  if (assessed.length === 0) {
    return "Nothing to report yet: no one in these classes has completed a diagnostic.";
  }
  if (weak.length === 0) {
    return "No area of your syllabus has half the class below the bar.";
  }
  const names = weak.map((a) => a.name).join(", ");
  return `${weak.length} ${weak.length === 1 ? "area" : "areas"} of your syllabus ${
    weak.length === 1 ? "has" : "have"
  } half the class or more below the bar: ${names}.`;
}
