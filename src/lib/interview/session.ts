import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db/client";
import {
  interviewQuestions,
  interviewQuestionTracks,
  interviewResponses,
  interviewSessions,
  skillAreas,
  tracks,
} from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth/types";
import { seededRandom, shuffle } from "@/lib/assessment/random";

/**
 * Mock interview sessions.
 *
 * Reuses the diagnostic engine's seeded shuffle so a session is randomised but
 * reproducible from its id, and reuses the same `tracks` and `skill_areas`
 * rather than introducing a second taxonomy.
 */

/** A realistic screen: a warm-up, technical depth, and a judgement question. */
const BLUEPRINT = [
  { kind: "behavioral" as const, count: 2 },
  { kind: "technical" as const, count: 3 },
  { kind: "situational" as const, count: 1 },
];

export interface InterviewQuestionView {
  responseId: string;
  position: number;
  kind: "behavioral" | "technical" | "situational";
  prompt: string;
  skillArea: string | null;
  suggestedTimeSeconds: number;
  savedText: string | null;
}

export class InterviewError extends Error {}

export async function startInterview(
  tx: Db,
  user: SessionUser,
  trackId: string,
): Promise<string> {
  const [track] = await tx
    .select()
    .from(tracks)
    .where(and(eq(tracks.id, trackId), eq(tracks.isActive, true)));
  if (!track) throw new InterviewError("That interview track is not available.");

  const [existing] = await tx
    .select({ id: interviewSessions.id })
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.userId, user.userId),
        eq(interviewSessions.trackId, trackId),
        eq(interviewSessions.status, "in_progress"),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const [session] = await tx
    .insert(interviewSessions)
    .values({ tenantId: user.tenantId, userId: user.userId, trackId })
    .returning({ id: interviewSessions.id });

  const pool = await tx
    .select({
      id: interviewQuestions.id,
      kind: interviewQuestions.kind,
      difficulty: interviewQuestions.difficulty,
    })
    .from(interviewQuestions)
    .innerJoin(
      interviewQuestionTracks,
      eq(interviewQuestionTracks.questionId, interviewQuestions.id),
    )
    .where(
      and(
        eq(interviewQuestionTracks.trackId, trackId),
        eq(interviewQuestions.isActive, true),
      ),
    );

  if (pool.length === 0) {
    throw new InterviewError("No interview questions are available for this track yet.");
  }

  const rand = seededRandom(session.id);
  const picked: typeof pool = [];
  for (const slot of BLUEPRINT) {
    const candidates = pool.filter((q) => q.kind === slot.kind);
    picked.push(...shuffle(candidates, rand).slice(0, slot.count));
  }
  if (picked.length === 0) picked.push(...shuffle(pool, rand).slice(0, 4));

  // Behavioural first, then technical, then situational — a real interview
  // warms up before it digs in, and so should the practice.
  const order = { behavioral: 0, technical: 1, situational: 2 };
  picked.sort((a, b) => order[a.kind] - order[b.kind]);

  await tx.insert(interviewResponses).values(
    picked.map((q, index) => ({
      tenantId: user.tenantId,
      sessionId: session.id,
      questionId: q.id,
      position: index + 1,
    })),
  );

  return session.id;
}

/**
 * Loads the session for the student.
 *
 * `guidance` and `rubric_criteria` are excluded: showing a student what a
 * strong answer contains before they answer would make the exercise
 * worthless. Both appear on the report afterwards.
 */
export async function loadInterview(
  tx: Db,
  sessionId: string,
): Promise<InterviewQuestionView[]> {
  const rows = await tx
    .select({
      responseId: interviewResponses.id,
      position: interviewResponses.position,
      savedText: interviewResponses.responseText,
      kind: interviewQuestions.kind,
      prompt: interviewQuestions.prompt,
      suggestedTimeSeconds: interviewQuestions.suggestedTimeSeconds,
      skillArea: skillAreas.name,
    })
    .from(interviewResponses)
    .innerJoin(
      interviewQuestions,
      eq(interviewQuestions.id, interviewResponses.questionId),
    )
    .leftJoin(skillAreas, eq(skillAreas.id, interviewQuestions.skillAreaId))
    .where(eq(interviewResponses.sessionId, sessionId))
    .orderBy(asc(interviewResponses.position));

  return rows.map((row) => ({ ...row, skillArea: row.skillArea ?? null }));
}

