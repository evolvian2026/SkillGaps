/**
 * Curriculum benchmarking.
 *
 * Compares an institution's syllabus topics against the reference list of
 * in-demand skills, per skill area. Pure functions — no I/O — so the matching
 * rules are testable and the same code serves both the page and any future job.
 */

export interface ReferenceTopic {
  id: string;
  skillArea: string;
  topic: string;
  aliases: string[];
  demandWeight: number;
}

export interface SyllabusEntry {
  subjectId: string;
  subjectName: string;
  topics: string[];
}

export interface CoveredTopic {
  topic: string;
  demandWeight: number;
  /** Which subject covers it, so a TPO knows where to look. */
  coveredBy: string[];
}

export interface AreaCoverage {
  skillArea: string;
  /** 0-100, weighted by demand rather than by topic count. */
  coveragePercent: number;
  covered: CoveredTopic[];
  missing: ReferenceTopic[];
}

export interface CurriculumComparison {
  areas: AreaCoverage[];
  overallCoverage: number;
  /** Syllabus topics that map to no reference topic at all. */
  unmatchedSyllabusTopics: string[];
  /** The highest-demand gaps across every area, worst first. */
  priorityGaps: (ReferenceTopic & { skillAreaName?: string })[];
}

/**
 * Normalises a topic string for comparison.
 *
 * Syllabus documents are written by people, not machines: "Data Structures &
 * Algorithms", "data structures and algorithms", and "DATA STRUCTURES /
 * ALGORITHMS" are the same topic and must match.
 */
export function normaliseTopic(topic: string): string {
  return topic
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokens used for the partial-overlap fallback. */
function tokens(topic: string): Set<string> {
  const STOP = new Set(["and", "the", "of", "to", "in", "for", "with", "an", "a"]);
  return new Set(
    normaliseTopic(topic)
      .split(" ")
      .filter((t) => t.length > 2 && !STOP.has(t)),
  );
}

/**
 * Decides whether a syllabus topic covers a reference topic.
 *
 * Three rules, most confident first: an exact match on the normalised string;
 * the syllabus line *containing* the reference topic or one of its aliases (a
 * syllabus line often bundles several topics); then a token overlap covering
 * every significant word of the reference topic.
 *
 * Containment is deliberately one-directional. Allowing the reverse — a
 * reference topic containing the syllabus line — credits a syllabus listing
 * "Functions" with teaching "Window Functions", which tells a university it
 * covers something it does not. A false gap is recoverable; a false "covered"
 * is the failure mode this tool exists to prevent. Genuine short forms are
 * handled by the alias list instead, where they are explicit.
 */
export function topicMatches(
  syllabusTopic: string,
  reference: ReferenceTopic,
): boolean {
  const syllabus = normaliseTopic(syllabusTopic);
  if (!syllabus) return false;

  const candidates = [reference.topic, ...reference.aliases].map(normaliseTopic);

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (syllabus === candidate) return true;
    if (syllabus.includes(candidate)) return true;
  }

  const syllabusTokens = tokens(syllabusTopic);
  for (const candidate of [reference.topic, ...reference.aliases]) {
    const candidateTokens = tokens(candidate);
    if (candidateTokens.size === 0) continue;
    let shared = 0;
    for (const token of candidateTokens) {
      if (syllabusTokens.has(token)) shared++;
    }
    // Every significant word of the reference topic must appear.
    if (shared === candidateTokens.size && candidateTokens.size >= 2) return true;
  }

  return false;
}

export function compareCurriculum(
  syllabus: readonly SyllabusEntry[],
  reference: readonly ReferenceTopic[],
): CurriculumComparison {
  const byArea = new Map<string, ReferenceTopic[]>();
  for (const topic of reference) {
    const list = byArea.get(topic.skillArea) ?? [];
    list.push(topic);
    byArea.set(topic.skillArea, list);
  }

  const matchedSyllabusTopics = new Set<string>();
  const areas: AreaCoverage[] = [];

  for (const [skillArea, topics] of byArea) {
    const covered: CoveredTopic[] = [];
    const missing: ReferenceTopic[] = [];

    for (const referenceTopic of topics) {
      const coveredBy: string[] = [];
      for (const subject of syllabus) {
        for (const syllabusTopic of subject.topics) {
          if (topicMatches(syllabusTopic, referenceTopic)) {
            matchedSyllabusTopics.add(`${subject.subjectId}::${syllabusTopic}`);
            if (!coveredBy.includes(subject.subjectName)) {
              coveredBy.push(subject.subjectName);
            }
          }
        }
      }

      if (coveredBy.length > 0) {
        covered.push({
          topic: referenceTopic.topic,
          demandWeight: referenceTopic.demandWeight,
          coveredBy,
        });
      } else {
        missing.push(referenceTopic);
      }
    }

    // Weighted by demand: missing a topic every posting asks for should hurt
    // the score far more than missing a differentiator.
    const totalWeight = topics.reduce((sum, t) => sum + t.demandWeight, 0);
    const coveredWeight = covered.reduce((sum, t) => sum + t.demandWeight, 0);

    areas.push({
      skillArea,
      coveragePercent:
        totalWeight === 0
          ? 100
          : Math.round((coveredWeight / totalWeight) * 1000) / 10,
      covered,
      missing: missing.sort((a, b) => b.demandWeight - a.demandWeight),
    });
  }

  areas.sort((a, b) => a.coveragePercent - b.coveragePercent);

  const unmatched: string[] = [];
  for (const subject of syllabus) {
    for (const topic of subject.topics) {
      if (!matchedSyllabusTopics.has(`${subject.subjectId}::${topic}`)) {
        unmatched.push(topic);
      }
    }
  }

  const allReferenceWeight = reference.reduce((sum, t) => sum + t.demandWeight, 0);
  const allCoveredWeight = areas.reduce(
    (sum, area) => sum + area.covered.reduce((s, t) => s + t.demandWeight, 0),
    0,
  );

  const priorityGaps = areas
    .flatMap((area) => area.missing)
    .sort((a, b) => b.demandWeight - a.demandWeight)
    .slice(0, 8);

  return {
    areas,
    overallCoverage:
      allReferenceWeight === 0
        ? 100
        : Math.round((allCoveredWeight / allReferenceWeight) * 1000) / 10,
    unmatchedSyllabusTopics: [...new Set(unmatched)],
    priorityGaps,
  };
}

/** Splits a pasted or uploaded topic list into individual topics. */
export function parseTopicList(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((t) => t.replace(/^[\s\-*\d.)]+/, "").trim())
    .filter((t) => t.length > 1)
    .slice(0, 200);
}
