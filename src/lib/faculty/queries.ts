import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  industrySkillReferences,
  skillAreas,
  syllabusSubjects,
  teachingAssignments,
  users,
} from "@/lib/db/schema";
import type { ReferenceTopic } from "@/lib/curriculum/compare";
import { loadSkillAreaAggregates, type CohortFilters } from "@/lib/admin/cohort";
import { focusForSubject, rankAreas, type RankedArea } from "./subject-focus";

/**
 * Reads for the faculty view.
 *
 * Every query here is additionally constrained by RLS to the caller's own
 * institution. The `facultyId` filter is about scope, not security: a lecturer
 * seeing another lecturer's assignment row would learn nothing they could not
 * already see on the cohort dashboard.
 */

export interface Assignment {
  id: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  semester: number | null;
  topics: string[];
  branch: string | null;
  section: string | null;
  batchYear: number | null;
  facultyId: string;
  facultyName: string;
  facultyEmail: string;
}

export async function listAssignments(
  tx: Db,
  filter: { facultyId?: string } = {},
): Promise<Assignment[]> {
  const where = filter.facultyId
    ? eq(teachingAssignments.facultyId, filter.facultyId)
    : undefined;

  const rows = await tx
    .select({
      id: teachingAssignments.id,
      subjectId: syllabusSubjects.id,
      subjectName: syllabusSubjects.name,
      subjectCode: syllabusSubjects.code,
      semester: syllabusSubjects.semester,
      topics: syllabusSubjects.topics,
      branch: teachingAssignments.branch,
      section: teachingAssignments.section,
      batchYear: teachingAssignments.batchYear,
      facultyId: users.id,
      facultyName: users.fullName,
      facultyEmail: users.email,
    })
    .from(teachingAssignments)
    .innerJoin(syllabusSubjects, eq(syllabusSubjects.id, teachingAssignments.subjectId))
    .innerJoin(users, eq(users.id, teachingAssignments.facultyId))
    .where(where)
    .orderBy(asc(users.fullName), asc(syllabusSubjects.name));

  return rows.map((r) => ({ ...r, topics: r.topics ?? [] }));
}

/** The reference list, shaped for the matcher. */
export async function loadReferenceTopics(tx: Db): Promise<ReferenceTopic[]> {
  const rows = await tx
    .select({
      id: industrySkillReferences.id,
      topic: industrySkillReferences.topic,
      aliases: industrySkillReferences.aliases,
      demandWeight: industrySkillReferences.demandWeight,
      skillArea: skillAreas.code,
    })
    .from(industrySkillReferences)
    .innerJoin(skillAreas, eq(skillAreas.id, industrySkillReferences.skillAreaId))
    .where(eq(industrySkillReferences.isActive, true));

  return rows.map((r) => ({
    id: r.id,
    topic: r.topic,
    aliases: r.aliases ?? [],
    demandWeight: r.demandWeight,
    skillArea: r.skillArea,
  }));
}

export interface SubjectReport {
  assignment: Assignment;
  areas: RankedArea[];
  missingTopics: { topic: string; skillArea: string; demandWeight: number }[];
  unmatchedTopics: string[];
  /** How many distinct students in this cohort have a submitted diagnostic. */
  assessedStudents: number;
}

/** The cohort an assignment refers to. A null field means "any value". */
export function cohortFor(assignment: Assignment): CohortFilters {
  return {
    branch: assignment.branch ?? undefined,
    section: assignment.section ?? undefined,
    batchYear: assignment.batchYear ?? undefined,
  };
}

/**
 * Builds one lecturer's report per assignment.
 *
 * The aggregates come from the same query the cohort dashboard uses, filtered
 * to this assignment's branch/section/batch — so a lecturer and the placement
 * office can never be looking at two different numbers for the same class.
 */
export async function buildSubjectReports(
  tx: Db,
  assignments: Assignment[],
): Promise<SubjectReport[]> {
  if (assignments.length === 0) return [];
  const reference = await loadReferenceTopics(tx);

  const reports: SubjectReport[] = [];
  for (const assignment of assignments) {
    const focus = focusForSubject(assignment.topics, reference);
    const aggregates = await loadSkillAreaAggregates(tx, cohortFor(assignment));
    const areas = rankAreas(focus, aggregates);

    reports.push({
      assignment,
      areas,
      missingTopics: focus.missingTopics.map((t) => ({
        topic: t.topic,
        skillArea: t.skillAreaCode,
        demandWeight: t.demandWeight,
      })),
      unmatchedTopics: focus.unmatchedTopics,
      assessedStudents: aggregates.reduce(
        (max, a) => Math.max(max, a.studentCount),
        0,
      ),
    });
  }
  return reports;
}

/** Staff who can be assigned teaching, for the placement office's picker. */
export async function assignableFaculty(tx: Db) {
  return tx
    .select({ id: users.id, fullName: users.fullName, email: users.email, role: users.role })
    .from(users)
    .where(and(eq(users.isActive, true)))
    .orderBy(asc(users.fullName))
    .then((rows) =>
      rows.filter(
        (r) => r.role === "faculty" || r.role === "admin" || r.role === "super_admin",
      ),
    );
}

export async function listSubjects(tx: Db) {
  return tx
    .select({
      id: syllabusSubjects.id,
      name: syllabusSubjects.name,
      code: syllabusSubjects.code,
      branch: syllabusSubjects.branch,
      semester: syllabusSubjects.semester,
    })
    .from(syllabusSubjects)
    .orderBy(asc(syllabusSubjects.name));
}
