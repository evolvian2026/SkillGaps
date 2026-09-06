"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { PaperQuestion } from "@/lib/assessment/paper";
import {
  recordIntegrityEventAction,
  saveAnswerAction,
  submitAttemptAction,
} from "@/lib/assessment/actions";
import { track } from "./analytics";
import { Countdown } from "./countdown";
import { Alert, Button } from "./ui";

type Draft = { optionId: string | null; text: string | null };

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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  const question = questions[index];
  const shownAt = useRef(Date.now());
  const submitted = useRef(false);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [index]);

  const persist = useCallback(
    async (attemptQuestionId: string, draft: Draft, languageId: number | null) => {
      setSaveState("saving");
      const result = await saveAnswerAction(attemptId, {
        attemptQuestionId,
        optionId: draft.optionId,
        responseText: draft.text,
        languageId,
        timeSpentMs: Date.now() - shownAt.current,
      });
      setSaveState(result.ok ? "idle" : "error");
      if (!result.ok && result.error) setNotice(result.error);
    },
    [attemptId],
  );

  const submit = useCallback(() => {
    if (submitted.current) return;
    submitted.current = true;
    void track("assessment_submitted", { attempt_id: attemptId });
    startSubmit(() => {
      void submitAttemptAction(attemptId);
    });
  }, [attemptId]);

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

  const update = (next: Draft) => {
    setDrafts((prev) => ({ ...prev, [question.attemptQuestionId]: next }));
    void persist(question.attemptQuestionId, next, question.languageId);
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
        <Countdown expiresAtIso={expiresAtIso} onExpire={submit} />
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
                  onChange={() => update({ optionId: option.id, text: null })}
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
            onChange={(e) => update({ optionId: null, text: e.target.value })}
            placeholder="Type your answer"
            className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        ) : null}

        {question.type === "code" ? (
          <div>
            <textarea
              value={draft?.text ?? ""}
              onChange={(e) => update({ optionId: null, text: e.target.value })}
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
        <span className="text-xs text-ink-600">
          {saveState === "saving"
            ? "Saving…"
            : saveState === "error"
              ? "Not saved — check your connection"
              : "Answers saved automatically"}
        </span>
        {index === questions.length - 1 ? (
          <Button onClick={submit} disabled={submitting}>
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
