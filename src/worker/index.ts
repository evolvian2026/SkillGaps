import { Worker, type Job } from "bullmq";
import { QUEUE_NAME, type JobPayload } from "@/lib/queue/types";
import { createRedisConnection } from "@/lib/queue";
import { evaluateInterview } from "./jobs/evaluate-interview";
import {
  extractJdKeywordsJob,
  matchResumeJob,
  parseResumeJob,
  purgeExpiredResumes,
} from "./jobs/documents";
import { recomputeReadiness } from "./jobs/readiness";

/**
 * Background worker.
 *
 * Run alongside the web app with `npm run worker`. Resume parsing, keyword
 * extraction, model-based evaluation and readiness recomputation all run here
 * rather than in request handlers — they are too slow and too failure-prone for
 * the request cycle.
 *
 * The worker connects as the same RLS-bound database role as the web app; see
 * `context.ts` for how each job takes on the identity of the student it serves.
 */

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 4);
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function handle(job: Job<JobPayload>): Promise<void> {
  const payload = job.data;
  switch (payload.name) {
    case "evaluate-interview":
      return evaluateInterview(payload);
    case "parse-resume":
      return parseResumeJob(payload);
    case "extract-jd-keywords":
      return extractJdKeywordsJob(payload);
    case "match-resume":
      return matchResumeJob(payload);
    case "recompute-readiness":
      return recomputeReadiness(payload);
    case "purge-expired-resumes":
      await purgeExpiredResumes();
      return;
    default: {
      // Exhaustiveness check: adding a job name without a handler is a
      // compile error rather than a silent no-op in production.
      const unreachable: never = payload;
      throw new Error(`Unhandled job: ${JSON.stringify(unreachable)}`);
    }
  }
}

// A dedicated connection: the shared one is used by `enqueue`, and jobs that
// queue follow-up work (a readiness recompute, say) must not have their
// `add()` swallowed by this worker's blocking reads.
const worker = new Worker<JobPayload>(QUEUE_NAME, handle, {
  connection: createRedisConnection(),
  concurrency: CONCURRENCY,
});

worker.on("completed", (job) => {
  console.log(`[worker] ${job.name} ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  // Attempt counts matter here: the last failure is the one that gave up.
  console.error(
    `[worker] ${job?.name} ${job?.id} failed (attempt ${job?.attemptsMade}):`,
    err.message,
  );
});

console.log(`[worker] listening on "${QUEUE_NAME}" with concurrency ${CONCURRENCY}`);

// The retention sweep is time-based rather than event-driven, so the worker
// runs it on an interval. Runs once at startup so a fresh deploy does not wait
// six hours before honouring a retention window that has already passed.
void purgeExpiredResumes().catch((err) =>
  console.error("[worker] initial purge failed:", err),
);
const purgeTimer = setInterval(() => {
  void purgeExpiredResumes().catch((err) =>
    console.error("[worker] scheduled purge failed:", err),
  );
}, PURGE_INTERVAL_MS);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, finishing in-flight jobs…`);
  clearInterval(purgeTimer);
  await worker.close();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
