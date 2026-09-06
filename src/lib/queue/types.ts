/**
 * Job payloads.
 *
 * Every job carries `userId` rather than a tenant id: the worker resolves the
 * tenant and role from that user via `app.job_context()` and then runs under
 * the same RLS context the student's own request would have. A job therefore
 * cannot reach data the student could not reach, and the worker never needs
 * BYPASSRLS.
 */

export const QUEUE_NAME = "skillgaps";

export type JobName =
  | "evaluate-interview"
  | "parse-resume"
  | "extract-jd-keywords"
  | "match-resume"
  | "recompute-readiness"
  | "purge-expired-resumes";

export interface EvaluateInterviewJob {
  name: "evaluate-interview";
  userId: string;
  sessionId: string;
}

export interface ParseResumeJob {
  name: "parse-resume";
  userId: string;
  resumeId: string;
}

export interface ExtractJdKeywordsJob {
  name: "extract-jd-keywords";
  userId: string;
  jobDescriptionId: string;
}

export interface MatchResumeJob {
  name: "match-resume";
  userId: string;
  matchId: string;
}

export interface RecomputeReadinessJob {
  name: "recompute-readiness";
  userId: string;
}

/** Retention sweep. Runs for the whole system, so it carries no user. */
export interface PurgeExpiredResumesJob {
  name: "purge-expired-resumes";
}

export type JobPayload =
  | EvaluateInterviewJob
  | ParseResumeJob
  | ExtractJdKeywordsJob
  | MatchResumeJob
  | RecomputeReadinessJob
  | PurgeExpiredResumesJob;
