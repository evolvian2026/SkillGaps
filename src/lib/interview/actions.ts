"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { interviewResponses, interviewSessions } from "@/lib/db/schema";
import { dedupeKey, enqueue } from "@/lib/queue";
import { InterviewError, startInterview } from "./session";

export async function startInterviewAction(formData: FormData): Promise<void> {
  const trackId = String(formData.get("trackId") ?? "");
  const user = await requireStudent();

  let sessionId: string;
  try {
    sessionId = await withRequestContext(user, (tx) =>
      startInterview(tx, user, trackId),
    );
  } catch (err) {
    if (err instanceof InterviewError) {
      redirect(`/interview?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
  redirect(`/interview/${sessionId}`);
}

const saveSchema = z.object({
  responseId: z.string().uuid(),
  responseText: z.string().max(20_000),
  timeSpentMs: z.number().int().min(0).max(86_400_000).nullable(),
});

export async function saveInterviewResponseAction(
  sessionId: string,
  input: z.infer<typeof saveSchema>,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid response payload." };

  const user = await requireStudent();

  return withRequestContext(user, async (tx) => {
    const [session] = await tx
      .select({ status: interviewSessions.status })
      .from(interviewSessions)
      .where(eq(interviewSessions.id, sessionId));
    if (!session) return { ok: false, error: "Interview not found." };
    if (session.status !== "in_progress") {
      return { ok: false, error: "This interview is already submitted." };
    }

    const updated = await tx
      .update(interviewResponses)
      .set({
        responseText: parsed.data.responseText,
        timeSpentMs: parsed.data.timeSpentMs,
        answeredAt: sql`now()`,
      })
      .where(
        and(
          eq(interviewResponses.id, parsed.data.responseId),
          eq(interviewResponses.sessionId, sessionId),
        ),
      )
      .returning({ id: interviewResponses.id });

    if (updated.length === 0) return { ok: false, error: "Unknown question." };
    return { ok: true };
  });
}

/**
 * Submits the interview for evaluation.
 *
 * Evaluation is queued, not run here: a model-scored six-question interview
 * takes far longer than a request should, and the student should not sit on a
 * spinner for it. The feedback page shows a pending state until the worker
 * finishes.
 */
export async function submitInterviewAction(sessionId: string): Promise<void> {
  const user = await requireStudent();

  await withRequestContext(user, async (tx) => {
    const [session] = await tx
      .select({ status: interviewSessions.status })
      .from(interviewSessions)
      .where(eq(interviewSessions.id, sessionId));
    if (!session || session.status !== "in_progress") return;

    await tx
      .update(interviewSessions)
      .set({ status: "submitted", submittedAt: new Date() })
      .where(eq(interviewSessions.id, sessionId));
  });

  await enqueue(
    { name: "evaluate-interview", userId: user.userId, sessionId },
    // Keyed by session so a double submit cannot queue two evaluations.
    { jobId: dedupeKey("evaluate-interview", sessionId) },
  );

  revalidatePath("/interview");
  redirect(`/interview/${sessionId}/feedback`);
}
