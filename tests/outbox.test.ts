import { describe, expect, it } from "vitest";
import {
  backoffMs,
  classify,
  describe as describeStatus,
  due,
  emptyOutbox,
  enqueue,
  hasPending,
  markInFlight,
  pendingCount,
  settle,
  type OutboxState,
} from "@/lib/assessment/outbox";

/**
 * The outbox exists because a dropped connection used to lose a student's
 * answer. These tests are mostly about the failure paths, since the happy path
 * was never the problem.
 */

const draft = (text: string) => ({ optionId: null, text });
const put = (state: OutboxState, id: string, text: string, now = 0) =>
  enqueue(state, { attemptQuestionId: id, draft: draft(text), languageId: null, timeSpentMs: 100 }, now);

describe("queueing", () => {
  it("holds one entry per question", () => {
    let state = put(emptyOutbox(), "q1", "first");
    state = put(state, "q2", "other");
    expect(pendingCount(state)).toBe(2);
  });

  it("replaces an earlier unsent draft rather than queueing both", () => {
    // Two pending drafts for one question could land out of order and
    // overwrite the newer answer with the older one.
    let state = put(emptyOutbox(), "q1", "first");
    state = put(state, "q1", "second");
    expect(pendingCount(state)).toBe(1);
    expect(state.entries.q1.draft.text).toBe("second");
  });

  it("gives every edit a higher sequence number", () => {
    let state = put(emptyOutbox(), "q1", "a");
    const first = state.entries.q1.seq;
    state = put(state, "q1", "b");
    expect(state.entries.q1.seq).toBeGreaterThan(first);
  });

  it("resets the backoff when the student edits again", () => {
    // A student who fixes their answer should not be made to wait out a
    // penalty earned by an earlier failure.
    let state = put(emptyOutbox(), "q1", "a");
    state = markInFlight(state, "q1");
    state = settle(state, "q1", state.entries.q1.seq, { status: "retry", error: "x" }, 0);
    expect(state.entries.q1.failures).toBe(1);

    state = put(state, "q1", "b", 5_000);
    expect(state.entries.q1.failures).toBe(0);
    expect(state.entries.q1.nextAttemptAt).toBe(5_000);
  });
});

describe("what is due for delivery", () => {
  it("returns nothing while an entry is in flight", () => {
    let state = put(emptyOutbox(), "q1", "a");
    state = markInFlight(state, "q1");
    expect(due(state, 0)).toEqual([]);
  });

  it("withholds an entry until its backoff has elapsed", () => {
    let state = put(emptyOutbox(), "q1", "a");
    state = markInFlight(state, "q1");
    state = settle(state, "q1", state.entries.q1.seq, { status: "retry", error: "x" }, 1_000, () => 1);
    expect(due(state, 1_500)).toEqual([]);
    expect(due(state, 60_000)).toHaveLength(1);
  });

  it("sends the oldest edit first", () => {
    let state = put(emptyOutbox(), "q1", "a");
    state = put(state, "q2", "b");
    expect(due(state, 0).map((e) => e.attemptQuestionId)).toEqual(["q1", "q2"]);
  });

  it("stops offering work once the attempt is closed", () => {
    let state = put(emptyOutbox(), "q1", "a");
    state = markInFlight(state, "q1");
    state = settle(state, "q1", state.entries.q1.seq, { status: "fatal", error: "Time is up" }, 0);
    expect(due(state, 999_999)).toEqual([]);
  });
});

