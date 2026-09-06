import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  answers,
  attemptQuestions,
  attempts,
  attemptSkillScores,
  benchmarkThresholds,
  integrityEvents,
  questionOptions,
  questions,
  questionTestCases,
  tracks,
} from "@/lib/db/schema";
import { runCode } from "./judge0";
import {
  aggregateBySkillArea,
  gradeCodeAnswer,
  gradeShortAnswer,
  percentOf,
  round2,
  summariseIntegrity,
  type ScoredAnswer,
} from "./scoring";

/**
 * Grade and finalise an attempt.
 *
 * Idempotent: re-submitting an already-submitted attempt returns without
 * rescoring, so a double-clicked submit button or a retried request cannot
 * produce two different scores for one paper.
 */
export async function submitAttempt(
  tx: Db,
  attemptId: string,
): Promise<{ alreadySubmitted: boolean }> {
  const [attempt] = await tx
    .select()
    .from(attempts)
    .where(eq(attempts.id, attemptId));
  if (!attempt) throw new Error("Attempt not found");
  if (attempt.status !== "in_progress") return { alreadySubmitted: true };

  const [track] = await tx
    .select({ fastRatio: tracks.fastCompletionRatio })
    .from(tracks)
    .where(eq(tracks.id, attempt.trackId));

  const rows = await tx
    .select({
      attemptQuestionId: attemptQuestions.id,
      skillAreaId: attemptQuestions.skillAreaId,
      pointsPossible: attemptQuestions.pointsPossible,
      questionId: questions.id,
      type: questions.type,
      acceptedAnswers: questions.acceptedAnswers,
      languageId: questions.languageId,
      answerId: answers.id,
      selectedOptionId: answers.selectedOptionId,
      responseText: answers.responseText,
    })
    .from(attemptQuestions)
    .innerJoin(questions, eq(questions.id, attemptQuestions.questionId))
    .leftJoin(answers, eq(answers.attemptQuestionId, attemptQuestions.id))
    .where(eq(attemptQuestions.attemptId, attemptId))
    .orderBy(asc(attemptQuestions.position));

  // One lookup for every correct option in this paper.
  const mcqQuestionIds = rows.filter((r) => r.type === "mcq").map((r) => r.questionId);
  const correctOptions = mcqQuestionIds.length
    ? await tx
        .select({ id: questionOptions.id, questionId: questionOptions.questionId })
        .from(questionOptions)
        .where(
          and(
            inArray(questionOptions.questionId, mcqQuestionIds),
            eq(questionOptions.isCorrect, true),
          ),
        )
    : [];
  const correctByQuestion = new Map(
    correctOptions.map((o) => [o.questionId, o.id]),
  );

  const codeQuestionIds = rows.filter((r) => r.type === "code").map((r) => r.questionId);
  const testCases = codeQuestionIds.length
    ? await tx
        .select()
        .from(questionTestCases)
        .where(inArray(questionTestCases.questionId, codeQuestionIds))
        .orderBy(asc(questionTestCases.displayOrder))
    : [];
  const casesByQuestion = new Map<string, typeof testCases>();
  for (const testCase of testCases) {
    const list = casesByQuestion.get(testCase.questionId) ?? [];
    list.push(testCase);
    casesByQuestion.set(testCase.questionId, list);
  }

  const scored: ScoredAnswer[] = [];

  for (const row of rows) {
    let pointsAwarded = 0;
    let isCorrect = false;
    let executionResult: unknown = null;

    if (row.type === "mcq") {
      const correctId = correctByQuestion.get(row.questionId);
      isCorrect = Boolean(
        row.selectedOptionId && correctId && row.selectedOptionId === correctId,
      );
      pointsAwarded = isCorrect ? row.pointsPossible : 0;
    } else if (row.type === "short") {
      isCorrect = gradeShortAnswer(row.responseText, row.acceptedAnswers);
      pointsAwarded = isCorrect ? row.pointsPossible : 0;
    } else if (row.type === "code" && row.responseText?.trim()) {
      const cases = casesByQuestion.get(row.questionId) ?? [];
      const result = await runCode(
        row.responseText,
        row.languageId ?? 71,
        cases.map((c) => ({
          stdin: c.stdin,
          expectedStdout: c.expectedStdout,
          isHidden: c.isHidden,
        })),
      );
      executionResult = result;
      if (result.ran) {
        pointsAwarded = gradeCodeAnswer(
          result.passedCount,
          result.totalCount,
          row.pointsPossible,
        );
        isCorrect = result.passedCount === result.totalCount && result.totalCount > 0;
      }
      // When Judge0 is unavailable the submission is stored unscored rather
      // than silently marked wrong. It shows on the report as "not graded".
    }

    scored.push({
      skillAreaId: row.skillAreaId,
      pointsAwarded,
      pointsPossible: row.pointsPossible,
    });

    const values = {
      isCorrect,
      pointsAwarded: String(pointsAwarded),
      executionResult: executionResult as never,
    };
    if (row.answerId) {
      await tx.update(answers).set(values).where(eq(answers.id, row.answerId));
    } else {
      await tx.insert(answers).values({
        tenantId: attempt.tenantId,
        attemptQuestionId: row.attemptQuestionId,
        ...values,
      });
    }
  }

  const areaScores = aggregateBySkillArea(scored);

  const bars = attempt.benchmarkSetId
    ? await tx
        .select({
          skillAreaId: benchmarkThresholds.skillAreaId,
          bar: benchmarkThresholds.hiringBarPercent,
        })
        .from(benchmarkThresholds)
        .where(eq(benchmarkThresholds.benchmarkSetId, attempt.benchmarkSetId))
    : [];
  const barByArea = new Map(bars.map((b) => [b.skillAreaId, b.bar]));

  await tx.delete(attemptSkillScores).where(eq(attemptSkillScores.attemptId, attemptId));
  if (areaScores.length > 0) {
    await tx.insert(attemptSkillScores).values(
      areaScores.map((area) => ({
        tenantId: attempt.tenantId,
        attemptId,
        skillAreaId: area.skillAreaId,
        score: String(area.score),
        maxScore: String(area.maxScore),
        percent: String(area.percent),
        // Copied in, so the report keeps showing the bar it was scored
        // against even after benchmarks are recalibrated.
        hiringBarPercent: barByArea.get(area.skillAreaId) ?? null,
      })),
    );
  }

  const total = round2(scored.reduce((sum, s) => sum + s.pointsAwarded, 0));
  const max = round2(scored.reduce((sum, s) => sum + s.pointsPossible, 0));

  const events = await tx
    .select({ type: integrityEvents.type })
    .from(integrityEvents)
    .where(eq(integrityEvents.attemptId, attemptId));

  const submittedAt = new Date();
  const elapsedSeconds = Math.max(
    0,
    Math.round((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000),
  );

  await tx
    .update(attempts)
    .set({
      status: "submitted",
      submittedAt,
      totalScore: String(total),
      maxScore: String(max),
      percent: String(percentOf(total, max)),
      integrityFlags: summariseIntegrity(
        events.map((e) => e.type),
        elapsedSeconds,
        attempt.durationSeconds,
        Number(track?.fastRatio ?? 0.25),
      ),
    })
    .where(eq(attempts.id, attemptId));

  return { alreadySubmitted: false };
}
