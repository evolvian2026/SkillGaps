import { and, desc, eq, sql } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Alert, Card, Empty, SectionHeading } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import {
  benchmarkSets,
  calibrationRuns,
  placementOutcomes,
  readinessScores,
  tracks,
} from "@/lib/db/schema";
import { buildTrustReport, type OutcomeRecord } from "@/lib/trust/report";

export const metadata = { title: "Validation evidence" };
export const dynamic = "force-dynamic";

export default async function ValidationPage() {
  const user = await requireStaff();

  const data = await withRequestContext(user, async (tx) => {
    // Readiness score paired with a recorded outcome. Students whose outcome
    // is not yet known are excluded rather than assumed unplaced — assuming
    // would bias every figure on this page downward.
    const rows = await tx
      .select({
        userId: placementOutcomes.userId,
        status: placementOutcomes.status,
        readiness: readinessScores.score,
        latestPercent: sql<string | null>`(
          SELECT a.percent FROM attempts a
          WHERE a.user_id = ${placementOutcomes.userId} AND a.status = 'submitted'
          ORDER BY a.submitted_at DESC LIMIT 1
        )`,
      })
      .from(placementOutcomes)
      .leftJoin(readinessScores, eq(readinessScores.userId, placementOutcomes.userId))
      .where(
        sql`${placementOutcomes.status} IN ('placed', 'not_placed')`,
      );

    const runs = await tx
      .select({
        id: calibrationRuns.id,
        status: calibrationRuns.status,
        sampleSize: calibrationRuns.sampleSize,
        placedCount: calibrationRuns.placedCount,
        correlation: calibrationRuns.correlation,
        message: calibrationRuns.message,
        startedAt: calibrationRuns.startedAt,
        trackName: tracks.name,
      })
      .from(calibrationRuns)
      .innerJoin(tracks, eq(tracks.id, calibrationRuns.trackId))
      .orderBy(desc(calibrationRuns.startedAt))
      .limit(10);

    const activeSets = await tx
      .select({
        trackName: tracks.name,
        label: benchmarkSets.label,
        isProvisional: benchmarkSets.isProvisional,
        sourceNote: benchmarkSets.sourceNote,
        effectiveFrom: benchmarkSets.effectiveFrom,
      })
      .from(benchmarkSets)
      .innerJoin(tracks, eq(tracks.id, benchmarkSets.trackId))
      .where(and(eq(benchmarkSets.isActive, true)))
      .orderBy(tracks.displayOrder);

    return { rows, runs, activeSets };
  });

  const records: OutcomeRecord[] = data.rows
    .map((row) => {
      const score = row.readiness ?? row.latestPercent;
      return score === null
        ? null
        : {
            userId: row.userId,
            score: Number(score),
            placed: row.status === "placed",
          };
    })
    .filter((r): r is OutcomeRecord => r !== null);

  const report = buildTrustReport(records);
  const anyProvisional = data.activeSets.some((s) => s.isProvisional);

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Validation evidence</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        What the data actually shows about the relationship between SkillGaps
        scores and real placement outcomes at your institution.
      </p>

      {anyProvisional ? (
        <div className="mb-6">
          <Alert tone="info">
            Hiring-bar benchmarks are currently <strong>provisional</strong> —
            estimates set by the SkillGaps team, not derived from outcomes. They
            stay that way until a calibration run has enough recorded outcomes
            to support changing them. Recording outcomes on the{" "}
            <strong>Outcomes</strong> page is what moves this forward.
          </Alert>
        </div>
      ) : null}

      <SectionHeading
        title="Placement rate by score band"
        hint="Students with both a score and a recorded outcome. Bands with too few students to report safely are withheld."
      />

      {report.headline ? (
        <Card className="mb-4 border-good-500/30 bg-good-100">
          <p className="text-xs font-semibold uppercase tracking-wide text-good-500">
            Supported claim
          </p>
          <p className="mt-1 text-lg font-medium text-ink-900">{report.headline}</p>
        </Card>
      ) : (
        <div className="mb-4">
          <Alert>
            There is not yet enough evidence to state a relationship between
            scores and placement outcomes. This is the honest position until the
            bands separate on a large enough sample — do not quote a figure from
            this page as validation before then.
          </Alert>
        </div>
      )}

      {records.length === 0 ? (
        <Empty>
          No student has both a score and a recorded placement outcome yet.
        </Empty>
      ) : (
        <Card className="mb-6 overflow-x-auto p-0">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-5 py-3 font-medium">Score band</th>
                <th className="px-5 py-3 text-right font-medium">Students</th>
                <th className="px-5 py-3 text-right font-medium">Placed</th>
                <th className="px-5 py-3 text-right font-medium">Rate</th>
                <th className="px-5 py-3 font-medium">95% interval</th>
              </tr>
            </thead>
            <tbody>
              {report.bands.map((band) => (
                <tr key={band.label} className="border-b border-ink-100 last:border-0">
                  <td className="px-5 py-3 font-medium text-ink-800">{band.label}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {band.suppressed ? (
                      <span className="text-ink-400">withheld</span>
                    ) : (
                      band.sampleSize
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {band.suppressed ? "—" : band.placedCount}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums font-medium">
                    {band.suppressed ? "—" : `${band.placementRate}%`}
                  </td>
                  <td className="px-5 py-3 text-xs text-ink-600">
                    {band.suppressed
                      ? band.note
                      : `${band.confidenceLow}% – ${band.confidenceHigh}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Card className="mb-6">
        <SectionHeading title="How to read this" />
        <ul className="space-y-2 text-sm leading-relaxed text-ink-600">
          {report.caveats.map((caveat, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="text-ink-400">
                •
              </span>
              {caveat}
            </li>
          ))}
        </ul>
      </Card>

      <SectionHeading
        title="Benchmark calibration history"
        hint="Runs of the offline calibration job, including the ones that declined to change anything."
      />
      {data.runs.length === 0 ? (
        <Empty>
          No calibration run has been performed yet. Benchmarks remain the
          platform team&apos;s provisional estimates.
        </Empty>
      ) : (
        <Card className="mb-6 p-0">
          <ul className="divide-y divide-ink-100">
            {data.runs.map((run) => (
              <li key={run.id} className="px-5 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{run.trackName}</p>
                    <p className="mt-0.5 text-xs text-ink-600">
                      {run.startedAt.toLocaleDateString("en-IN", {
                        dateStyle: "medium",
                      })}{" "}
                      · {run.sampleSize} students, {run.placedCount} placed
                      {run.correlation !== null
                        ? ` · r = ${Number(run.correlation)}`
                        : ""}
                    </p>
                    {run.message ? (
                      <p className="mt-1 text-xs text-ink-600">{run.message}</p>
                    ) : null}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      run.status === "succeeded"
                        ? "bg-good-100 text-good-500"
                        : run.status === "insufficient_data"
                          ? "bg-warn-100 text-warn-500"
                          : "bg-ink-100 text-ink-600"
                    }`}
                  >
                    {run.status === "insufficient_data"
                      ? "Not enough data"
                      : run.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SectionHeading title="Benchmarks in force" />
      <Card className="p-0">
        <ul className="divide-y divide-ink-100">
          {data.activeSets.map((set) => (
            <li key={set.trackName} className="px-5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{set.trackName}</p>
                  <p className="mt-0.5 text-xs text-ink-600">{set.label}</p>
                  {set.sourceNote ? (
                    <p className="mt-1 max-w-xl text-xs text-ink-600">
                      {set.sourceNote}
                    </p>
                  ) : null}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    set.isProvisional
                      ? "bg-warn-100 text-warn-500"
                      : "bg-good-100 text-good-500"
                  }`}
                >
                  {set.isProvisional ? "Provisional" : "Calibrated"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </AppShell>
  );
}
