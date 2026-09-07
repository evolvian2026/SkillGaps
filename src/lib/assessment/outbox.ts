/**
 * The answer outbox.
 *
 * Autosave used to be one fire-and-forget call per keystroke. On a good link
 * that is fine; on a campus lab sharing one flaky uplink it is the worst
 * failure this product can have — a student types an answer, sees "Not saved",
 * and their work is gone. Losing a paper does not just lose a score, it ends
 * the institution's trust in the platform.
 *
 * This models the queue as pure data so the rules can be tested without a
 * browser, a network or a database:
 *
 *   * **Coalesced per question.** Only the latest draft for a question is ever
 *     sent. Two saves in flight for one question could land out of order and
 *     overwrite a newer answer with an older one — the kind of bug that shows
 *     up as "the system lost my answer" and is nearly impossible to reproduce.
 *   * **Retried with backoff and jitter.** A lab of sixty students dropping
 *     together would otherwise retry in lockstep and beat the uplink flat at
 *     exactly the moment it is recovering.
 *   * **Terminal failures are not retried.** "Time is up" and "already
 *     submitted" are the server saying no. Retrying those forever would hide
 *     the real state from the student.
 */

export interface Draft {
  optionId: string | null;
  text: string | null;
}

export interface OutboxEntry {
  attemptQuestionId: string;
  draft: Draft;
  languageId: number | null;
  /** Milliseconds the student spent on the question when this draft was made. */
  timeSpentMs: number;
  /** Bumped on every edit; identifies which draft a settle() refers to. */
  seq: number;
  /** How many delivery attempts have failed so far. */
  failures: number;
  /** Epoch ms before which this entry should not be retried. */
  nextAttemptAt: number;
  /** True while a request for this entry is in flight. */
  inFlight: boolean;
}

export interface OutboxState {
  entries: Record<string, OutboxEntry>;
  /** Monotonic across the whole attempt, so seq values never collide. */
  nextSeq: number;
  /** Set when the server has told us the attempt can no longer be written to. */
  fatalError: string | null;
}

export function emptyOutbox(): OutboxState {
  return { entries: {}, nextSeq: 1, fatalError: null };
}

/** Backoff schedule in ms, before jitter. Caps so a long outage still retries. */
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

export function backoffMs(failures: number, random: () => number = Math.random): number {
  const base = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
  // Full jitter over the interval: sixty students in one lab must not retry in
  // lockstep on a link that is only just coming back.
  return Math.round(base * (0.5 + random() * 0.5));
}

/**
 * Errors the server returns when the attempt can no longer accept writes.
 *
 * Matched on the message the action actually returns rather than a code,
 * because these come from `saveAnswerAction` as plain strings. Anything not
 * listed is treated as transient — the safe direction, since retrying a
 * recoverable failure costs a request and giving up on one costs an answer.
 */
const TERMINAL_PATTERNS = [
  /already submitted/i,
  /time is up/i,
  /attempt not found/i,
  /unknown question/i,
  /invalid answer payload/i,
];

export type SaveOutcome =
  | { status: "ok" }
  | { status: "retry"; error: string }
  | { status: "fatal"; error: string };

/** Classifies what came back from one delivery attempt. */
export function classify(
  result: { ok: boolean; error?: string } | null,
  thrown?: unknown,
): SaveOutcome {
  if (thrown !== undefined) {
    // A thrown error is the network or the server being unreachable. Always
    // worth retrying: the answer is still valid, the pipe is not.
    return {
      status: "retry",
      error: thrown instanceof Error ? thrown.message : "Network error",
    };
  }
  if (result?.ok) return { status: "ok" };

  const error = result?.error ?? "Could not save";
  if (TERMINAL_PATTERNS.some((p) => p.test(error))) {
    return { status: "fatal", error };
  }
  return { status: "retry", error };
}

/**
 * Queues a draft, replacing any earlier unsent draft for the same question.
 *
 * Replacing rather than appending is what makes ordering safe: there is never
 * more than one pending draft per question, so nothing can arrive out of turn.
 * An entry currently in flight keeps `inFlight` so the caller does not start a
 * second request; the settle for the older seq will simply not match.
 */
