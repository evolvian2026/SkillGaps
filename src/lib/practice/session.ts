import "server-only";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  attemptQuestions,
  attemptSkillScores,
  attempts,
  practiceResponses,
  practiceSessions,
  questionOptions,
  questions,
  skillAreas,
  skillCheckQuestions,
  skillChecks,
} from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/types";
import { seededRandom, shuffle } from "@/lib/assessment/random";
import { TARGET_CHECK_LENGTH, canStartCheck } from "./progress";

export class PracticeError extends Error {}

/** How many practice items one run serves. */
export const PRACTICE_LENGTH = 6;

export interface PracticeItem {
  responseId: string;
  position: number;
  prompt: string;
  options: { id: string; label: string }[];
  /** Revealed only once the student has answered. */
  explanation: string | null;
  correctOptionId: string | null;
  selectedOptionId: string | null;
  isCorrect: boolean | null;
}

/**
 * The student's latest diagnostic score in one area.
 *
 * This is the baseline a check is measured against, and it is deliberately the
 * *diagnostic*, never a previous check: comparing a check to a check would let
 * a lucky run become the new floor.
 */
export async function latestDiagnosticPercent(
  tx: Db,
  userId: string,
  skillAreaId: string,
): Promise<number | null> {
  const [row] = await tx
    .select({ percent: attemptSkillScores.percent })
    .from(attemptSkillScores)
    .innerJoin(attempts, eq(attempts.id, attemptSkillScores.attemptId))
    .where(
      and(
        eq(attempts.userId, userId),
        eq(attempts.status, "submitted"),
        eq(attemptSkillScores.skillAreaId, skillAreaId),
      ),
    )
    .orderBy(desc(attempts.submittedAt))
    .limit(1);
  return row ? Number(row.percent) : null;
}

/**
 * Starts a practice run, or resumes an unfinished one.
 *
 * Draws only from the practice pool. That is the whole design: practice shows
 * the answer and an explanation, so a diagnostic item appearing here would
 * hand the student the key to their own assessment.
 */
export async function startPractice(
  tx: Db,
  user: SessionUser,
  skillAreaId: string,
): Promise<string> {
  const [existing] = await tx
    .select({ id: practiceSessions.id })
    .from(practiceSessions)
    .where(
      and(
        eq(practiceSessions.userId, user.userId),
        eq(practiceSessions.skillAreaId, skillAreaId),
        sql`${practiceSessions.completedAt} IS NULL`,
      ),
    )
    .orderBy(desc(practiceSessions.startedAt))
    .limit(1);
  if (existing) return existing.id;

  const pool = await tx
    .select({ id: questions.id })
    .from(questions)
    .where(
      and(
        eq(questions.skillAreaId, skillAreaId),
        eq(questions.pool, "practice"),
        eq(questions.isActive, true),
      ),
    );
  if (pool.length === 0) {
    throw new PracticeError(
      "There is no practice set for this area yet. The curated resources on your report are the next best thing.",
    );
  }

  const [session] = await tx
    .insert(practiceSessions)
    .values({ tenantId: user.tenantId, userId: user.userId, skillAreaId })
    .returning({ id: practiceSessions.id });

  const rand = seededRandom(session.id);
  const chosen = shuffle(pool, rand).slice(0, PRACTICE_LENGTH);

  await tx.insert(practiceResponses).values(
    chosen.map((q, index) => ({
      tenantId: user.tenantId,
      sessionId: session.id,
      questionId: q.id,
      position: index + 1,
    })),
  );
  await tx
    .update(practiceSessions)
    .set({ totalCount: chosen.length })
    .where(eq(practiceSessions.id, session.id));

  return session.id;
}

/**
 * Loads a practice run for display.
 *
 * The correct answer and explanation are attached only to items the student
 * has already answered — an unanswered item must not carry its own key in the
 * page source.
 */
export async function loadPractice(
  tx: Db,
  sessionId: string,
): Promise<{ skillAreaName: string; items: PracticeItem[] } | null> {
  const [session] = await tx
    .select({
      id: practiceSessions.id,
      skillAreaName: skillAreas.name,
    })
    .from(practiceSessions)
    .innerJoin(skillAreas, eq(skillAreas.id, practiceSessions.skillAreaId))
    .where(eq(practiceSessions.id, sessionId));
  if (!session) return null;

  const rows = await tx
    .select({
      responseId: practiceResponses.id,
      position: practiceResponses.position,
      questionId: questions.id,
      prompt: questions.prompt,
      explanation: questions.explanation,
      selectedOptionId: practiceResponses.selectedOptionId,
      isCorrect: practiceResponses.isCorrect,
    })
    .from(practiceResponses)
    .innerJoin(questions, eq(questions.id, practiceResponses.questionId))
    .where(eq(practiceResponses.sessionId, sessionId))
    .orderBy(asc(practiceResponses.position));

  const optionRows = rows.length
    ? await tx
        .select({
          id: questionOptions.id,
          questionId: questionOptions.questionId,
          label: questionOptions.label,
          isCorrect: questionOptions.isCorrect,
        })
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, rows.map((r) => r.questionId)))
        .orderBy(asc(questionOptions.displayOrder))
    : [];

  const items: PracticeItem[] = rows.map((row) => {
    const options = optionRows.filter((o) => o.questionId === row.questionId);
    const answered = row.selectedOptionId !== null;
    return {
      responseId: row.responseId,
      position: row.position,
      prompt: row.prompt,
      options: options.map((o) => ({ id: o.id, label: o.label })),
      // Withheld until answered: an unanswered item must not ship its key.
      explanation: answered ? row.explanation : null,
      correctOptionId: answered
        ? (options.find((o) => o.isCorrect)?.id ?? null)
        : null,
      selectedOptionId: row.selectedOptionId,
      isCorrect: row.isCorrect,
    };
  });

  return { skillAreaName: session.skillAreaName, items };
}

