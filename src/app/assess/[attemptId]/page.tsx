import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { AssessmentRunner } from "@/components/assessment-runner";
import { requireStudent } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { attempts, tracks } from "@/lib/db/schema";
import { loadPaper } from "@/lib/assessment/paper";
import { submitAttempt } from "@/lib/assessment/submit";

export const metadata = { title: "Assessment in progress" };
// The paper is per-attempt and time-sensitive; nothing here may be cached.
export const dynamic = "force-dynamic";

export default async function AssessPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const user = await requireStudent();

  const data = await withRequestContext(user, async (tx) => {
    const [attempt] = await tx
      .select({
        id: attempts.id,
        status: attempts.status,
        expiresAt: attempts.expiresAt,
        userId: attempts.userId,
        trackName: tracks.name,
      })
      .from(attempts)
      .innerJoin(tracks, eq(tracks.id, attempts.trackId))
      .where(eq(attempts.id, attemptId));

    if (!attempt) return null;
    if (attempt.status !== "in_progress") return { attempt, expired: false, paper: [] };

    // The countdown is client-side, so the deadline is re-checked here: a
    // student who closes the tab and returns late gets graded, not extra time.
    if (attempt.expiresAt.getTime() <= Date.now()) {
      await submitAttempt(tx, attemptId);
      return { attempt, expired: true, paper: [] };
    }

    return { attempt, expired: false, paper: await loadPaper(tx, attemptId) };
  });

  if (!data) notFound();
  if (data.expired || data.attempt.status !== "in_progress") {
    redirect(`/report/${attemptId}`);
  }

  return (
    <AssessmentRunner
      attemptId={attemptId}
      trackName={data.attempt.trackName}
      expiresAtIso={data.attempt.expiresAt.toISOString()}
      questions={data.paper}
    />
  );
}
