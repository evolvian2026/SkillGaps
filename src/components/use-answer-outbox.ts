"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { saveAnswerAction } from "@/lib/assessment/actions";
import {
  classify,
  describe,
  due,
  emptyOutbox,
  enqueue,
  markInFlight,
  pendingCount,
  settle,
  type Draft,
  type OutboxState,
  type SaveStatus,
} from "@/lib/assessment/outbox";
import {
  clearDrafts,
  clearOtherAttempts,
  loadDrafts,
  saveDrafts,
  type StoredDraft,
} from "@/lib/assessment/local-draft";

/**
 * Drives the answer outbox.
 *
 * The queue logic itself is pure and lives in `lib/assessment/outbox`; this is
 * only the wiring — a ticker to pick up work whose backoff has elapsed, the
 * browser's online/offline events, and the mirror into local storage.
 *
 * The state lives in a ref as well as in React state. A flush can be triggered
 * from a timer, an event listener and the submit button, and all three need to
 * see the *current* queue rather than the one captured when their closure was
 * created — a stale read there would send an old draft or miss a new one.
 */

/** How often to look for work whose backoff has elapsed. */
const TICK_MS = 1_000;

export interface AnswerOutbox {
  status: SaveStatus;
  pending: number;
  online: boolean;
  /** Drafts recovered from local storage on mount, if any. */
  restored: StoredDraft[];
  queue: (input: {
    attemptQuestionId: string;
    draft: Draft;
    languageId: number | null;
    timeSpentMs: number;
  }) => void;
  /**
   * Sends everything outstanding and resolves with what is still unsent.
   * Zero means it is safe to submit.
   */
  flush: () => Promise<number>;
  /** Drops the local buffer once the attempt is safely submitted. */
  finish: () => void;
}

export function useAnswerOutbox(attemptId: string): AnswerOutbox {
  const stateRef = useRef<OutboxState>(emptyOutbox());
  /** The flush currently running, so passes are chained rather than raced. */
  const flushing = useRef<Promise<void> | null>(null);
  const [, forceRender] = useState(0);
  const [online, setOnline] = useState(true);
  const [restored, setRestored] = useState<StoredDraft[]>([]);

  const commit = useCallback(
    (next: OutboxState) => {
      stateRef.current = next;
      // Mirror to local storage on every transition, so a tab closed between
      // two ticks still has the answer on disk.
      saveDrafts(
        attemptId,
        Object.values(next.entries).map((e) => ({
          attemptQuestionId: e.attemptQuestionId,
          draft: e.draft,
          languageId: e.languageId,
          timeSpentMs: e.timeSpentMs,
          updatedAt: Date.now(),
        })),
      );
      forceRender((n) => n + 1);
    },
    [attemptId],
  );

  /**
   * Sends everything due, looping until nothing is left that can be sent now.
   *
   * Anything that failed carries a backoff by the time the pass ends, so the
   * next `due()` returns empty and the loop terminates rather than spinning.
   */
  const drain = useCallback(async (): Promise<void> => {
    for (;;) {
      const ready = due(stateRef.current, Date.now());
      if (ready.length === 0) return;

      await Promise.all(
        ready.map(async (entry) => {
          commit(markInFlight(stateRef.current, entry.attemptQuestionId));
          let outcome;
          try {
            const result = await saveAnswerAction(attemptId, {
              attemptQuestionId: entry.attemptQuestionId,
              optionId: entry.draft.optionId,
              responseText: entry.draft.text,
              languageId: entry.languageId,
              timeSpentMs: entry.timeSpentMs,
            });
            outcome = classify(result);
          } catch (err) {
            outcome = classify(null, err);
          }
          commit(
            settle(
              stateRef.current,
              entry.attemptQuestionId,
              entry.seq,
              outcome,
              Date.now(),
            ),
          );
        }),
      );
    }
  }, [attemptId, commit]);

  /**
   * Drains the queue and reports what is still unsent.
   *
   * Flushes are chained rather than run in parallel. Three things trigger one
   * — an edit, the retry ticker, and the submit button — and overlapping
   * passes caused a real bug: the second caller saw an entry already in flight
   * from the first, found nothing "due", and returned a pending count that
   * included work which was about to succeed. Submit read that as "answers
   * unsent" and refused to submit a paper that was in fact fully saved.
   *
   * Chaining means the count a caller receives is the state after its own
   * pass, with nothing still on the wire.
   */
  const flush = useCallback((): Promise<number> => {
    const run = (flushing.current ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => drain());
    flushing.current = run;
    return run.then(() => {
      if (flushing.current === run) flushing.current = null;
      return pendingCount(stateRef.current);
    });
  }, [drain]);

  const queue = useCallback(
    (input: {
      attemptQuestionId: string;
      draft: Draft;
      languageId: number | null;
      timeSpentMs: number;
    }) => {
      commit(enqueue(stateRef.current, input, Date.now()));
      void flush();
    },
    [commit, flush],
  );

  // Recover anything a previous session left behind, and re-queue it.
  useEffect(() => {
    clearOtherAttempts(attemptId);
    const saved = loadDrafts(attemptId);
    if (saved.length === 0) return;

    setRestored(saved);
    let next = stateRef.current;
    for (const item of saved) {
      next = enqueue(
        next,
        {
          attemptQuestionId: item.attemptQuestionId,
          draft: item.draft,
          languageId: item.languageId,
          timeSpentMs: item.timeSpentMs,
        },
        Date.now(),
      );
    }
    commit(next);
    void flush();
  }, [attemptId, commit, flush]);

  // Pick up work whose backoff has elapsed.
  useEffect(() => {
    const timer = setInterval(() => {
      if (due(stateRef.current, Date.now()).length > 0) void flush();
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [flush]);

  // Reconnecting is the moment worth acting on immediately.
  useEffect(() => {
    const update = () => {
      const next = navigator.onLine;
      setOnline(next);
      if (next) void flush();
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [flush]);

  // Last line of defence: warn before leaving with work outstanding.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingCount(stateRef.current) === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const finish = useCallback(() => {
    clearDrafts(attemptId);
    stateRef.current = emptyOutbox();
  }, [attemptId]);

  return {
    status: describe(stateRef.current, online),
    pending: pendingCount(stateRef.current),
    online,
    restored,
    queue,
    flush,
    finish,
  };
}
