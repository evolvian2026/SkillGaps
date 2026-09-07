import { Card } from "./ui";
import type { ItemRow } from "@/lib/items/queries";

/**
 * One item's statistics.
 *
 * The verdict and its sentence lead, because a coefficient without an
 * interpretation is not actionable by whoever edits the bank. The numbers are
 * there underneath for someone who wants to argue with the conclusion.
 */

const VERDICT_TONE: Record<string, string> = {
  urgent: "bg-risk-100 text-risk-500",
  review: "bg-warn-100 text-warn-500",
  ok: "bg-good-100 text-good-500",
  not_analysed: "bg-ink-100 text-ink-600",
};

const VERDICT_LABEL: Record<string, string> = {
  urgent: "Needs attention",
  review: "Worth a look",
  ok: "Behaving",
  not_analysed: "Not enough data",
};

const FLAG_LABEL: Record<string, string> = {
  too_easy: "Too easy",
  too_hard: "Too hard",
  not_discriminating: "Not discriminating",
  negative_discrimination: "Negative discrimination",
  no_variance: "No variance",
  dead_distractor: "Dead distractor",
  attractive_distractor: "Attractive distractor",
  thin_sample: "Thin sample",
  insufficient_data: "Too few responses",
};

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-ink-400">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-ink-600">{hint}</p> : null}
    </div>
  );
}

export function ItemCard({ item }: { item: ItemRow }) {
  const facility =
    item.facility === null ? "—" : `${Math.round(item.facility * 100)}%`;
  const discrimination =
    item.discrimination === null ? "—" : item.discrimination.toFixed(2);
  const significance =
    item.discriminationP === null
      ? undefined
      : item.discriminationP < 0.05
        ? `p = ${item.discriminationP.toFixed(3)}`
        : `not significant (p = ${item.discriminationP.toFixed(2)})`;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink-800">{item.prompt}</p>
          <p className="mt-0.5 text-xs text-ink-600">
            {item.skillArea} · {item.type} · difficulty {item.difficulty} ·{" "}
            {item.responses} responses
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${VERDICT_TONE[item.verdict]}`}
          data-testid={`verdict-${item.verdict}`}
        >
          {VERDICT_LABEL[item.verdict] ?? item.verdict}
        </span>
      </div>

      <p className="mt-2 text-sm text-ink-600">{item.message}</p>

      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3">
        <Stat
          label="Facility"
          value={facility}
          hint={item.facility === null ? undefined : "answered correctly"}
        />
        <Stat label="Discrimination" value={discrimination} hint={significance} />
      </div>

      {item.flags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.flags.map((flag) => (
            <span
              key={flag}
              className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600"
            >
              {FLAG_LABEL[flag] ?? flag}
            </span>
          ))}
        </div>
      ) : null}

      {item.distractors.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-ink-600">
            Option breakdown
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                  <th className="py-1.5 font-medium">Option</th>
                  <th className="py-1.5 text-right font-medium">Chosen</th>
                  <th className="py-1.5 text-right font-medium">Share</th>
                  <th className="py-1.5 text-right font-medium">
                    Mean rest-of-paper
                  </th>
                </tr>
              </thead>
              <tbody>
                {item.distractors.map((d) => (
                  <tr key={d.option_id} className="border-b border-ink-100 last:border-0">
                    <td className="py-1.5">
                      <span className={d.is_correct ? "font-semibold" : ""}>
                        {d.label}
                      </span>
                      {d.is_correct ? (
                        <span className="ml-1.5 text-xs text-good-500">key</span>
                      ) : null}
                      {d.flags.map((f) => (
                        <span key={f} className="ml-1.5 text-xs text-warn-500">
                          {FLAG_LABEL[f] ?? f}
                        </span>
                      ))}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{d.chosen}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {Math.round(d.share * 100)}%
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {d.mean_rest_percent === null
                        ? "—"
                        : `${Math.round(d.mean_rest_percent)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-ink-600">
            The telling column is the last one. A wrong option whose choosers
            outscore the students picking the key usually means the key is wrong
            or two options are defensible.
          </p>
        </details>
      ) : null}
    </Card>
  );
}
