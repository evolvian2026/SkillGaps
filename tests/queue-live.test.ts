import { afterAll, describe, expect, it } from "vitest";
import { enqueue, queue, redisConnection } from "@/lib/queue";

/**
 * Verifies that enqueueing actually reaches Redis.
 *
 * A `Queue.add()` that resolves without the job arriving is the exact failure
 * this suite exists to catch: the user's action succeeds, the record stays
 * pending, and nothing in the logs looks wrong.
 */
describe("enqueue reaches Redis", () => {
  afterAll(async () => {
    await queue().close();
    redisConnection().disconnect();
  });

  it("adds a job that the queue can then see", async () => {
    const before = await queue().getJobCounts();
    const ok = await enqueue({
      name: "recompute-readiness",
      userId: "00000000-0000-4000-8000-000000000001",
    });

    expect(ok).toBe(true);

    const after = await queue().getJobCounts();
    const total = (c: Record<string, number>) =>
      (c.waiting ?? 0) + (c.active ?? 0) + (c.delayed ?? 0) + (c.completed ?? 0);
    expect(total(after)).toBeGreaterThan(total(before));
  });
});
