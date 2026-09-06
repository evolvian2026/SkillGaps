import { AppShell } from "@/components/app-shell";
import { CohortFiltersForm } from "@/components/cohort-filters";
import { CohortHeatmap } from "@/components/cohort-heatmap";
import { CohortChart } from "@/components/lazy-charts";
import { ButtonLink, Card, Empty, ProvisionalBadge, SectionHeading } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import {
  loadBenchmarkContext,
  loadCohortSummary,
  loadFilterOptions,
  loadSkillAreaAggregates,
} from "@/lib/admin/cohort";
import { filtersToQuery, parseCohortFilters } from "@/lib/admin/filters";

export const metadata = { title: "Cohort insights" };
export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-600">{hint}</p> : null}
    </Card>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireStaff();
  const filters = parseCohortFilters(await searchParams);

  const data = await withRequestContext(user, async (tx) => ({
    options: await loadFilterOptions(tx),
    summary: await loadCohortSummary(tx, filters),
    areas: await loadSkillAreaAggregates(tx, filters),
    benchmark: await loadBenchmarkContext(tx, filters.trackId),
  }));

  const weakest = [...data.areas].sort((a, b) => a.average - b.average).slice(0, 3);

  return (
    <AppShell user={user}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Cohort insights</h1>
          <p className="mt-1 text-sm text-ink-600">
            Aggregate view of your students&apos; latest assessment results.
            Read-only.
          </p>
        </div>
        <ButtonLink
          variant="secondary"
          href={`/api/admin/export${filtersToQuery(filters)}`}
          prefetch={false}
        >
          Export CSV
        </ButtonLink>
      </div>

      <Card className="mb-6">
        <CohortFiltersForm options={data.options} current={filters} />
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Students" value={String(data.summary.studentCount)} hint="in this filter" />
        <Stat
          label="Assessed"
          value={String(data.summary.assessedCount)}
          hint={
            data.summary.studentCount > 0
              ? `${Math.round((data.summary.assessedCount / data.summary.studentCount) * 100)}% coverage`
              : undefined
          }
        />
        <Stat
          label="Average score"
          value={data.summary.averagePercent === null ? "—" : `${data.summary.averagePercent}%`}
          hint="latest attempt per student"
        />
        <Stat
          label="Flagged attempts"
          value={String(data.summary.flaggedCount)}
          hint="for review, not penalties"
        />
      </div>

      {data.areas.length === 0 ? (
        <Empty>
          No submitted assessments match this filter yet. Once students complete
          a diagnostic, their results appear here.
        </Empty>
      ) : (
        <>
          <Card className="mb-6">
            <SectionHeading
              title="Weakest areas across the cohort"
              hint="Average of each student's most recent submitted attempt."
              action={<ProvisionalBadge />}
            />
            <CohortHeatmap areas={data.areas} />
          </Card>

          <Card className="mb-6">
            <SectionHeading title="Average score by skill area" />
            <CohortChart
              data={[...data.areas]
                .sort((a, b) => a.average - b.average)
                .map((area) => ({
                  name: area.name,
                  average: area.average,
                  hiringBar: area.hiringBarPercent,
                }))}
            />
          </Card>

          <Card className="mb-6">
            <SectionHeading title="Where to intervene first" />
            <ol className="space-y-2 text-sm">
              {weakest.map((area, i) => (
                <li key={area.skillAreaId} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold">
                    {i + 1}
                  </span>
                  <span>
                    <strong className="text-ink-900">{area.name}</strong> — cohort
                    average {area.average}%
                    {area.belowBarCount > 0
                      ? `, ${area.belowBarCount} of ${area.studentCount} students below ${
                          area.hiringBarPercent === null
                            ? "their track's bar"
                            : `the ${area.hiringBarPercent}% bar`
                        }`
                      : ""}
                    .
                  </span>
                </li>
              ))}
            </ol>
            {data.benchmark ? (
              <p className="mt-4 text-xs text-ink-600">
                Benchmarks shown: {data.benchmark.label}.{" "}
                {data.benchmark.isProvisional
                  ? "These thresholds are provisional and have not been validated against placement outcomes."
                  : ""}
              </p>
            ) : null}
          </Card>
        </>
      )}
    </AppShell>
  );
}
