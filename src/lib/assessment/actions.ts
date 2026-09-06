"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { answers, attemptQuestions, attempts, integrityEvents } from "@/lib/db/schema";
import { AssessmentError, startAttempt } from "./paper";
import { submitAttempt } from "./submit";

export async function startAttemptAction(formData: FormData): Promise<void> {
  const trackId = String(formData.get("trackId") ?? "");
  const user = await requireStudent();

  let attemptId: string;
  try {
    attemptId = await withRequestContext(user, (tx) =>
      startAttempt(tx, user, trackId),
    );
  } catch (err) {
    if (err instanceof AssessmentError) {
      redirect(`/dashboard?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
  redirect(`/assess/${attemptId}`);
}

const saveSchema = z.object({
  attemptQuestionId: z.string().uuid(),
  optionId: z.string().uuid().nullable(),
  responseText: z.string().max(20_000).nullable(),
  languageId: z.number().int().nullable(),
  timeSpentMs: z.number().int().min(0).max(86_400_000).nullable(),
});

export type SaveAnswerInput = z.infer<typeof saveSchema>;

/**
 * Save one answer mid-attempt.
 *
 * Grading is deliberately not done here: the correct answer must not be
 * derivable from a save response's timing or content. Everything is graded at
 * submit time.
 */
export async function saveAnswerAction(
  attemptId: string,
  input: SaveAnswerInput,
): Promise<{ ok: boolean; error?: string }> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid answer payload." };

  const user = await requireStudent();

  return withRequestContext(user, async (tx) => {
    // RLS already restricts this to the caller's own attempts; the explicit
    // checks below turn "no rows" into a clear error rather than a silent no-op.
    const [attempt] = await tx
      .select({ id: attempts.id, status: attempts.status, expiresAt: attempts.expiresAt })
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    if (!attempt) return { ok: false, error: "Attempt not found." };
    if (attempt.status !== "in_progress") {
      return { ok: false, error: "This attempt is already submitted." };
    }
    if (attempt.expiresAt.getTime() < Date.now()) {
      return { ok: false, error: "Time is up for this attempt." };
    }

    const [question] = await tx
      .select({ id: attemptQuestions.id })
      .from(attemptQuestions)
      .where(
        and(
          eq(attemptQuestions.id, parsed.data.attemptQuestionId),
          eq(attemptQuestions.attemptId, attemptId),
        ),
      );
    if (!question) return { ok: false, error: "Unknown question." };

    await tx
      .insert(answers)
      .values({
        tenantId: user.tenantId,
        attemptQuestionId: parsed.data.attemptQuestionId,
        selectedOptionId: parsed.data.optionId,
        responseText: parsed.data.responseText,
        languageId: parsed.data.languageId,
        timeSpentMs: parsed.data.timeSpentMs,
      })
      .onConflictDoUpdate({
        target: answers.attemptQuestionId,
        set: {
          selectedOptionId: parsed.data.optionId,
          responseText: parsed.data.responseText,
          languageId: parsed.data.languageId,
          timeSpentMs: parsed.data.timeSpentMs,
          answeredAt: sql`now()`,
        },
      });

    return { ok: true };
  });
}

const EVENT_TYPES = [
  "tab_blur",
  "tab_focus",
  "paste_blocked",
  "copy_blocked",
  "fullscreen_exit",
  "rapid_answer",
  "resumed_attempt",
] as const;

const eventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  detail: z.record(z.unknown()).nullable().optional(),
});

/** Record an integrity signal. Flagged for later review, never blocking. */
export async function recordIntegrityEventAction(
  attemptId: string,
  input: { type: string; detail?: Record<string, unknown> | null },
): Promise<{ ok: boolean }> {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const user = await requireStudent();
  await withRequestContext(user, async (tx) => {
    const [attempt] = await tx
      .select({ id: attempts.id, status: attempts.status })
      .from(attempts)
      .where(eq(attempts.id, attemptId));
    if (!attempt || attempt.status !== "in_progress") return;

    await tx.insert(integrityEvents).values({
      tenantId: user.tenantId,
      attemptId,
      type: parsed.data.type,
      detail: (parsed.data.detail ?? null) as never,
    });
  });
  return { ok: true };
}

export async function submitAttemptAction(attemptId: string): Promise<void> {
  const user = await requireStudent();
  await withRequestContext(user, (tx) => submitAttempt(tx, attemptId));
  revalidatePath("/dashboard");
  redirect(`/report/${attemptId}`);
}
