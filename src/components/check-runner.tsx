"use client";

import { useState } from "react";
import { saveCheckAnswerAction, submitCheckAction } from "@/lib/practice/actions";
import type { CheckItem } from "@/lib/practice/session";
import { Alert, Button, Card } from "./ui";

/**
 * A skill check.
 *
 * Unlike practice, nothing is revealed as you go: no correctness, no
 * explanation, no key in the page at all. It is scored, so per-question
 * feedback would turn it into practice with unlimited retries.
 */
export function CheckRunner({
  checkId,
  skillAreaName,
  items,
}: {
  checkId: string;
  skillAreaName: string;
  items: CheckItem[];
}) {
  const [selected, setSelected] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items
        .filter((i) => i.selectedOptionId)
        .map((i) => [i.checkQuestionId, i.selectedOptionId as string]),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  const answeredCount = Object.keys(selected).length;

  async function choose(item: CheckItem, optionId: string) {
    setSelected((prev) => ({ ...prev, [item.checkQuestionId]: optionId }));
    setError(null);
    const result = await saveCheckAnswerAction(checkId, {
      checkQuestionId: item.checkQuestionId,
      optionId,
    });
    if (!result.ok) setError(result.error ?? "Could not save that answer.");
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Skill check · {skillAreaName}</h1>
        <p className="mt-1 text-sm text-ink-600">
          {items.length} questions on this one area. Your score is compared with
          your diagnostic so you can see whether practice moved anything. It is
          a personal signal only — it does not change your report, your
          readiness score, or anything an employer or your college sees.
        </p>
      </header>

      {error ? (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <p className="mb-4 text-sm text-ink-600" data-testid="check-progress">
        {answeredCount} of {items.length} answered
      </p>

      <div className="space-y-4">
        {items.map((item) => (
          <Card key={item.checkQuestionId}>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
              Question {item.position}
            </p>
            <p className="mb-4 whitespace-pre-wrap text-[15px] leading-relaxed">
              {item.prompt}
            </p>
            <div className="space-y-2">
              {item.options.map((option) => {
                const chosen = selected[item.checkQuestionId] === option.id;
                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${
                      chosen
                        ? "border-brand-500 bg-brand-50"
                        : "border-ink-200 hover:bg-ink-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={item.checkQuestionId}
                      checked={chosen}
                      onChange={() => choose(item, option.id)}
                      className="mt-0.5 h-4 w-4 text-brand-600"
                    />
                    <span className="whitespace-pre-wrap">{option.label}</span>
                  </label>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      <form action={submitCheckAction} className="mt-6">
        <input type="hidden" name="checkId" value={checkId} />
        <Button type="submit">Submit check</Button>
        <p className="mt-2 text-xs text-ink-600">
          Unanswered questions count as wrong, the same as on a full paper.
        </p>
      </form>
    </div>
  );
}
