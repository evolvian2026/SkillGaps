import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Alert, Card, Empty, SectionHeading } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { jobDescriptions, resumeMatches, resumes, skillAreas } from "@/lib/db/schema";
import { missingByArea, type MatchedSkill, type MissingSkill } from "@/lib/matching/match";

export const metadata = { title: "Match report" };
export const dynamic = "force-dynamic";

export default async function MatchPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = await params;
  const user = await requireUser();

  const data = await withRequestContext(user, async (tx) => {
    const [match] = await tx
      .select({
        id: resumeMatches.id,
        status: resumeMatches.status,
        matchScore: resumeMatches.matchScore,
        matchedKeywords: resumeMatches.matchedKeywords,
        missingKeywords: resumeMatches.missingKeywords,
        errorMessage: resumeMatches.errorMessage,
        createdAt: resumeMatches.createdAt,
        jdTitle: jobDescriptions.title,
        jdCompany: jobDescriptions.company,
        resumeName: resumes.fileName,
      })
      .from(resumeMatches)
      .innerJoin(
        jobDescriptions,
        eq(jobDescriptions.id, resumeMatches.jobDescriptionId),
      )
      .innerJoin(resumes, eq(resumes.id, resumeMatches.resumeId))
      .where(eq(resumeMatches.id, matchId));

    if (!match) return null;
    const areas = await tx
      .select({ code: skillAreas.code, name: skillAreas.name })
      .from(skillAreas);
    return { match, areaNames: new Map(areas.map((a) => [a.code, a.name])) };
  });

  if (!data) notFound();
  const { match, areaNames } = data;

  const matchedPayload = (match.matchedKeywords ?? {}) as {
    matched?: MatchedSkill[];
    requiredCoverage?: number;
    extras?: string[];
  };
  const matched = matchedPayload.matched ?? [];
  const missing = (match.missingKeywords ?? []) as MissingSkill[];
  const grouped = missingByArea(missing);
  const score = match.matchScore === null ? null : Number(match.matchScore);

  return (
    <AppShell user={user}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-600">
            {match.resumeName} vs. {match.jdTitle}
            {match.jdCompany ? ` at ${match.jdCompany}` : ""}
          </p>
          <h1 className="text-2xl font-semibold">Match report</h1>
        </div>
        {score !== null ? (
          <div className="rounded-xl border border-ink-200 bg-white px-5 py-3 text-right">
            <p className="text-xs uppercase tracking-wide text-ink-400">Coverage</p>
            <p className="text-3xl font-semibold tabular-nums">{score}%</p>
            {matchedPayload.requiredCoverage !== undefined ? (
              <p className="text-xs text-ink-600">
                {matchedPayload.requiredCoverage}% of must-haves
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {match.status === "pending" || match.status === "running" ? (
        <Alert tone="info">
          We are still reading your documents. Refresh in a moment.
        </Alert>
      ) : null}

      {match.status === "failed" ? (
        <Alert>
          {match.errorMessage ?? "This comparison could not be completed."}
        </Alert>
      ) : null}

      {match.status === "succeeded" ? (
        <>
          <Card className="mb-6">
            <SectionHeading
              title="What this role asks for that your resume does not show"
              hint="Ordered by how much it matters. Must-haves come first."
            />
            {missing.length === 0 ? (
              <p className="text-sm text-good-500">
                Your resume mentions everything this job description asks for.
              </p>
            ) : (
              <div className="space-y-4">
                {grouped.map((group) => (
                  <div key={group.skillArea}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
                      {areaNames.get(group.skillArea) ?? group.skillArea}
                    </p>
                    <ul className="flex flex-wrap gap-2">
                      {group.skills.map((skill) => (
                        <li
                          key={skill.skill}
                          className={`rounded-full px-3 py-1 text-sm font-medium ${
                            skill.required
                              ? "bg-risk-100 text-risk-500"
                              : "bg-warn-100 text-warn-500"
                          }`}
                        >
                          {skill.skill}
                          {skill.required ? " · must-have" : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-600">
              A gap here means the words are not in your resume — not that you
              lack the skill. If you have done the work, say so explicitly and
              name the technology. If you have not, this is your study list.
              Do not add anything you cannot talk about in an interview.
            </p>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <SectionHeading title="Already covered" />
              {matched.length === 0 ? (
                <Empty>Nothing from this job description appears in your resume.</Empty>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {matched.map((skill) => (
                    <li
                      key={skill.skill}
                      className="rounded-full bg-good-100 px-3 py-1 text-sm font-medium text-good-500"
                    >
                      {skill.skill}
                      {skill.required ? " · must-have" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <SectionHeading
                title="On your resume, not in this posting"
                hint="Useful elsewhere — or worth trimming if space is tight."
              />
              {(matchedPayload.extras ?? []).length === 0 ? (
                <Empty>Nothing extra detected.</Empty>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {(matchedPayload.extras ?? []).map((skill) => (
                    <li
                      key={skill}
                      className="rounded-full bg-ink-100 px-3 py-1 text-sm text-ink-600"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      ) : null}

      <Link
        href="/resume"
        className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline"
      >
        ← Back to resume match
      </Link>
    </AppShell>
  );
}