export function enqueue(
  state: OutboxState,
  input: {
    attemptQuestionId: string;
    draft: Draft;
    languageId: number | null;
    timeSpentMs: number;
  },
  now: number,
): OutboxState {
  const previous = state.entries[input.attemptQuestionId];
  return {
    ...state,
    nextSeq: state.nextSeq + 1,
    entries: {
      ...state.entries,
      [input.attemptQuestionId]: {
        attemptQuestionId: input.attemptQuestionId,
        draft: input.draft,
        languageId: input.languageId,
        timeSpentMs: input.timeSpentMs,
        seq: state.nextSeq,
        // A fresh edit deserves a fresh attempt: reset the backoff so a
        // student who fixes their answer is not waiting out an old penalty.
        failures: 0,
        nextAttemptAt: now,
        inFlight: previous?.inFlight ?? false,
      },
    },
  };
}

/** The entries due for delivery now, oldest edit first. */
export function due(state: OutboxState, now: number): OutboxEntry[] {
  if (state.fatalError) return [];
  return Object.values(state.entries)
    .filter((e) => !e.inFlight && e.nextAttemptAt <= now)
    .sort((a, b) => a.seq - b.seq);
}

export function markInFlight(state: OutboxState, id: string): OutboxState {
  const entry = state.entries[id];
  if (!entry) return state;
  return {
    ...state,
    entries: { ...state.entries, [id]: { ...entry, inFlight: true } },
  };
}

/**
 * Applies the result of one delivery attempt.
 *
 * The `seq` guard is what keeps a slow response from clobbering a newer edit:
 * if the student changed their answer while the request was in flight, the
 * entry now holds a higher seq and this settle only clears the in-flight flag.
 */
export function settle(
  state: OutboxState,
  id: string,
  seq: number,
  outcome: SaveOutcome,
  now: number,
  random: () => number = Math.random,
): OutboxState {
  const entry = state.entries[id];
  if (!entry) return state;

  if (entry.seq !== seq) {
    // A newer draft was queued while this one was in flight. Leave it pending
    // and let the next flush send the newer text.
    return {
      ...state,
      entries: { ...state.entries, [id]: { ...entry, inFlight: false } },
    };
  }

  if (outcome.status === "ok") {
    const rest = { ...state.entries };
    delete rest[id];
    return { ...state, entries: rest };
  }

  if (outcome.status === "fatal") {
    // Nothing more can be written to this attempt. Keep the entries so the UI
    // can still say how much never made it, but stop trying.
    return {
      ...state,
      fatalError: outcome.error,
      entries: { ...state.entries, [id]: { ...entry, inFlight: false } },
    };
  }

  const failures = entry.failures + 1;
  return {
    ...state,
    entries: {
      ...state.entries,
      [id]: {
        ...entry,
        inFlight: false,
        failures,
        nextAttemptAt: now + backoffMs(failures - 1, random),
      },
    },
  };
}

export function pendingCount(state: OutboxState): number {
  return Object.keys(state.entries).length;
}

export function hasPending(state: OutboxState): boolean {
  return pendingCount(state) > 0;
}

/** True when something has failed at least once and is still waiting. */
export function isStruggling(state: OutboxState): boolean {
  return Object.values(state.entries).some((e) => e.failures > 0);
}

/**
 * How the save state should be described to the student.
 *
 * Deliberately never silent about unsaved work, and never claims "saved" while
 * anything is pending. `offline` outranks a retry count because it names the
 * cause the student can actually do something about.
 */
export type SaveStatus =
  | { kind: "saved" }
  | { kind: "saving" }
  | { kind: "offline"; pending: number }
  | { kind: "retrying"; pending: number }
  | { kind: "fatal"; error: string };

export function describe(state: OutboxState, online: boolean): SaveStatus {
  if (state.fatalError) return { kind: "fatal", error: state.fatalError };

  const pending = pendingCount(state);
  if (pending === 0) return { kind: "saved" };
  if (!online) return { kind: "offline", pending };
  if (isStruggling(state)) return { kind: "retrying", pending };
  return { kind: "saving" };
}
