import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Card, Empty, ProvisionalBadge, SectionHeading } from "@/components/ui";
import { AppShell } from "@/components/app-shell";
import { SkillGapChart, TrendChart } from "@/components/lazy-charts";
import { requireUser } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { attempts } from "@/lib/db/schema";
import { loadAttemptReport, loadTrend } from "@/lib/assessment/report";

export const metadata = { title: "Your skill-gap report" };
export const dynamic = "force-dynamic";

const INTEGRITY_LABELS: Record<string, string> = {
  tab_blur: "Switched away from the assessment tab",
  paste_blocked: "Attempted to paste into a code answer",
  copy_blocked: "Attempted to copy from the assessment",
  fast_completion: "Completed unusually quickly",
  rapid_answer: "Answered unusually fast on some questions",
};

function Delta({ gap }: { gap: number | null }) {
  if (gap === null) return <span className="text-ink-400">—</span>;
  if (gap <= 0) {
    return (
      <span className="font-medium text-good-500">
        at or above bar (+{Math.abs(gap)})
      </span>
    );
  }
  return (
    <span className={gap >= 15 ? "font-medium text-risk-500" : "font-medium text-warn-500"}>
      {gap} points below
    </span>
  );
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const user = await requireUser();

  const data = await withRequestContext(user, async (tx) => {
    const report = await loadAttemptReport(tx, attemptId);
    if (!report) return null;
    const [row] = await tx
      .select({ trackId: attempts.trackId, userId: attempts.userId })
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    const trend = row ? await loadTrend(tx, row.userId, row.trackId) : [];
    return { report, trend, trackId: row?.trackId ?? null };
  });

  if (!data) notFound();
  const { report, trend } = data;

  const flags = Object.entries(report.integrityFlags).filter(([, n]) => n > 0);

  return (
    <AppShell user={user}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-ink-600">{report.trackName}</p>
          <h1 className="text-2xl font-semibold">Your skill-gap report</h1>
          <p className="mt-1 text-sm text-ink-600">
            {report.submittedAt
              ? `Submitted ${report.submittedAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}`
              : "Not yet submitted"}
          </p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white px-5 py-3 text-right">
          <p className="text-xs uppercase tracking-wide text-ink-400">Overall</p>
          <p className="text-3xl font-semibold tabular-nums">{report.percent}%</p>
          <p className="text-xs text-ink-600">
            {report.totalScore} of {report.maxScore} points
          </p>
        </div>
      </div>

      <div className="mb-6">
        <Card>
          <SectionHeading
            title="Where you stand, area by area"
            hint="Bars show your score. The dashed notch is the hiring bar for this track."
            action={<ProvisionalBadge />}
          />
          {report.areas.length === 0 ? (
            <Empty>No scores were recorded for this attempt.</Empty>
          ) : (
            <>
              <SkillGapChart
                data={report.areas.map((a) => ({
                  name: a.name,
                  percent: a.percent,
                  hiringBar: a.hiringBarPercent,
                }))}
              />
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[440px] text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                      <th className="py-2 font-medium">Skill area</th>
                      <th className="py-2 text-right font-medium">You</th>
                      <th className="py-2 text-right font-medium">Bar</th>
                      <th className="py-2 text-right font-medium">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.areas.map((area) => (
                      <tr key={area.skillAreaId} className="border-b border-ink-100">
                        <td className="py-2.5 font-medium text-ink-800">{area.name}</td>
                        <td className="py-2.5 text-right tabular-nums">{area.percent}%</td>
                        <td className="py-2.5 text-right tabular-nums text-ink-600">
                          {area.hiringBarPercent === null ? "—" : `${area.hiringBarPercent}%`}
                        </td>
                        <td className="py-2.5 text-right">
                          <Delta gap={area.gap} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-ink-600">
                Hiring-bar values are provisional estimates set by the platform
                team. They have not yet been validated against real placement
                outcomes, so treat them as a guide rather than a verdict.
              </p>
            </>
          )}
        </Card>
      </div>

      <div className="mb-6">
        <SectionHeading
          title="Focus here first"
          hint="The areas costing you the most ground against the bar, largest gap first."
        />
        {report.priorityAreas.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-600">
              You are at or above the provisional bar in every area measured
              here. Retake the assessment after some time to confirm it holds.
            </p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {report.priorityAreas.map((area, i) => (
              <Card key={area.skillAreaId}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-risk-100 text-xs font-bold text-risk-500">
                    {i + 1}
                  </span>
                  <h3 className="font-semibold">{area.name}</h3>
                </div>
                <p className="mb-3 text-sm text-ink-600">
                  You scored <strong className="text-ink-900">{area.percent}%</strong>{" "}
                  against a bar of {area.hiringBarPercent}%.
                </p>
                <ul className="space-y-2">
                  {(report.resourcesByArea[area.skillAreaId] ?? []).map((resource) => (
                    <li key={resource.id}>
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-brand-600 hover:underline"
                      >
                        {resource.title}
                      </a>
                      <span className="block text-xs text-ink-600">
                        {[resource.provider, resource.kind, resource.estimatedHours ? `~${resource.estimatedHours}h` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </li>
                  ))}
                  {(report.resourcesByArea[area.skillAreaId] ?? []).length === 0 ? (
                    <li className="text-xs text-ink-600">
                      No resources curated for this area yet.
                    </li>
                  ) : null}
                </ul>
              </Card>
            ))}
          </div>
        )}
      </div>

      {trend.length > 1 ? (
        <div className="mb-6">
          <Card>
            <SectionHeading
              title="Your progress on this track"
              hint={`${trend.length} completed attempts.`}
            />
            <TrendChart
              data={trend.map((point, i) => ({
                label: `#${i + 1}`,
                percent: point.percent,
              }))}
            />
          </Card>
        </div>
      ) : null}

      {flags.length > 0 ? (
        <Card className="mb-6">
          <SectionHeading
            title="Attempt notes"
            hint="Recorded for your institution's review. These do not affect your score."
          />
          <ul className="space-y-1.5 text-sm text-ink-600">
            {flags.map(([type, count]) => (
              <li key={type}>
                {INTEGRITY_LABELS[type] ?? type}
                {count > 1 ? ` (${count}×)` : ""}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Link href="/dashboard" className="text-sm font-medium text-brand-600 hover:underline">
        ← Back to your assessments
      </Link>
    </AppShell>
  );
}
