"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { PaperQuestion } from "@/lib/assessment/paper";
import {
  recordIntegrityEventAction,
  submitAttemptAction,
} from "@/lib/assessment/actions";
import type { Draft } from "@/lib/assessment/outbox";
import { useAnswerOutbox } from "./use-answer-outbox";
import { SaveIndicator } from "./save-indicator";
import { track } from "./analytics";
import { Countdown } from "./countdown";
import { Alert, Button } from "./ui";

/** Long enough to coalesce a burst of typing, short enough to feel immediate. */
const TYPING_DEBOUNCE_MS = 700;

export function AssessmentRunner({
  attemptId,
  trackName,
  expiresAtIso,
  questions,
}: {
  attemptId: string;
  trackName: string;
  expiresAtIso: string;
  questions: PaperQuestion[];
}) {
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      questions.map((q) => [
        q.attemptQuestionId,
        { optionId: q.savedOptionId, text: q.savedText ?? q.starterCode ?? null },
      ]),
    ),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const [blockedSubmit, setBlockedSubmit] = useState<number | null>(null);

  const outbox = useAnswerOutbox(attemptId);
  const question = questions[index];
  const shownAt = useRef(Date.now());
  const submitted = useRef(false);
  /** Pending debounce timer for free-text answers, so typing is not one request per keystroke. */
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);

  // Anything recovered from local storage is already re-queued by the hook;
  // this puts it back on screen so the student sees their own words, not a
  // blank box they would retype.
  useEffect(() => {
    if (outbox.restored.length === 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const item of outbox.restored) {
        next[item.attemptQuestionId] = item.draft;
      }
      return next;
    });
    setNotice(
      `Restored ${outbox.restored.length} unsaved ${
        outbox.restored.length === 1 ? "answer" : "answers"
      } from this device. They are being saved now.`,
    );
  }, [outbox.restored]);

  const send = useCallback(
    (attemptQuestionId: string, draft: Draft, languageId: number | null) => {
      outbox.queue({
        attemptQuestionId,
        draft,
        languageId,
        timeSpentMs: Date.now() - shownAt.current,
      });
    },
    [outbox],
  );

  /**
   * Submits, but never with answers still unsent.
   *
   * `force` is for the timer running out: the deadline is server-authoritative
   * so the attempt closes regardless, and the best we can do is one last flush
   * before it does.
   */
  const submit = useCallback(
    (force = false) => {
      if (submitted.current) return;

      // Any keystroke still inside the debounce window has not reached the
      // queue yet. Flush it first, or the last thing the student typed is the
      // one thing that never gets saved.
      if (typingTimer.current) {
        clearTimeout(typingTimer.current);
        typingTimer.current = null;
        const pending = drafts[question.attemptQuestionId];
        if (pending) send(question.attemptQuestionId, pending, question.languageId);
      }

      void (async () => {
        const unsent = await outbox.flush();
        if (unsent > 0 && !force) {
          setBlockedSubmit(unsent);
          return;
        }
        setBlockedSubmit(null);
        submitted.current = true;
        outbox.finish();
        void track("assessment_submitted", { attempt_id: attemptId });
        startSubmit(() => {
          void submitAttemptAction(attemptId);
        });
      })();
    },
    [attemptId, drafts, outbox, question, send],
  );

  const onExpire = useCallback(() => submit(true), [submit]);

  // Integrity signals. Recorded for review only — nothing here blocks or ends
  // an attempt, because a dropped hostel connection looks identical to this.
  useEffect(() => {
    const report = (type: string, detail?: Record<string, unknown>) => {
      void recordIntegrityEventAction(attemptId, { type, detail: detail ?? null });
    };
    const onVisibility = () =>
      report(document.hidden ? "tab_blur" : "tab_focus", {
        at: new Date().toISOString(),
      });
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [attemptId]);

  const blockClipboard = useCallback(
    (event: React.ClipboardEvent, kind: "paste_blocked" | "copy_blocked") => {
      event.preventDefault();
      void recordIntegrityEventAction(attemptId, {
        type: kind,
        detail: { questionPosition: question?.position ?? null },
      });
      setNotice(
        kind === "paste_blocked"
          ? "Pasting is disabled on coding questions — type your solution."
          : "Copying is disabled during the assessment.",
      );
    },
    [attemptId, question?.position],
  );

  if (!question) return null;

  const draft = drafts[question.attemptQuestionId];
  const answeredCount = questions.filter((q) => {
    const d = drafts[q.attemptQuestionId];
    return d?.optionId || (d?.text && d.text.trim().length > 0);
  }).length;

  /** A choice is a deliberate act: save it at once. */
  const choose = (next: Draft) => {
    setDrafts((prev) => ({ ...prev, [question.attemptQuestionId]: next }));
    send(question.attemptQuestionId, next, question.languageId);
  };

  /**
   * Typing is debounced.
   *
   * One request per keystroke floods a weak link and, worse, puts several
   * saves for the same question in flight at once. The outbox would coalesce
   * them, but not sending them is cheaper — and the local buffer is written
   * synchronously either way, so a crash mid-sentence still loses nothing.
   */
  const type = (next: Draft) => {
    setDrafts((prev) => ({ ...prev, [question.attemptQuestionId]: next }));
    const attemptQuestionId = question.attemptQuestionId;
    const languageId = question.languageId;
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      typingTimer.current = null;
      send(attemptQuestionId, next, languageId);
    }, TYPING_DEBOUNCE_MS);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">{trackName}</h1>
          <p className="text-sm text-ink-600">
            Question {question.position} of {questions.length} · {answeredCount}{" "}
            answered
          </p>
        </div>
        <Countdown expiresAtIso={expiresAtIso} onExpire={onExpire} />
      </header>

      <div
        className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-ink-200"
        role="progressbar"
        aria-valuenow={answeredCount}
        aria-valuemin={0}
        aria-valuemax={questions.length}
      >
        <div
          className="h-full bg-brand-500 transition-[width]"
          style={{ width: `${(answeredCount / questions.length) * 100}%` }}
        />
      </div>

      {notice ? (
        <div className="mb-4">
          <Alert tone="info">{notice}</Alert>
        </div>
      ) : null}

      {blockedSubmit !== null ? (
        <div className="mb-4" data-testid="submit-blocked">
          <Alert>
            {blockedSubmit} {blockedSubmit === 1 ? "answer has" : "answers have"}{" "}
            not reached us yet, so submitting now would lose{" "}
            {blockedSubmit === 1 ? "it" : "them"}. Your work is safe on this
            device — wait for the connection to come back and press submit
            again. Do not close this tab.
          </Alert>
        </div>
      ) : null}

      {outbox.status.kind === "fatal" && outbox.pending > 0 ? (
        <div className="mb-4">
          <Alert>
            {outbox.status.error} {outbox.pending}{" "}
            {outbox.pending === 1 ? "answer" : "answers"} could not be saved.
            Tell your placement office before you leave — they can see this
            attempt and what reached us.
          </Alert>
        </div>
      ) : null}

      <article className="rounded-xl border border-ink-200 bg-white p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
          {question.skillArea} · {question.points}{" "}
          {question.points === 1 ? "point" : "points"}
        </p>
        <p className="mb-5 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-900">
          {question.prompt}
        </p>

        {question.type === "mcq" ? (
          <fieldset className="space-y-2">
            <legend className="sr-only">Choose one answer</legend>
            {question.options.map((option) => (
              <label
                key={option.id}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                  draft?.optionId === option.id
                    ? "border-brand-500 bg-brand-50"
                    : "border-ink-200 hover:bg-ink-50"
                }`}
              >
                <input
                  type="radio"
                  name={question.attemptQuestionId}
                  checked={draft?.optionId === option.id}
                  onChange={() => choose({ optionId: option.id, text: null })}
                  className="mt-0.5 h-4 w-4 text-brand-600"
                />
                <span className="whitespace-pre-wrap">{option.label}</span>
              </label>
            ))}
          </fieldset>
        ) : null}

        {question.type === "short" ? (
          <input
            value={draft?.text ?? ""}
            onChange={(e) => type({ optionId: null, text: e.target.value })}
            placeholder="Type your answer"
            className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        ) : null}

        {question.type === "code" ? (
          <div>
            <textarea
              value={draft?.text ?? ""}
              onChange={(e) => type({ optionId: null, text: e.target.value })}
              onPaste={(e) => blockClipboard(e, "paste_blocked")}
              onCopy={(e) => blockClipboard(e, "copy_blocked")}
              onCut={(e) => blockClipboard(e, "copy_blocked")}
              spellCheck={false}
              rows={14}
              className="w-full rounded-lg border border-ink-200 bg-ink-900 p-3 font-mono text-[13px] leading-relaxed text-ink-50 outline-none focus:border-brand-500"
            />
            <p className="mt-2 text-xs text-ink-600">
              Copy and paste are disabled here. Your code runs in a sandbox when
              you submit.
            </p>
          </div>
        ) : null}
      </article>

      <nav className="mt-5 flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          Previous
        </Button>
        <SaveIndicator status={outbox.status} />
        {index === questions.length - 1 ? (
          <Button onClick={() => submit()} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit assessment"}
          </Button>
        ) : (
          <Button onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}>
            Next
          </Button>
        )}
      </nav>

      <ol className="mt-6 flex flex-wrap gap-1.5" aria-label="Jump to question">
        {questions.map((q, i) => {
          const d = drafts[q.attemptQuestionId];
          const done = d?.optionId || (d?.text && d.text.trim().length > 0);
          return (
            <li key={q.attemptQuestionId}>
              <button
                onClick={() => setIndex(i)}
                aria-current={i === index}
                className={`h-8 w-8 rounded-md text-xs font-semibold ${
                  i === index
                    ? "bg-brand-600 text-white"
                    : done
                      ? "bg-good-100 text-good-500"
                      : "bg-ink-100 text-ink-600"
                }`}
              >
                {q.position}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
