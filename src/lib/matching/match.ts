import type { ExtractedSkill } from "./parser-client";

/**
 * Resume vs job-description matching.
 *
 * Pure functions — no I/O — so the scoring is unit testable and reproducible.
 *
 * Deliberately NOT a rewrite engine. The output is a coverage score and two
 * lists: what the JD asks for that the resume shows, and what it does not. The
 * student decides what to do about it; the platform never edits their resume
 * for them, because a resume that survives an interview has to be theirs.
 */

export interface MatchedSkill {
  skill: string;
  skillArea: string;
  weight: number;
  required: boolean;
  /** How many times it appears in the resume. */
  resumeOccurrences: number;
}

export interface MissingSkill {
  skill: string;
  skillArea: string;
  weight: number;
  required: boolean;
}

export interface MatchResult {
  /** 0-100 weighted coverage of what the JD asks for. */
  score: number;
  matched: MatchedSkill[];
  missing: MissingSkill[];
  /** Coverage of required skills alone, which is what screening turns on. */
  requiredCoverage: number;
  /** Skills the resume shows that the JD never mentions. */
  extras: string[];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * A required skill counts for more than a nice-to-have.
 *
 * Without this a resume could cover every optional tool and miss every hard
 * requirement while still scoring respectably, which would be worse than
 * useless — it would be actively misleading right before an interview.
 */
function effectiveWeight(skill: { weight: number; required: boolean }): number {
  return skill.required ? skill.weight * 2 : skill.weight;
}

export function matchResumeToJd(
  resumeSkills: readonly ExtractedSkill[],
  jdSkills: readonly ExtractedSkill[],
): MatchResult {
  const resumeByName = new Map(
    resumeSkills.map((s) => [s.skill.toLowerCase(), s]),
  );

  const matched: MatchedSkill[] = [];
  const missing: MissingSkill[] = [];

  let earned = 0;
  let possible = 0;
  let requiredEarned = 0;
  let requiredPossible = 0;

  for (const jdSkill of jdSkills) {
    const weight = effectiveWeight(jdSkill);
    possible += weight;
    if (jdSkill.required) requiredPossible += jdSkill.weight;

    const inResume = resumeByName.get(jdSkill.skill.toLowerCase());
    if (inResume) {
      earned += weight;
      if (jdSkill.required) requiredEarned += jdSkill.weight;
      matched.push({
        skill: jdSkill.skill,
        skillArea: jdSkill.skillArea,
        weight: jdSkill.weight,
        required: jdSkill.required,
        resumeOccurrences: inResume.occurrences,
      });
    } else {
      missing.push({
        skill: jdSkill.skill,
        skillArea: jdSkill.skillArea,
        weight: jdSkill.weight,
        required: jdSkill.required,
      });
    }
  }

  const jdNames = new Set(jdSkills.map((s) => s.skill.toLowerCase()));
  const extras = resumeSkills
    .filter((s) => !jdNames.has(s.skill.toLowerCase()))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10)
    .map((s) => s.skill);

  // Sort so the most consequential gap is the first thing a student reads.
  const byImportance = (
    a: { required: boolean; weight: number },
    b: { required: boolean; weight: number },
  ) => Number(b.required) - Number(a.required) || b.weight - a.weight;

  missing.sort(byImportance);
  matched.sort(byImportance);

  return {
    score: possible === 0 ? 0 : round1((earned / possible) * 100),
    matched,
    missing,
    requiredCoverage:
      requiredPossible === 0
        ? 100
        : round1((requiredEarned / requiredPossible) * 100),
    extras,
  };
}

/**
 * Groups missing skills by skill area so the report can point a student at the
 * same areas the diagnostic already uses, rather than at a flat keyword list.
 */
export function missingByArea(
  missing: readonly MissingSkill[],
): { skillArea: string; skills: MissingSkill[] }[] {
  const byArea = new Map<string, MissingSkill[]>();
  for (const skill of missing) {
    const list = byArea.get(skill.skillArea) ?? [];
    list.push(skill);
    byArea.set(skill.skillArea, list);
  }
  return [...byArea.entries()]
    .map(([skillArea, skills]) => ({ skillArea, skills }))
    .sort((a, b) => b.skills.length - a.skills.length);
}
