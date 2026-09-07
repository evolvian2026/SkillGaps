"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireStudent } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import {
  practiceResponses,
  practiceSessions,
  questionOptions,
  skillCheckQuestions,
  skillChecks,
} from "@/lib/db/schema";
import { PracticeError, startCheck, startPractice } from "./session";

/**
 * The gap → practice → re-prove loop.
 *
 * Grading happens on the server in both flows, but for opposite reasons.
 * Practice grades immediately because the explanation is the point. A check
 * grades only at the end, so that a student cannot use the per-question
 * response as an oracle to find the right answer before committing.
 */

export interface PracticeState {
  error?: string;
}

const areaSchema = z.object({ skillAreaId: z.string().uuid() });

export async function startPracticeAction(formData: FormData): Promise<void> {
  const user = await requireStudent();
  const parsed = areaSchema.safeParse({ skillAreaId: formData.get("skillAreaId") });
  if (!parsed.success) redirect("/dashboard");

  let sessionId: string;
  try {
    sessionId = await withRequestContext(user, (tx) =>
      startPractice(tx, user, parsed.data.skillAreaId),
    );
  } catch (err) {
    if (err instanceof PracticeError) {
      redirect(`/dashboard?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
  redirect(`/practice/${sessionId}`);
}

const answerSchema = z.object({
  responseId: z.string().uuid(),
  optionId: z.string().uuid(),
});

/**
 * Answers one practice question and returns whether it was right.
 *
 * Correctness is resolved from the option row rather than trusted from the
 * client, and the first answer sticks: re-answering after seeing the
 * explanation would make the session summary meaningless.
 */
export async function answerPracticeAction(
  sessionId: string,
  input: { responseId: string; optionId: string },
): Promise<{ ok: boolean; error?: string }> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid answer." };

  const user = await requireStudent();

  return withRequestContext(user, async (tx) => {
    const [response] = await tx
      .select({
        id: practiceResponses.id,
        selectedOptionId: practiceResponses.selectedOptionId,
        questionId: practiceResponses.questionId,
      })
      .from(practiceResponses)
      .where(
        and(
          eq(practiceResponses.id, parsed.data.responseId),
          eq(practiceResponses.sessionId, sessionId),
        ),
      );
    if (!response) return { ok: false, error: "Unknown question." };
    if (response.selectedOptionId) return { ok: true };

    const [option] = await tx
      .select({ id: questionOptions.id, isCorrect: questionOptions.isCorrect })
      .from(questionOptions)
      .where(
        and(
          eq(questionOptions.id, parsed.data.optionId),
          eq(questionOptions.questionId, response.questionId),
        ),
      );
    if (!option) return { ok: false, error: "That option is not on this question." };

    await tx
      .update(practiceResponses)
      .set({
        selectedOptionId: option.id,
        isCorrect: option.isCorrect,
        answeredAt: new Date(),
      })
      .where(eq(practiceResponses.id, response.id));

    await tx
      .update(practiceSessions)
      .set({
        correctCount: sql`(
          SELECT COUNT(*) FROM practice_responses r
          WHERE r.session_id = ${sessionId} AND r.is_correct
        )`,
      })
      .where(eq(practiceSessions.id, sessionId));

    revalidatePath(`/practice/${sessionId}`);
    return { ok: true };
  });
}

export async function finishPracticeAction(formData: FormData): Promise<void> {
  const user = await requireStudent();
  const sessionId = String(formData.get("sessionId") ?? "");

  await withRequestContext(user, (tx) =>
    tx
      .update(practiceSessions)
      .set({ completedAt: new Date() })
      .where(
        and(
          eq(practiceSessions.id, sessionId),
          eq(practiceSessions.userId, user.userId),
        ),
      ),
  );
  redirect(`/practice/${sessionId}?done=1`);
}

/* -------------------------------------------------------------------------
 * Skill checks
 * ---------------------------------------------------------------------- */

export async function startCheckAction(formData: FormData): Promise<void> {
  const user = await requireStudent();
  const parsed = areaSchema.safeParse({ skillAreaId: formData.get("skillAreaId") });
  if (!parsed.success) redirect("/dashboard");

  let checkId: string;
  try {
    checkId = await withRequestContext(user, (tx) =>
      startCheck(tx, user, parsed.data.skillAreaId),
    );
  } catch (err) {
    if (err instanceof PracticeError) {
      redirect(`/dashboard?error=${encodeURIComponent(err.message)}`);
    }
    throw err;
  }
  redirect(`/check/${checkId}`);
}

const checkAnswerSchema = z.object({
  checkQuestionId: z.string().uuid(),
  optionId: z.string().uuid(),
});

/**
 * Records one check answer.
 *
 * Deliberately returns no correctness. A check is scored, so telling the
 * student whether each answer was right as they went would turn it into
 * practice with an unlimited number of tries.
 */
export async function saveCheckAnswerAction(
  checkId: string,
  input: { checkQuestionId: string; optionId: string },
): Promise<{ ok: boolean; error?: string }> {
  const parsed = checkAnswerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid answer." };

  const user = await requireStudent();

  return withRequestContext(user, async (tx) => {
    const [check] = await tx
      .select({ id: skillChecks.id, completedAt: skillChecks.completedAt })
      .from(skillChecks)
      .where(eq(skillChecks.id, checkId));
    if (!check) return { ok: false, error: "Check not found." };
    if (check.completedAt) return { ok: false, error: "This check is already finished." };

    const updated = await tx
      .update(skillCheckQuestions)
      .set({ selectedOptionId: parsed.data.optionId })
      .where(
        and(
          eq(skillCheckQuestions.id, parsed.data.checkQuestionId),
          eq(skillCheckQuestions.checkId, checkId),
        ),
      )
      .returning({ id: skillCheckQuestions.id });

    return updated.length > 0
      ? { ok: true }
      : { ok: false, error: "Unknown question." };
  });
}

/**
 * Grades the check.
 *
 * Everything is graded here, at the end, from the option rows — the client is
 * never told and never trusted on correctness.
 */
export async function submitCheckAction(formData: FormData): Promise<void> {
  const user = await requireStudent();
  const checkId = String(formData.get("checkId") ?? "");

  await withRequestContext(user, async (tx) => {
    const [check] = await tx
      .select({ id: skillChecks.id, completedAt: skillChecks.completedAt })
      .from(skillChecks)
      .where(
        and(eq(skillChecks.id, checkId), eq(skillChecks.userId, user.userId)),
      );
    if (!check || check.completedAt) return;

    const rows = await tx
      .select({
        id: skillCheckQuestions.id,
        selectedOptionId: skillCheckQuestions.selectedOptionId,
        questionId: skillCheckQuestions.questionId,
      })
      .from(skillCheckQuestions)
      .where(eq(skillCheckQuestions.checkId, checkId));

    let correct = 0;
    for (const row of rows) {
      if (!row.selectedOptionId) continue;
      const [option] = await tx
        .select({ isCorrect: questionOptions.isCorrect })
        .from(questionOptions)
        .where(eq(questionOptions.id, row.selectedOptionId));
      const isCorrect = option?.isCorrect ?? false;
      if (isCorrect) correct++;
      await tx
        .update(skillCheckQuestions)
        .set({ isCorrect })
        .where(eq(skillCheckQuestions.id, row.id));
    }

    const total = rows.length;
    await tx
      .update(skillChecks)
      .set({
        correctCount: correct,
        percent: total > 0 ? String(Math.round((correct / total) * 100)) : "0",
        completedAt: new Date(),
      })
      .where(eq(skillChecks.id, checkId));
  });

  redirect(`/check/${checkId}`);
}
