import { eq, sql } from "drizzle-orm";
import { rawDb } from "@/lib/db/client";
import { jobDescriptions, resumeMatches, resumes } from "@/lib/db/schema";
import {
  extractJdKeywords,
  parseResume,
  ParserRejectedError,
  type ExtractedSkill,
} from "@/lib/matching/parser-client";
import { matchResumeToJd } from "@/lib/matching/match";
import { deleteObject, getObject } from "@/lib/storage";
import type {
  ExtractJdKeywordsJob,
  MatchResumeJob,
  ParseResumeJob,
} from "@/lib/queue/types";
import { withJobContext } from "../context";
import { recomputeFor } from "./readiness";

/** Downloads the stored file and extracts text and skills via the parser service. */
export async function parseResumeJob(job: ParseResumeJob): Promise<void> {
  await withJobContext(job.userId, async (tx) => {
    const [resume] = await tx
      .select()
      .from(resumes)
      .where(eq(resumes.id, job.resumeId));
    if (!resume) throw new Error(`Resume ${job.resumeId} not found`);
    if (resume.status === "parsed") return;
    if (resume.purgedAt) return; // retention already removed it

    await tx
      .update(resumes)
      .set({ status: "parsing" })
      .where(eq(resumes.id, job.resumeId));

    try {
      const data = await getObject(resume.storageKey);
      const parsed = await parseResume({
        fileName: resume.fileName,
        contentType: resume.contentType,
        data,
      });

      await tx
        .update(resumes)
        .set({
          status: "parsed",
          extractedText: parsed.text,
          extractedSkills: parsed.skills as never,
          parseError: null,
        })
        .where(eq(resumes.id, job.resumeId));
    } catch (err) {
      // A scan or a corrupt file is the student's input being unusable and
      // will never succeed on retry, so it is recorded and not re-thrown.
      // Anything else is our problem: re-throw so BullMQ retries it.
      if (err instanceof ParserRejectedError) {
        await tx
          .update(resumes)
          .set({ status: "failed", parseError: err.message })
          .where(eq(resumes.id, job.resumeId));
        return;
      }
      await tx
        .update(resumes)
        .set({ status: "failed", parseError: "Parsing service unavailable." })
        .where(eq(resumes.id, job.resumeId));
      throw err;
    }
  });
}

export async function extractJdKeywordsJob(
  job: ExtractJdKeywordsJob,
): Promise<void> {
  await withJobContext(job.userId, async (tx) => {
    const [jd] = await tx
      .select()
      .from(jobDescriptions)
      .where(eq(jobDescriptions.id, job.jobDescriptionId));
    if (!jd) throw new Error(`Job description ${job.jobDescriptionId} not found`);
    if (jd.status === "parsed") return;

    try {
      const result = await extractJdKeywords(jd.rawText);
      await tx
        .update(jobDescriptions)
        .set({ status: "parsed", extractedKeywords: result.skills as never })
        .where(eq(jobDescriptions.id, jd.id));
    } catch (err) {
      await tx
        .update(jobDescriptions)
        .set({ status: "failed" })
        .where(eq(jobDescriptions.id, jd.id));
      if (err instanceof ParserRejectedError) return;
      throw err;
    }
  });
}

/**
 * Computes a match once both sides are parsed.
 *
 * If either side is still parsing the job re-throws, so BullMQ's backoff
 * retries it shortly — simpler and more robust than chaining job completion
 * events, given both parses are already queued.
 */
export async function matchResumeJob(job: MatchResumeJob): Promise<void> {
  await withJobContext(job.userId, async (tx, ctx) => {
    const [match] = await tx
      .select()
      .from(resumeMatches)
      .where(eq(resumeMatches.id, job.matchId));
    if (!match) throw new Error(`Match ${job.matchId} not found`);
    if (match.status === "succeeded") return;

    const [resume] = await tx
      .select()
      .from(resumes)
      .where(eq(resumes.id, match.resumeId));
    const [jd] = await tx
      .select()
      .from(jobDescriptions)
      .where(eq(jobDescriptions.id, match.jobDescriptionId));

    if (!resume || !jd) throw new Error("Match is missing its resume or JD");

    const failed =
      resume.status === "failed"
        ? "The resume could not be read."
        : jd.status === "failed"
          ? "The job description could not be analysed."
          : null;

    if (failed) {
      await tx
        .update(resumeMatches)
        .set({ status: "failed", errorMessage: failed, completedAt: new Date() })
        .where(eq(resumeMatches.id, match.id));
      return;
    }

    if (resume.status !== "parsed" || jd.status !== "parsed") {
      await tx
        .update(resumeMatches)
        .set({ status: "running" })
        .where(eq(resumeMatches.id, match.id));
      throw new Error("Waiting for parsing to finish");
    }

    const result = matchResumeToJd(
      (resume.extractedSkills ?? []) as ExtractedSkill[],
      (jd.extractedKeywords ?? []) as ExtractedSkill[],
    );

    await tx
      .update(resumeMatches)
      .set({
        status: "succeeded",
        matchScore: String(result.score),
        matchedKeywords: {
          matched: result.matched,
          requiredCoverage: result.requiredCoverage,
          extras: result.extras,
        } as never,
        missingKeywords: result.missing as never,
        errorMessage: null,
        completedAt: new Date(),
      })
      .where(eq(resumeMatches.id, match.id));

    // The best match score feeds readiness; recomputed inline for the same
    // reason as the interview evaluation.
    await recomputeFor(tx, ctx.tenantId, ctx.userId);
  });
}

/**
 * Retention sweep: deletes stored resume files and their extracted text once
 * the retention window has passed.
 *
 * DPDP data minimisation — a resume is personal data with no reason to sit in
 * a bucket forever. Runs system-wide rather than per-student, so it uses the
 * unscoped handle; it touches only the retention columns and never reads
 * student content.
 */
export async function purgeExpiredResumes(): Promise<number> {
  const db = rawDb();

  const found = await db.execute(sql`SELECT * FROM app.expired_resumes(500)`);
  const expired = found.rows as { id: string; storage_key: string }[];

  let purged = 0;
  for (const row of expired) {
    try {
      await deleteObject(row.storage_key);
    } catch (err) {
      // A missing object is fine — the row still needs marking, or the sweep
      // retries it forever.
      console.warn(`[purge] could not delete ${row.storage_key}:`, err);
    }
    await db.execute(sql`SELECT app.mark_resume_purged(${row.id}::uuid)`);
    purged++;
  }

  if (purged > 0) console.log(`[purge] removed ${purged} expired resume(s)`);
  return purged;
}