describe("settling a delivery", () => {
  it("removes an entry that saved", () => {
    let state = put(emptyOutbox(), "q1", "a");
    const { seq } = state.entries.q1;
    state = markInFlight(state, "q1");
    state = settle(state, "q1", seq, { status: "ok" }, 0);
    expect(hasPending(state)).toBe(false);
  });

  it("keeps a newer draft when an older delivery finishes late", () => {
    // The race that matters: the student edits while a save is in flight. The
    // late success must not delete the newer, still-unsent answer.
    let state = put(emptyOutbox(), "q1", "old");
    const oldSeq = state.entries.q1.seq;
    state = markInFlight(state, "q1");
    state = put(state, "q1", "new");

    state = settle(state, "q1", oldSeq, { status: "ok" }, 0);
    expect(pendingCount(state)).toBe(1);
    expect(state.entries.q1.draft.text).toBe("new");
    expect(state.entries.q1.inFlight).toBe(false);
  });

  it("does not penalise a newer draft for an older draft's failure", () => {
    let state = put(emptyOutbox(), "q1", "old");
    const oldSeq = state.entries.q1.seq;
    state = markInFlight(state, "q1");
    state = put(state, "q1", "new");

    state = settle(state, "q1", oldSeq, { status: "retry", error: "boom" }, 0);
    expect(state.entries.q1.failures).toBe(0);
    expect(due(state, 0)).toHaveLength(1);
  });

  it("backs off further on each successive failure", () => {
    let state = put(emptyOutbox(), "q1", "a");
    const delays: number[] = [];
    for (let i = 0; i < 3; i++) {
      state = markInFlight(state, "q1");
      state = settle(state, "q1", state.entries.q1.seq, { status: "retry", error: "x" }, 0, () => 1);
      delays.push(state.entries.q1.nextAttemptAt);
    }
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(delays[2]).toBeGreaterThan(delays[1]);
  });

  it("keeps the unsaved work visible after a fatal failure", () => {
    // The entry stays so the student can be told how much never made it.
    let state = put(emptyOutbox(), "q1", "a");
    state = markInFlight(state, "q1");
    state = settle(state, "q1", state.entries.q1.seq, { status: "fatal", error: "Time is up" }, 0);
    expect(state.fatalError).toBe("Time is up");
    expect(pendingCount(state)).toBe(1);
  });

  it("ignores a settle for a question that is no longer queued", () => {
    const state = settle(emptyOutbox(), "ghost", 1, { status: "ok" }, 0);
    expect(pendingCount(state)).toBe(0);
  });
});

describe("classifying a response", () => {
  it("treats a thrown error as worth retrying", () => {
    expect(classify(null, new Error("Failed to fetch"))).toMatchObject({ status: "retry" });
  });

  it("treats a success as done", () => {
    expect(classify({ ok: true })).toEqual({ status: "ok" });
  });

  it("does not retry what the server has permanently refused", () => {
    for (const error of [
      "This attempt is already submitted.",
      "Time is up for this attempt.",
      "Attempt not found.",
      "Unknown question.",
      "Invalid answer payload.",
    ]) {
      expect(classify({ ok: false, error }), error).toMatchObject({ status: "fatal" });
    }
  });

  it("retries an unrecognised failure rather than giving up on the answer", () => {
    // The safe direction: a wasted request costs nothing, a discarded answer
    // costs the student their paper.
    expect(classify({ ok: false, error: "502 Bad Gateway" })).toMatchObject({
      status: "retry",
    });
    expect(classify({ ok: false })).toMatchObject({ status: "retry" });
  });
});

describe("backoff", () => {
  it("grows with each failure and then caps", () => {
    const at = (n: number) => backoffMs(n, () => 1);
    expect(at(0)).toBeLessThan(at(1));
    expect(at(1)).toBeLessThan(at(2));
    expect(at(10)).toBe(at(5));
  });

  it("jitters, so a whole lab does not retry in lockstep", () => {
    expect(backoffMs(0, () => 0)).toBeLessThan(backoffMs(0, () => 1));
  });

  it("never returns a delay that would stall a recovering connection", () => {
    expect(backoffMs(99, () => 1)).toBeLessThanOrEqual(30_000);
  });
});

describe("what the student is told", () => {
  it("says saved only when nothing is pending", () => {
    expect(describeStatus(emptyOutbox(), true)).toEqual({ kind: "saved" });
  });

  it("says saving on a first attempt", () => {
    const state = put(emptyOutbox(), "q1", "a");
    expect(describeStatus(state, true)).toMatchObject({ kind: "saving" });
  });

  it("names being offline in preference to a retry count", () => {
    // It is the one cause the student can actually act on.
    const state = put(emptyOutbox(), "q1", "a");
    expect(describeStatus(state, false)).toMatchObject({ kind: "offline", pending: 1 });
  });

  it("says it is retrying once something has failed", () => {
    let state = put(emptyOutbox(), "q1", "a");
    state = markInFlight(state, "q1");
    state = settle(state, "q1", state.entries.q1.seq, { status: "retry", error: "x" }, 0);
    expect(describeStatus(state, true)).toMatchObject({ kind: "retrying", pending: 1 });
  });

  it("never claims saved while work is outstanding", () => {
    let state = put(emptyOutbox(), "q1", "a");
    for (const online of [true, false]) {
      expect(describeStatus(state, online).kind).not.toBe("saved");
    }
    state = markInFlight(state, "q1");
    state = settle(state, "q1", state.entries.q1.seq, { status: "ok" }, 0);
    expect(describeStatus(state, true).kind).toBe("saved");
  });

  it("reports a closed attempt above everything else", () => {
    let state = put(emptyOutbox(), "q1", "a");
    state = markInFlight(state, "q1");
    state = settle(state, "q1", state.entries.q1.seq, { status: "fatal", error: "Time is up" }, 0);
    expect(describeStatus(state, false)).toMatchObject({ kind: "fatal" });
  });
});
