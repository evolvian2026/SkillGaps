/**
 * A local copy of unsaved answers.
 *
 * The outbox keeps work alive across a bad connection; this keeps it alive
 * across a closed tab, a crashed browser, or the lab machine being restarted
 * mid-paper. Written synchronously on every edit, *before* any network call,
 * so there is no window in which a typed answer exists only in memory.
 *
 * Every access is wrapped: `localStorage` throws outright in some privacy
 * modes and when a quota is exceeded, and an assessment that crashes because
 * it could not write a backup would be worse than one with no backup at all.
 * The network path stays primary; this is belt and braces.
 */

import type { Draft } from "./outbox";

/** Bumped if the stored shape changes, so an old payload is discarded not misread. */
const VERSION = 1;

const PREFIX = "skillgaps.attempt.";

export interface StoredDraft {
  attemptQuestionId: string;
  draft: Draft;
  languageId: number | null;
  timeSpentMs: number;
  /** When the student last edited it, for the "restored" notice. */
  updatedAt: number;
}

interface Payload {
  version: number;
  attemptId: string;
  drafts: StoredDraft[];
}

function key(attemptId: string): string {
  return `${PREFIX}${attemptId}`;
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    // Blocked entirely (some privacy modes throw on access, not on use).
    return null;
  }
}

export function loadDrafts(attemptId: string): StoredDraft[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(key(attemptId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Payload;
    if (parsed.version !== VERSION || parsed.attemptId !== attemptId) return [];
    if (!Array.isArray(parsed.drafts)) return [];
    return parsed.drafts.filter(
      (d): d is StoredDraft =>
        typeof d?.attemptQuestionId === "string" && typeof d?.draft === "object",
    );
  } catch {
    // Corrupt or unreadable: treat as absent rather than failing the attempt.
    return [];
  }
}

export function saveDrafts(attemptId: string, drafts: StoredDraft[]): void {
  const store = storage();
  if (!store) return;
  try {
    if (drafts.length === 0) {
      store.removeItem(key(attemptId));
      return;
    }
    const payload: Payload = { version: VERSION, attemptId, drafts };
    store.setItem(key(attemptId), JSON.stringify(payload));
  } catch {
    // Out of quota, or storage disabled mid-session. Nothing useful to do:
    // the answer is still queued in memory and still being sent.
  }
}

export function clearDrafts(attemptId: string): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(key(attemptId));
  } catch {
    /* nothing to do */
  }
}

/**
 * Removes buffers left by other attempts.
 *
 * A shared lab machine accumulates one of these per student who ever sat a
 * paper on it. Only the attempt in front of us is worth keeping.
 */
export function clearOtherAttempts(keepAttemptId: string): void {
  const store = storage();
  if (!store) return;
  try {
    const stale: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(PREFIX) && k !== key(keepAttemptId)) stale.push(k);
    }
    for (const k of stale) store.removeItem(k);
  } catch {
    /* nothing to do */
  }
}