export interface InterviewFeedback {
  sessionId: string;
  trackName: string;
  status: string;
  overallScore: number | null;
  evaluationMethod: string | null;
  summaryFeedback: string | null;
  submittedAt: Date | null;
  evaluatedAt: Date | null;
  responses: {
    position: number;
    prompt: string;
    kind: string;
    skillArea: string | null;
    responseText: string | null;
    score: number | null;
    evaluationStatus: string;
    criterionScores: {
      key: string;
      score: number;
      comment: string;
      assessed?: boolean;
    }[];
    strengths: string[];
    improvements: string[];
    guidance: string | null;
  }[];
}

export async function loadInterviewFeedback(
  tx: Db,
  sessionId: string,
): Promise<InterviewFeedback | null> {
  const [session] = await tx
    .select({
      id: interviewSessions.id,
      status: interviewSessions.status,
      overallScore: interviewSessions.overallScore,
      evaluationMethod: interviewSessions.evaluationMethod,
      summaryFeedback: interviewSessions.summaryFeedback,
      submittedAt: interviewSessions.submittedAt,
      evaluatedAt: interviewSessions.evaluatedAt,
      trackName: tracks.name,
    })
    .from(interviewSessions)
    .innerJoin(tracks, eq(tracks.id, interviewSessions.trackId))
    .where(eq(interviewSessions.id, sessionId));

  if (!session) return null;

  const rows = await tx
    .select({
      position: interviewResponses.position,
      responseText: interviewResponses.responseText,
      score: interviewResponses.score,
      evaluationStatus: interviewResponses.evaluationStatus,
      criterionScores: interviewResponses.criterionScores,
      strengths: interviewResponses.strengths,
      improvements: interviewResponses.improvements,
      prompt: interviewQuestions.prompt,
      kind: interviewQuestions.kind,
      guidance: interviewQuestions.guidance,
      skillArea: skillAreas.name,
    })
    .from(interviewResponses)
    .innerJoin(
      interviewQuestions,
      eq(interviewQuestions.id, interviewResponses.questionId),
    )
    .leftJoin(skillAreas, eq(skillAreas.id, interviewQuestions.skillAreaId))
    .where(eq(interviewResponses.sessionId, sessionId))
    .orderBy(asc(interviewResponses.position));

  return {
    sessionId: session.id,
    trackName: session.trackName,
    status: session.status,
    overallScore: session.overallScore === null ? null : Number(session.overallScore),
    evaluationMethod: session.evaluationMethod,
    summaryFeedback: session.summaryFeedback,
    submittedAt: session.submittedAt,
    evaluatedAt: session.evaluatedAt,
    responses: rows.map((row) => ({
      position: row.position,
      prompt: row.prompt,
      kind: row.kind,
      skillArea: row.skillArea ?? null,
      responseText: row.responseText,
      score: row.score === null ? null : Number(row.score),
      evaluationStatus: row.evaluationStatus,
      criterionScores: (row.criterionScores ?? []) as {
        key: string;
        score: number;
        comment: string;
        assessed?: boolean;
      }[],
      strengths: row.strengths ?? [],
      improvements: row.improvements ?? [],
      guidance: row.guidance,
    })),
  };
}

/** Past sessions for the student's history list. */
export async function listInterviews(tx: Db, userId: string) {
  return tx
    .select({
      id: interviewSessions.id,
      status: interviewSessions.status,
      overallScore: interviewSessions.overallScore,
      startedAt: interviewSessions.startedAt,
      evaluatedAt: interviewSessions.evaluatedAt,
      trackName: tracks.name,
      answered: sql<number>`(
        SELECT COUNT(*)::int FROM interview_responses r
        WHERE r.session_id = ${interviewSessions.id}
          AND r.response_text IS NOT NULL AND r.response_text <> ''
      )`,
      total: sql<number>`(
        SELECT COUNT(*)::int FROM interview_responses r
        WHERE r.session_id = ${interviewSessions.id}
      )`,
    })
    .from(interviewSessions)
    .innerJoin(tracks, eq(tracks.id, interviewSessions.trackId))
    .where(eq(interviewSessions.userId, userId))
    .orderBy(desc(interviewSessions.startedAt))
    .limit(20);
}
