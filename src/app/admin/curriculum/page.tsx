import { asc, eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { SyllabusForm } from "@/components/syllabus-form";
import { Alert, Card, Empty, SectionHeading } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import {
  industrySkillReferences,
  skillAreas,
  syllabusSubjects,
} from "@/lib/db/schema";
import { compareCurriculum, type ReferenceTopic } from "@/lib/curriculum/compare";
import { deleteSubjectAction } from "@/lib/curriculum/actions";

export const metadata = { title: "Curriculum benchmark" };
export const dynamic = "force-dynamic";

function coverageTone(percent: number): string {
  if (percent >= 75) return "bg-good-100 text-good-500";
  if (percent >= 50) return "bg-warn-100 text-warn-500";
  return "bg-risk-100 text-risk-500";
}

export default async function CurriculumPage() {
  const user = await requireStaff();

  const data = await withRequestContext(user, async (tx) => {
    const subjects = await tx
      .select()
      .from(syllabusSubjects)
      .where(eq(syllabusSubjects.tenantId, user.tenantId))
      .orderBy(asc(syllabusSubjects.name));

    const references = await tx
      .select({
        id: industrySkillReferences.id,
        topic: industrySkillReferences.topic,
        aliases: industrySkillReferences.aliases,
        demandWeight: industrySkillReferences.demandWeight,
        source: industrySkillReferences.source,
        skillArea: skillAreas.code,
        skillAreaName: skillAreas.name,
        displayOrder: skillAreas.displayOrder,
      })
      .from(industrySkillReferences)
      .innerJoin(skillAreas, eq(skillAreas.id, industrySkillReferences.skillAreaId))
      .where(eq(industrySkillReferences.isActive, true))
      .orderBy(asc(skillAreas.displayOrder));

    return { subjects, references };
  });

  const areaNames = new Map(
    data.references.map((r) => [r.skillArea, r.skillAreaName]),
  );

  const reference: ReferenceTopic[] = data.references.map((r) => ({
    id: r.id,
    skillArea: r.skillArea,
    topic: r.topic,
    aliases: r.aliases,
    demandWeight: r.demandWeight,
  }));

  const comparison = compareCurriculum(
    data.subjects.map((s) => ({
      subjectId: s.id,
      subjectName: s.name,
      topics: s.topics,
    })),
    reference,
  );

  const scraped = data.references.some((r) => r.source === "scraped");

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Curriculum benchmark</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        Compares the topics you teach against the skills currently asked for in
        the roles your students target, using the same skill taxonomy as the
        diagnostic assessments.
      </p>

      <div className="mb-6">
        <Alert tone="info">
          The reference list is{" "}
          {scraped
            ? "drawn from job postings and a curated baseline"
            : "maintained by hand by the SkillGaps team"}
          . It is a starting point for a conversation about the syllabus, not a
          verdict on it — a topic can be well covered under a name we do not
          recognise.
        </Alert>
      </div>

      {data.subjects.length > 0 ? (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs uppercase tracking-wide text-ink-400">
                Overall coverage
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {comparison.overallCoverage}%
              </p>
              <p className="mt-0.5 text-xs text-ink-600">weighted by demand</p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-ink-400">Subjects</p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {data.subjects.length}
              </p>
              <p className="mt-0.5 text-xs text-ink-600">
                {data.subjects.reduce((sum, s) => sum + s.topics.length, 0)} topics
                entered
              </p>
            </Card>
            <Card>
              <p className="text-xs uppercase tracking-wide text-ink-400">
                High-demand gaps
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums">
                {comparison.priorityGaps.length}
              </p>
              <p className="mt-0.5 text-xs text-ink-600">worth reviewing first</p>
            </Card>
          </div>

          {comparison.priorityGaps.length > 0 ? (
            <Card className="mb-6">
              <SectionHeading
                title="Not currently covered, and in demand"
                hint="Highest demand first. These are the topics students meet in interviews without having been taught them."
              />
              <ul className="flex flex-wrap gap-2">
                {comparison.priorityGaps.map((gap) => (
                  <li
                    key={gap.id}
                    className="rounded-full bg-risk-100 px-3 py-1 text-sm font-medium text-risk-500"
                  >
                    {gap.topic}
                    <span className="ml-1.5 opacity-70">
                      {areaNames.get(gap.skillArea) ?? gap.skillArea}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <SectionHeading title="Coverage by skill area" />
          <div className="mb-8 space-y-3">
            {comparison.areas.map((area) => (
              <Card key={area.skillArea}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-semibold">
                    {areaNames.get(area.skillArea) ?? area.skillArea}
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-1 text-sm font-semibold ${coverageTone(area.coveragePercent)}`}
                  >
                    {area.coveragePercent}% covered
                  </span>
                </div>

                {area.missing.length > 0 ? (
                  <div className="mb-3">
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
                      Missing
                    </p>
                    <ul className="flex flex-wrap gap-1.5">
                      {area.missing.map((topic) => (
                        <li
                          key={topic.id}
                          className="rounded-md bg-ink-100 px-2 py-1 text-xs text-ink-800"
                          title={`Demand weight ${topic.demandWeight}/5`}
                        >
                          {topic.topic}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {area.covered.length > 0 ? (
                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-brand-600">
                      {area.covered.length} covered
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs text-ink-600">
                      {area.covered.map((topic) => (
                        <li key={topic.topic}>
                          <span className="font-medium text-ink-800">{topic.topic}</span>{" "}
                          — {topic.coveredBy.join(", ")}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </Card>
            ))}
          </div>

          {comparison.unmatchedSyllabusTopics.length > 0 ? (
            <Card className="mb-8">
              <SectionHeading
                title="Topics we could not map"
                hint="These may be taught under a different name, or may sit outside the skills these roles ask for. Worth a look either way."
              />
              <ul className="flex flex-wrap gap-1.5">
                {comparison.unmatchedSyllabusTopics.slice(0, 40).map((topic) => (
                  <li
                    key={topic}
                    className="rounded-md bg-ink-100 px-2 py-1 text-xs text-ink-600"
                  >
                    {topic}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionHeading title="Add a subject" />
          <SyllabusForm />
        </Card>

        <div>
          <SectionHeading title="Your syllabus" />
          {data.subjects.length === 0 ? (
            <Empty>
              Add your first subject to see how the syllabus compares.
            </Empty>
          ) : (
            <Card className="p-0">
              <ul className="divide-y divide-ink-100">
                {data.subjects.map((subject) => (
                  <li key={subject.id} className="px-5 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">
                          {subject.name}
                          {subject.code ? (
                            <span className="ml-1.5 text-xs text-ink-600">
                              {subject.code}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-600">
                          {[
                            subject.branch,
                            subject.semester ? `Semester ${subject.semester}` : null,
                            `${subject.topics.length} topics`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <form action={deleteSubjectAction}>
                        <input type="hidden" name="subjectId" value={subject.id} />
                        <button
                          type="submit"
                          className="text-xs font-medium text-risk-500 hover:underline"
                        >
                          Remove
                        </button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}
