import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  answers,
  attemptQuestions,
  attempts,
  benchmarkSets,
  questionOptions,
  questions,
  questionTracks,
  trackBlueprintItems,
  tracks,
} from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/types";
import { drawSpreadByDifficulty, seededRandom, shuffle } from "./random";

export interface PaperOption {
  id: string;
  label: string;
}

/** Exactly what the browser is allowed to see for one question mid-attempt. */
export interface PaperQuestion {
  attemptQuestionId: string;
  position: number;
  type: "mcq" | "short" | "code";
  prompt: string;
  skillArea: string;
  points: number;
  options: PaperOption[];
  starterCode: string | null;
  languageId: number | null;
  savedOptionId: string | null;
  savedText: string | null;
}

export class AssessmentError extends Error {}

/**
 * Create an attempt: pick the questions, freeze their order, and set a
 * server-side deadline.
 *
 * The whole paper is materialised into `attempt_questions` up front rather
 * than drawn lazily, so a student who reloads cannot reshuffle into an easier
 * set, and so a support ticket can reconstruct precisely what was asked.
 */
export async function startAttempt(
  tx: Db,
  user: SessionUser,
  trackId: string,
): Promise<string> {
  const [track] = await tx
    .select()
    .from(tracks)
    .where(and(eq(tracks.id, trackId), eq(tracks.isActive, true)));
  if (!track) throw new AssessmentError("That assessment track is not available.");

  const existing = await tx
    .select({ id: attempts.id })
    .from(attempts)
    .where(
      and(
        eq(attempts.userId, user.userId),
        eq(attempts.trackId, trackId),
        eq(attempts.status, "in_progress"),
        sql`${attempts.expiresAt} > now()`,
      ),
    );
  if (existing.length > 0) return existing[0].id;

  const blueprint = await tx
    .select()
    .from(trackBlueprintItems)
    .where(eq(trackBlueprintItems.trackId, trackId))
    .orderBy(asc(trackBlueprintItems.displayOrder));
  if (blueprint.length === 0) {
    throw new AssessmentError("This track has no question blueprint configured.");
  }

  const [activeBenchmark] = await tx
    .select({ id: benchmarkSets.id })
    .from(benchmarkSets)
    .where(and(eq(benchmarkSets.trackId, trackId), eq(benchmarkSets.isActive, true)))
    .orderBy(sql`${benchmarkSets.version} DESC`)
    .limit(1);

  const expiresAt = new Date(Date.now() + track.durationSeconds * 1000);
  const [attempt] = await tx
    .insert(attempts)
    .values({
      tenantId: user.tenantId,
      userId: user.userId,
      trackId,
      benchmarkSetId: activeBenchmark?.id ?? null,
      durationSeconds: track.durationSeconds,
      expiresAt,
    })
    .returning({ id: attempts.id });

  // Seeded from the attempt id: different every attempt, reproducible later.
  const rand = seededRandom(attempt.id);

  const pool = await tx
    .select({
      id: questions.id,
      skillAreaId: questions.skillAreaId,
      difficulty: questions.difficulty,
      points: questions.points,
      type: questions.type,
    })
    .from(questions)
    .innerJoin(questionTracks, eq(questionTracks.questionId, questions.id))
    .where(and(eq(questionTracks.trackId, trackId), eq(questions.isActive, true)));

  const selected: typeof pool = [];
  for (const item of blueprint) {
    const areaPool = pool.filter((q) => q.skillAreaId === item.skillAreaId);
    if (areaPool.length === 0) continue;
    selected.push(...drawSpreadByDifficulty(areaPool, item.questionCount, rand));
  }
  if (selected.length === 0) {
    throw new AssessmentError("No questions are available for this track yet.");
  }

  // Interleave skill areas so the paper does not run as labelled blocks.
  const ordered = shuffle(selected, rand);

  const mcqIds = ordered.filter((q) => q.type === "mcq").map((q) => q.id);
  const optionRows = mcqIds.length
    ? await tx
        .select({ id: questionOptions.id, questionId: questionOptions.questionId })
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, mcqIds))
        .orderBy(asc(questionOptions.displayOrder))
    : [];

  const optionsByQuestion = new Map<string, string[]>();
  for (const row of optionRows) {
    const list = optionsByQuestion.get(row.questionId) ?? [];
    list.push(row.id);
    optionsByQuestion.set(row.questionId, list);
  }

  await tx.insert(attemptQuestions).values(
    ordered.map((q, index) => ({
      tenantId: user.tenantId,
      attemptId: attempt.id,
      questionId: q.id,
      skillAreaId: q.skillAreaId,
      position: index + 1,
      pointsPossible: q.points,
      // Option order is randomised per attempt too, so answer keys shared
      // between students ("it's the third one") do not transfer.
      optionOrder: optionsByQuestion.has(q.id)
        ? shuffle(optionsByQuestion.get(q.id)!, rand)
        : null,
    })),
  );

  return attempt.id;
}

/**
 * Load an in-progress attempt in the shape the browser may see.
 *
 * `question_options.is_correct`, `questions.explanation` and every test case
 * are deliberately absent from the selection below — the answer key never
 * leaves the server during an attempt.
 */
export async function loadPaper(
  tx: Db,
  attemptId: string,
): Promise<PaperQuestion[]> {
  const rows = await tx
    .select({
      attemptQuestionId: attemptQuestions.id,
      position: attemptQuestions.position,
      points: attemptQuestions.pointsPossible,
      optionOrder: attemptQuestions.optionOrder,
      questionId: questions.id,
      type: questions.type,
      prompt: questions.prompt,
      starterCode: questions.starterCode,
      languageId: questions.languageId,
      skillArea: sql<string>`(
        SELECT name FROM skill_areas WHERE id = ${attemptQuestions.skillAreaId}
      )`,
      savedOptionId: answers.selectedOptionId,
      savedText: answers.responseText,
    })
    .from(attemptQuestions)
    .innerJoin(questions, eq(questions.id, attemptQuestions.questionId))
    .leftJoin(answers, eq(answers.attemptQuestionId, attemptQuestions.id))
    .where(eq(attemptQuestions.attemptId, attemptId))
    .orderBy(asc(attemptQuestions.position));

  const mcqIds = rows.filter((r) => r.type === "mcq").map((r) => r.questionId);
  const optionRows = mcqIds.length
    ? await tx
        .select({
          id: questionOptions.id,
          questionId: questionOptions.questionId,
          label: questionOptions.label,
        })
        .from(questionOptions)
        .where(inArray(questionOptions.questionId, mcqIds))
    : [];

  const optionById = new Map(optionRows.map((o) => [o.id, o]));

  return rows.map((row) => {
    const order = row.optionOrder ?? [];
    const options = order
      .map((id) => optionById.get(id))
      .filter((o): o is (typeof optionRows)[number] => Boolean(o))
      .map((o) => ({ id: o.id, label: o.label }));

    return {
      attemptQuestionId: row.attemptQuestionId,
      position: row.position,
      type: row.type,
      prompt: row.prompt,
      skillArea: row.skillArea,
      points: row.points,
      options,
      starterCode: row.starterCode,
      languageId: row.languageId,
      savedOptionId: row.savedOptionId,
      savedText: row.savedText,
    };
  });
}
