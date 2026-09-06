import "server-only";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAME, type JobPayload } from "./types";

export * from "./types";

declare global {
  var __skillgapsQueue: Queue | undefined;
  var __skillgapsRedis: IORedis | undefined;
}

function redisUrl(): string {
  return process.env.REDIS_URL ?? "redis://127.0.0.1:6379";
}

/**
 * A brand-new Redis client.
 *
 * The Worker must not share a connection with the Queue. BullMQ puts a
 * worker's connection into blocking mode to wait for jobs, and a `Queue.add()`
 * issued on that same client resolves without the job ever reaching Redis —
 * a silent failure that looks like the job simply never ran.
 */
export function createRedisConnection(): IORedis {
  return new IORedis(redisUrl(), {
    // BullMQ requires this; blocking commands must never time out mid-wait.
    maxRetriesPerRequest: null,
  });
}

/** The shared client used for producing jobs. Never hand this to a Worker. */
export function redisConnection(): IORedis {
  if (!globalThis.__skillgapsRedis) {
    globalThis.__skillgapsRedis = createRedisConnection();
  }
  return globalThis.__skillgapsRedis;
}

export function queue(): Queue {
  if (!globalThis.__skillgapsQueue) {
    globalThis.__skillgapsQueue = new Queue(QUEUE_NAME, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        // Keep a short tail of finished jobs for debugging without letting
        // Redis grow without bound.
        removeOnComplete: { age: 3600, count: 200 },
        removeOnFail: { age: 86_400 },
      },
    });
  }
  return globalThis.__skillgapsQueue;
}

/**
 * Enqueue work. Nothing slow or failure-prone belongs in a request handler —
 * resume parsing, keyword extraction and model-based evaluation all go here.
 *
 * Enqueueing is deliberately non-fatal: if Redis is down, the user's action
 * still succeeds and the record stays `pending` rather than the whole request
 * failing. The caller surfaces that state in the UI.
 */
/**
 * Builds a deduplication job id.
 *
 * BullMQ rejects `:` in custom job ids, so the separator is `-`. Centralised
 * here because a bad id makes `enqueue` fail silently — the user's action
 * still succeeds and the record simply never leaves `pending`, which is a
 * hard failure mode to spot.
 */
export function dedupeKey(...parts: (string | number)[]): string {
  return parts
    .map((part) => String(part).replace(/[^A-Za-z0-9_-]/g, "-"))
    .join("-");
}

export async function enqueue(
  payload: JobPayload,
  options?: { jobId?: string; delayMs?: number },
): Promise<boolean> {
  try {
    await queue().add(payload.name, payload, {
      jobId: options?.jobId,
      delay: options?.delayMs,
    });
    return true;
  } catch (err) {
    console.error("[queue] enqueue failed", payload.name, err);
    if (process.env.NODE_ENV !== "production") throw err;
    return false;
  }
}
