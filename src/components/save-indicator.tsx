"use client";

import type { SaveStatus } from "@/lib/assessment/outbox";

/**
 * What the student is told about their unsaved work.
 *
 * The old version said "Not saved — check your connection" and left it there,
 * which is true but useless: it does not say whether anything is still being
 * tried, or how much is at risk. Each state here names what is happening and,
 * where there is one, what the student should do.
 *
 * The text is deliberately calm. A student mid-paper on a dropping connection
 * does not need alarm, they need to know the answer is not lost.
 */

const TONE: Record<SaveStatus["kind"], string> = {
  saved: "text-ink-600",
  saving: "text-ink-600",
  offline: "text-warn-500",
  retrying: "text-warn-500",
  fatal: "text-risk-500",
};

function label(status: SaveStatus): string {
  switch (status.kind) {
    case "saved":
      return "All answers saved";
    case "saving":
      return "Saving…";
    case "offline":
      return `Offline — ${status.pending} ${
        status.pending === 1 ? "answer" : "answers"
      } waiting, saved on this device`;
    case "retrying":
      return `Connection is patchy — retrying ${status.pending} ${
        status.pending === 1 ? "answer" : "answers"
      }`;
    case "fatal":
      return status.error;
  }
}

export function SaveIndicator({ status }: { status: SaveStatus }) {
  return (
    <span
      className={`text-xs ${TONE[status.kind]}`}
      // The runner and its tests both key off this rather than the wording,
      // so copy can change without breaking either.
      data-testid="save-status"
      data-state={status.kind}
      role="status"
      aria-live="polite"
    >
      {label(status)}
    </span>
  );
}
