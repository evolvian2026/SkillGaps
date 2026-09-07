import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, Card, Empty, SectionHeading } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { recentChecks } from "@/lib/practice/queries";
import { attempts, tracks } from "@/lib/db/schema";
import { startAttemptAction } from "@/lib/assessment/actions";
import { openEmployerAssessments } from "@/lib/employer/queries";
import { startEmployerAssessmentAction } from "@/lib/employer/actions";

export const metadata = { title: "Your assessments" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireStudent();

  const data = await withRequestContext(user, async (tx) => {
    const availableTracks = await tx
      .select({
        id: tracks.id,
        code: tracks.code,
        name: tracks.name,
        description: tracks.description,
        durationSeconds: tracks.durationSeconds,
        questionCount: sql<number>`(
          SELECT COALESCE(SUM(question_count), 0)
          FROM track_blueprint_items WHERE track_id = ${tracks.id}
        )`,
      })
      .from(tracks)
      .where(eq(tracks.isActive, true))
      .orderBy(tracks.displayOrder);

    const checks = await recentChecks(tx, user.userId);
    const history = await tx
      .select({
        id: attempts.id,
        status: attempts.status,
        percent: attempts.percent,
        startedAt: attempts.startedAt,
        submittedAt: attempts.submittedAt,
        expiresAt: attempts.expiresAt,
        trackName: tracks.name,
        trackId: tracks.id,
      })
      .from(attempts)
      .innerJoin(tracks, eq(tracks.id, attempts.trackId))
      .where(eq(attempts.userId, user.userId))
      .orderBy(desc(attempts.startedAt))
      .limit(20);

    const [inProgress] = await tx
      .select({ id: attempts.id, trackName: tracks.name })
      .from(attempts)
      .innerJoin(tracks, eq(tracks.id, attempts.trackId))
      .where(
        and(
          eq(attempts.userId, user.userId),
          eq(attempts.status, "in_progress"),
          sql`${attempts.expiresAt} > now()`,
        ),
      )
      .limit(1);

    return {
      availableTracks,
      history,
      inProgress,
      checks,
      // Employer drives open to this student's cohort. RLS hides any whose
      // employer lacks an active grant on their institution.
      employerAssessments: await openEmployerAssessments(tx),
    };
  });

  const bestByTrack = new Map<string, number>();
  for (const row of data.history) {
    if (row.status !== "submitted" || row.percent === null) continue;
    const percent = Number(row.percent);
    bestByTrack.set(row.trackId, Math.max(bestByTrack.get(row.trackId) ?? 0, percent));
  }

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Hello, {user.fullName.split(" ")[0]}</h1>
      <p className="mb-6 text-sm text-ink-600">
        Take a diagnostic to see where you stand against the hiring bar for the
        role you are targeting.
      </p>

      {error ? (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {data.inProgress ? (
        <div className="mb-6">
          <Alert tone="info">
            You have an assessment in progress ({data.inProgress.trackName}).{" "}
            <Link
              href={`/assess/${data.inProgress.id}`}
              className="font-semibold underline"
            >
              Resume it
            </Link>
            .
          </Alert>
        </div>
      ) : null}

      {data.employerAssessments.length > 0 ? (
        <div className="mb-8">
          <SectionHeading
            title="Campus drives open to you"
            hint="Assessments set by employers your institution works with. Taking one does not share your identity with them."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {data.employerAssessments.map((drive) => (
              <Card key={drive.id} className="flex flex-col border-brand-500/30">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
                  {drive.employerName}
                </p>
                <h3 className="mt-1 font-semibold">{drive.title}</h3>
                <p className="mt-1 flex-1 text-sm text-ink-600">
                  {drive.description ?? drive.trackName}
                </p>
                <p className="mt-3 text-xs text-ink-400">
                  {drive.trackName} · {Math.round(drive.durationSeconds / 60)} minutes
                  {drive.closesAt
                    ? ` · closes ${drive.closesAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}`
                    : ""}
                </p>
                <form action={startEmployerAssessmentAction} className="mt-4">
                  <input type="hidden" name="assessmentId" value={drive.id} />
                  <Button type="submit" className="w-full">
                    Start drive assessment
                  </Button>
                </form>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      <SectionHeading
        title="Choose a role track"
        hint="Each attempt draws a fresh, randomised set of questions from the bank."
      />
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        {data.availableTracks.map((track) => {
          const best = bestByTrack.get(track.id);
          return (
            <Card key={track.id} className="flex flex-col">
              <h3 className="font-semibold">{track.name}</h3>
              <p className="mt-1 flex-1 text-sm text-ink-600">{track.description}</p>
              <p className="mt-3 text-xs text-ink-400">
                {track.questionCount} questions ·{" "}
                {Math.round(track.durationSeconds / 60)} minutes
              </p>
              {best !== undefined ? (
                <p className="mt-1 text-xs font-medium text-good-500">
                  Your best: {best}%
                </p>
              ) : null}
              <form action={startAttemptAction} className="mt-4">
                <input type="hidden" name="trackId" value={track.id} />
                <Button type="submit" className="w-full">
                  {best !== undefined ? "Retake assessment" : "Start assessment"}
                </Button>
              </form>
            </Card>
          );
        })}
      </div>

      {data.checks.length > 0 ? (
        <>
          <SectionHeading
            title="Your skill checks"
            hint="Short, focused re-checks. A personal progress signal only — they do not change your report or your readiness score."
          />
          <Card className="mb-8 overflow-x-auto p-0">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th className="px-5 py-3 font-medium">Area</th>
                  <th className="px-5 py-3 font-medium">Taken</th>
                  <th className="px-5 py-3 text-right font-medium">Diagnostic</th>
                  <th className="px-5 py-3 text-right font-medium">Check</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {data.checks.map((check) => (
                  <tr key={check.id} className="border-b border-ink-100 last:border-0">
                    <td className="px-5 py-3 font-medium text-ink-800">
                      {check.areaName}
                    </td>
                    <td className="px-5 py-3 text-ink-600">
                      {check.completedAt
                        ? check.completedAt.toLocaleDateString("en-IN", {
                            dateStyle: "medium",
                          })
                        : "In progress"}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-600">
                      {check.baselinePercent === null ? "—" : `${check.baselinePercent}%`}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {check.percent === null ? "—" : `${check.percent}%`}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/check/${check.id}`}
                        className="text-sm font-medium text-brand-600 hover:underline"
                      >
                        {check.completedAt ? "View" : "Continue"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      ) : null}

      <SectionHeading title="Your attempts" />
      {data.history.length === 0 ? (
        <Empty>You have not taken an assessment yet.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-5 py-3 font-medium">Track</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Score</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.history.map((row) => {
                const active =
                  row.status === "in_progress" && row.expiresAt.getTime() > Date.now();
                return (
                  <tr key={row.id} className="border-b border-ink-100 last:border-0">
                    <td className="px-5 py-3 font-medium text-ink-800">{row.trackName}</td>
                    <td className="px-5 py-3 text-ink-600">
                      {(row.submittedAt ?? row.startedAt).toLocaleDateString("en-IN", {
                        dateStyle: "medium",
                      })}
                    </td>
                    <td className="px-5 py-3 text-ink-600">
                      {active
                        ? "In progress"
                        : row.status === "submitted"
                          ? "Submitted"
                          : "Expired"}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      {row.percent === null ? "—" : `${Number(row.percent)}%`}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={active ? `/assess/${row.id}` : `/report/${row.id}`}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {active ? "Resume" : "View report"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