/* -------------------------------------------------------------------------
 * Skill checks
 * ---------------------------------------------------------------------- */

export interface CheckItem {
  checkQuestionId: string;
  position: number;
  prompt: string;
  options: { id: string; label: string }[];
  selectedOptionId: string | null;
}

/**
 * Starts a check, or resumes an unfinished one.
 *
 * Draws from the *diagnostic* pool — a check has to measure the same thing the
 * diagnostic measured, or the comparison it reports would be meaningless. It
 * prefers items the student has not already seen in an attempt, so a check is
 * not simply a re-run of questions they have answered before.
 */
export async function startCheck(
  tx: Db,
  user: SessionUser,
  skillAreaId: string,
): Promise<string> {
  const [existing] = await tx
    .select({ id: skillChecks.id })
    .from(skillChecks)
    .where(
      and(
        eq(skillChecks.userId, user.userId),
        eq(skillChecks.skillAreaId, skillAreaId),
        sql`${skillChecks.completedAt} IS NULL`,
      ),
    )
    .orderBy(desc(skillChecks.startedAt))
    .limit(1);
  if (existing) return existing.id;

  const [last] = await tx
    .select({ completedAt: skillChecks.completedAt })
    .from(skillChecks)
    .where(
      and(
        eq(skillChecks.userId, user.userId),
        eq(skillChecks.skillAreaId, skillAreaId),
        sql`${skillChecks.completedAt} IS NOT NULL`,
      ),
    )
    .orderBy(desc(skillChecks.completedAt))
    .limit(1);

  const seen = await tx
    .select({ questionId: attemptQuestions.questionId })
    .from(attemptQuestions)
    .innerJoin(attempts, eq(attempts.id, attemptQuestions.attemptId))
    .where(eq(attempts.userId, user.userId));
  const seenIds = seen.map((s) => s.questionId);

  const base = and(
    eq(questions.skillAreaId, skillAreaId),
    eq(questions.pool, "diagnostic"),
    eq(questions.type, "mcq"),
    eq(questions.isActive, true),
  );

  const unseen = await tx
    .select({ id: questions.id })
    .from(questions)
    .where(seenIds.length ? and(base, notInArray(questions.id, seenIds)) : base);

  const all = await tx.select({ id: questions.id }).from(questions).where(base);

  const gate = canStartCheck({
    availableQuestions: all.length,
    lastCheckAt: last?.completedAt ?? null,
  });
  if (!gate.allowed) throw new PracticeError(gate.reason);

  const baseline = await latestDiagnosticPercent(tx, user.userId, skillAreaId);

  const [check] = await tx
    .insert(skillChecks)
    .values({
      tenantId: user.tenantId,
      userId: user.userId,
      skillAreaId,
      baselinePercent: baseline === null ? null : String(baseline),
    })
    .returning({ id: skillChecks.id });

  const rand = seededRandom(check.id);
  // Unseen items first, topped up from the rest only if there are too few.
  const preferred = shuffle(unseen, rand);
  const filler = shuffle(
    all.filter((q) => !preferred.some((p) => p.id === q.id)),
    rand,
  );
  const chosen = [...preferred, ...filler].slice(0, TARGET_CHECK_LENGTH);

  await tx.insert(skillCheckQuestions).values(
    chosen.map((q, index) => ({
      tenantId: user.tenantId,
      checkId: check.id,
      questionId: q.id,
      position: index + 1,
    })),
  );
  await tx
    .update(skillChecks)
    .set({ totalCount: chosen.length })
    .where(eq(skillChecks.id, check.id));

  return check.id;
}

export async function loadCheck(
  tx: Db,
  checkId: string,
): Promise<{ skillAreaName: string; items: CheckItem[]; completed: boolean } | null> {
  const [check] = await tx
    .select({
      id: skillChecks.id,
      completedAt: skillChecks.completedAt,
      skillAreaName: skillAreas.name,
    })
    .from(skillChecks)
    .innerJoin(skillAreas, eq(skillAreas.id, skillChecks.skillAreaId))
    .where(eq(skillChecks.id, checkId));
  if (!check) return null;

  const rows = await tx
    .select({
      checkQuestionId: skillCheckQuestions.id,
      position: skillCheckQuestions.position,
      questionId: questions.id,
      prompt: questions.prompt,
      selectedOptionId: skillCheckQuestions.selectedOptionId,
    })
    .from(skillCheckQuestions)
    .innerJoin(questions, eq(questions.id, skillCheckQuestions.questionId))
    .where(eq(skillCheckQuestions.checkId, checkId))
    .orderBy(asc(skillCheckQuestions.position));

  const optionRows = rows.length
    ? await tx
        .select({
          id: questionOptions.id,
          questionId: questionOptions.questionId,
          label: questionOptions.label,
        })
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, rows.map((r) => r.questionId)))
        .orderBy(asc(questionOptions.displayOrder))
    : [];

  return {
    skillAreaName: check.skillAreaName,
    completed: check.completedAt !== null,
    items: rows.map((row) => ({
      checkQuestionId: row.checkQuestionId,
      position: row.position,
      prompt: row.prompt,
      // No correctness anywhere: a check is scored, so the page must never
      // carry the key, before or after answering.
      options: optionRows
        .filter((o) => o.questionId === row.questionId)
        .map((o) => ({ id: o.id, label: o.label })),
      selectedOptionId: row.selectedOptionId,
    })),
  };
}
