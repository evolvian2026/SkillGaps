"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { InterviewQuestionView } from "@/lib/interview/session";
import {
  saveInterviewResponseAction,
  submitInterviewAction,
} from "@/lib/interview/actions";
import { Alert, Button } from "./ui";

const KIND_LABEL: Record<string, string> = {
  behavioral: "Behavioural",
  technical: "Technical",
  situational: "Situational",
};

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function InterviewRunner({
  sessionId,
  trackName,
  questions,
}: {
  sessionId: string;
  trackName: string;
  questions: InterviewQuestionView[];
}) {
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(questions.map((q) => [q.responseId, q.savedText ?? ""])),
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [submitting, startSubmit] = useTransition();

  const question = questions[index];
  const shownAt = useRef(Date.now());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    shownAt.current = Date.now();
    setElapsed(0);
    const id = window.setInterval(
      () => setElapsed(Math.round((Date.now() - shownAt.current) / 1000)),
      1000,
    );
    return () => window.clearInterval(id);
  }, [index]);

  const persist = useCallback(
    async (responseId: string, text: string) => {
      setSaveState("saving");
      const result = await saveInterviewResponseAction(sessionId, {
        responseId,
        responseText: text,
        timeSpentMs: Date.now() - shownAt.current,
      });
      setSaveState(result.ok ? "idle" : "error");
      if (!result.ok && result.error) setNotice(result.error);
    },
    [sessionId],
  );

  // Typed prose, unlike a radio button, would mean a request per keystroke.
  // Debounced so a slow connection is not hammered while the student writes.
  const update = (text: string) => {
    setDrafts((prev) => ({ ...prev, [question.responseId]: text }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist(question.responseId, text);
    }, 1200);
  };

  const flush = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await persist(question.responseId, drafts[question.responseId] ?? "");
  }, [drafts, persist, question.responseId]);

  const go = async (next: number) => {
    await flush();
    setIndex(next);
  };

  const submit = () => {
    startSubmit(async () => {
      await flush();
      await submitInterviewAction(sessionId);
    });
  };

  const answered = questions.filter(
    (q) => (drafts[q.responseId] ?? "").trim().length > 0,
  ).length;
  const words = wordCount(drafts[question.responseId] ?? "");
  const overTime = elapsed > question.suggestedTimeSeconds;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">Mock interview · {trackName}</h1>
          <p className="text-sm text-ink-600">
            Question {question.position} of {questions.length} · {answered} answered
          </p>
        </div>
        <div
          className={`rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums ${
            overTime ? "bg-warn-100 text-warn-500" : "bg-ink-100 text-ink-800"
          }`}
          title="A guide, not a limit — nothing is cut off."
        >
          {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
          <span className="ml-1 font-normal opacity-70">
            / {Math.round(question.suggestedTimeSeconds / 60)} min suggested
          </span>
        </div>
      </header>

      {notice ? (
        <div className="mb-4">
          <Alert tone="info">{notice}</Alert>
        </div>
      ) : null}

      <article className="rounded-xl border border-ink-200 bg-white p-5">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
          {KIND_LABEL[question.kind] ?? question.kind}
          {question.skillArea ? ` · ${question.skillArea}` : ""}
        </p>
        <p className="mb-5 text-[15px] leading-relaxed text-ink-900">
          {question.prompt}
        </p>

        <textarea
          value={drafts[question.responseId] ?? ""}
          onChange={(e) => update(e.target.value)}
          onBlur={() => void flush()}
          rows={12}
          placeholder="Type your answer as you would say it out loud…"
          className="w-full rounded-lg border border-ink-200 p-3 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <p className="mt-2 flex items-center justify-between text-xs text-ink-600">
          <span>
            {words} {words === 1 ? "word" : "words"}
            {words > 0 && words < 60 ? " — most strong answers run 120–250 words" : ""}
          </span>
          <span>
            {saveState === "saving"
              ? "Saving…"
              : saveState === "error"
                ? "Not saved — check your connection"
                : "Saved"}
          </span>
        </p>
      </article>

      <nav className="mt-5 flex items-center justify-between gap-3">
        <Button
          variant="secondary"
          onClick={() => void go(Math.max(0, index - 1))}
          disabled={index === 0}
        >
          Previous
        </Button>
        {index === questions.length - 1 ? (
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Submitting…" : "Submit for feedback"}
          </Button>
        ) : (
          <Button onClick={() => void go(Math.min(questions.length - 1, index + 1))}>
            Next
          </Button>
        )}
      </nav>

      <ol className="mt-6 flex flex-wrap gap-1.5" aria-label="Jump to question">
        {questions.map((q, i) => {
          const done = (drafts[q.responseId] ?? "").trim().length > 0;
          return (
            <li key={q.responseId}>
              <button
                onClick={() => void go(i)}
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
