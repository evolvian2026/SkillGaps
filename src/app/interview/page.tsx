import Link from "next/link";
import { eq } from "drizzle-orm";
import { AppShell } from "@/components/app-shell";
import { Alert, Button, Card, Empty, SectionHeading } from "@/components/ui";
import { requireStudent } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { tracks } from "@/lib/db/schema";
import { listInterviews } from "@/lib/interview/session";
import { startInterviewAction } from "@/lib/interview/actions";

export const metadata = { title: "Mock interviews" };
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  in_progress: "In progress",
  submitted: "Being evaluated",
  evaluated: "Feedback ready",
  abandoned: "Abandoned",
};

export default async function InterviewIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireStudent();

  const data = await withRequestContext(user, async (tx) => ({
    availableTracks: await tx
      .select({ id: tracks.id, name: tracks.name, description: tracks.description })
      .from(tracks)
      .where(eq(tracks.isActive, true))
      .orderBy(tracks.displayOrder),
    history: await listInterviews(tx, user.userId),
  }));

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Mock interviews</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        Six questions — a couple of behavioural, some technical, one judgement
        call — answered in writing and returned with feedback on each one.
        There is no timer you can fail; the suggested time is a guide.
      </p>

      {error ? (
        <div className="mb-5">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <SectionHeading title="Start an interview" />
      <div className="mb-8 grid gap-4 md:grid-cols-3">
        {data.availableTracks.map((track) => (
          <Card key={track.id} className="flex flex-col">
            <h3 className="font-semibold">{track.name}</h3>
            <p className="mt-1 flex-1 text-sm text-ink-600">{track.description}</p>
            <form action={startInterviewAction} className="mt-4">
              <input type="hidden" name="trackId" value={track.id} />
              <Button type="submit" className="w-full">
                Start interview
              </Button>
            </form>
          </Card>
        ))}
      </div>

      <SectionHeading title="Your interviews" />
      {data.history.length === 0 ? (
        <Empty>You have not taken a mock interview yet.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-5 py-3 font-medium">Track</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Answered</th>
                <th className="px-5 py-3 text-right font-medium">Score</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.history.map((row) => (
                <tr key={row.id} className="border-b border-ink-100 last:border-0">
                  <td className="px-5 py-3 font-medium text-ink-800">{row.trackName}</td>
                  <td className="px-5 py-3 text-ink-600">
                    {row.startedAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  </td>
                  <td className="px-5 py-3 text-ink-600">
                    {STATUS_LABEL[row.status] ?? row.status}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-ink-600">
                    {row.answered}/{row.total}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {row.overallScore === null ? "—" : `${Number(row.overallScore)}%`}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={
                        row.status === "in_progress"
                          ? `/interview/${row.id}`
                          : `/interview/${row.id}/feedback`
                      }
                      className="font-medium text-brand-600 hover:underline"
                    >
                      {row.status === "in_progress" ? "Resume" : "View feedback"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
