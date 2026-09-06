import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { InterviewRunner } from "@/components/interview-runner";
import { requireStudent } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { interviewSessions, tracks } from "@/lib/db/schema";
import { loadInterview } from "@/lib/interview/session";

export const metadata = { title: "Mock interview" };
export const dynamic = "force-dynamic";

export default async function InterviewPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const user = await requireStudent();

  const data = await withRequestContext(user, async (tx) => {
    const [session] = await tx
      .select({
        id: interviewSessions.id,
        status: interviewSessions.status,
        trackName: tracks.name,
      })
      .from(interviewSessions)
      .innerJoin(tracks, eq(tracks.id, interviewSessions.trackId))
      .where(eq(interviewSessions.id, sessionId));

    if (!session) return null;
    if (session.status !== "in_progress") return { session, questions: [] };
    return { session, questions: await loadInterview(tx, sessionId) };
  });

  if (!data) notFound();
  if (data.session.status !== "in_progress") {
    redirect(`/interview/${sessionId}/feedback`);
  }

  return (
    <InterviewRunner
      sessionId={sessionId}
      trackName={data.session.trackName}
      questions={data.questions}
    />
  );
}
