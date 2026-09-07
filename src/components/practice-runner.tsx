"use client";

import { useState } from "react";
import { answerPracticeAction, finishPracticeAction } from "@/lib/practice/actions";
import type { PracticeItem } from "@/lib/practice/session";
import { readPractice } from "@/lib/practice/progress";
import { Alert, Button, Card } from "./ui";

/**
 * Practice: answer, see immediately whether it was right, and read why.
 *
 * The explanation is the entire point — it is what makes this different from
 * retaking the paper — so it appears the moment an answer is committed, and
 * the answer cannot then be changed. Letting a student re-answer after reading
 * the explanation would make the summary at the end meaningless.
 */
export function PracticeRunner({
  sessionId,
  skillAreaName,
  items: initialItems,
}: {
  sessionId: string;
  skillAreaName: string;
  items: PracticeItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answered = items.filter((i) => i.selectedOptionId !== null);
  const correct = answered.filter((i) => i.isCorrect).length;

  async function answer(item: PracticeItem, optionId: string) {
    if (item.selectedOptionId) return;
    setBusy(item.responseId);
    setError(null);
    const result = await answerPracticeAction(sessionId, {
      responseId: item.responseId,
      optionId,
    });
    setBusy(null);
    if (!result.ok) {
      setError(result.error ?? "Could not save that answer.");
      return;
    }
    // Re-read from the server so the explanation and key come from the source
    // of truth rather than being guessed in the browser.
    const response = await fetch(`/practice/${sessionId}/state`);
    if (response.ok) setItems((await response.json()).items as PracticeItem[]);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Practice · {skillAreaName}</h1>
        <p className="mt-1 text-sm text-ink-600">
          Not scored, not timed, and it does not affect your report or anything
          your college sees. Answer, read why, then take the skill check when
          you want to measure it.
        </p>
      </header>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <p className="mb-4 text-sm text-ink-600" data-testid="practice-progress">
        {answered.length} of {items.length} answered · {correct} right
      </p>

      <div className="space-y-4">
        {items.map((item) => {
          const done = item.selectedOptionId !== null;
          return (
            <Card key={item.responseId}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
                Question {item.position}
              </p>
              <p className="mb-4 whitespace-pre-wrap text-[15px] leading-relaxed">
                {item.prompt}
              </p>

              <div className="space-y-2">
                {item.options.map((option) => {
                  const chosen = item.selectedOptionId === option.id;
                  const isKey = item.correctOptionId === option.id;
                  const tone = !done
                    ? "border-ink-200 hover:bg-ink-50"
                    : isKey
                      ? "border-good-500 bg-good-100/40"
                      : chosen
                        ? "border-risk-500 bg-risk-100/40"
                        : "border-ink-200 opacity-70";
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={done || busy === item.responseId}
                      onClick={() => answer(item, option.id)}
                      className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left text-sm transition-colors ${tone}`}
                    >
                      <span className="flex-1 whitespace-pre-wrap">{option.label}</span>
                      {done && isKey ? (
                        <span className="text-xs font-semibold text-good-500">correct</span>
                      ) : null}
                      {done && chosen && !isKey ? (
                        <span className="text-xs font-semibold text-risk-500">
                          your answer
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {done && item.explanation ? (
                <div
                  className="mt-3 rounded-lg border border-ink-200 bg-ink-100/40 p-3"
                  data-testid="explanation"
                >
                  <p className="text-sm text-ink-600">{item.explanation}</p>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="mt-6 rounded-xl border border-ink-200 bg-white p-5">
        <p className="text-sm text-ink-600" data-testid="practice-summary">
          {readPractice({ attempted: answered.length, correct })}
        </p>
        <form action={finishPracticeAction} className="mt-3">
          <input type="hidden" name="sessionId" value={sessionId} />
          <Button type="submit">Finish practice</Button>
        </form>
      </div>
    </div>
  );
}
