import { AppShell } from "@/components/app-shell";
import { ItemCard } from "@/components/item-card";
import { Alert, Card, Empty, SectionHeading } from "@/components/ui";
import { requireSuperAdmin } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { itemsForRun, latestRun, runHistory } from "@/lib/items/queries";

export const metadata = { title: "Item quality" };
export const dynamic = "force-dynamic";

const VERDICTS = ["urgent", "review", "ok", "not_analysed"] as const;

const VERDICT_LABEL: Record<string, string> = {
  urgent: "Needs attention",
  review: "Worth a look",
  ok: "Behaving",
  not_analysed: "Not enough data",
};

export default async function ItemQualityPage({
  searchParams,
}: {
  searchParams: Promise<{ verdict?: string }>;
}) {
  const { verdict } = await searchParams;
  const user = await requireSuperAdmin();

  const data = await withRequestContext(user, async (tx) => {
    const run = await latestRun(tx);
    return {
      run,
      items: run ? await itemsForRun(tx, run.id) : [],
      history: await runHistory(tx),
    };
  });

  const active = VERDICTS.find((v) => v === verdict) ?? null;
  const shown = active ? data.items.filter((i) => i.verdict === active) : data.items;

  return (
    <AppShell user={user}>
      <h1 className="mb-1 text-2xl font-semibold">Item quality</h1>
      <p className="mb-6 max-w-2xl text-sm text-ink-600">
        Every score this platform reports rests on the questions underneath it.
        This is what the responses say about those questions — which ones
        separate strong students from weak ones, and which are quietly adding
        noise.
      </p>

      {!data.run ? (
        <Empty>
          No analysis has been run yet. Run{" "}
          <code className="rounded bg-ink-100 px-1.5 py-0.5 text-xs">
            python analyse_items.py
          </code>{" "}
          in <code className="text-xs">services/parser</code>.
        </Empty>
      ) : (
        <>
          <div className="mb-4">
            <Alert tone="info">
              {data.run.message} Analysed{" "}
              {data.run.createdAt.toLocaleDateString("en-IN", {
                dateStyle: "medium",
              })}
              {data.run.trackName ? `, ${data.run.trackName} only` : ", whole bank"}.
              Papers flagged for fast completion are excluded, and each item is
              correlated against the <em>rest</em> of the paper rather than the
              total, so an item cannot inflate its own score.
            </Alert>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ["urgent", data.run.urgentCount, "Needs attention"],
                ["review", data.run.reviewCount, "Worth a look"],
                ["ok", data.run.okCount, "Behaving"],
                ["not_analysed", data.run.skippedCount, "Too few responses"],
              ] as const
            ).map(([key, count, label]) => (
              <Card key={key}>
                <p
                  className="text-2xl font-semibold tabular-nums"
                  data-testid={`item-count-${key}`}
                >
                  {count}
                </p>
                <p className="text-xs text-ink-600">{label}</p>
              </Card>
            ))}
          </div>

          <nav className="mb-5 flex flex-wrap gap-2">
            <a
              href="/admin/items"
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                active === null
                  ? "bg-brand-600 text-white"
                  : "border border-ink-200 text-ink-600 hover:bg-ink-100"
              }`}
            >
              All ({data.items.length})
            </a>
            {VERDICTS.map((v) => (
              <a
                key={v}
                href={`/admin/items?verdict=${v}`}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  active === v
                    ? "bg-brand-600 text-white"
                    : "border border-ink-200 text-ink-600 hover:bg-ink-100"
                }`}
              >
                {VERDICT_LABEL[v]}
              </a>
            ))}
          </nav>

          <SectionHeading
            title={`Items (${shown.length})`}
            hint="Worst first. Facility is the proportion answering correctly — confusingly, a high value means an easy item. Discrimination is the point-biserial correlation with the rest of the paper."
          />

          {shown.length === 0 ? (
            <Empty>No items with that verdict.</Empty>
          ) : (
            <div className="space-y-3">
              {shown.map((item) => (
                <ItemCard key={item.questionId} item={item} />
              ))}
            </div>
          )}

          {data.history.length > 1 ? (
            <>
              <SectionHeading
                title="Previous runs"
                hint="An item that was fine last term and is failing now is a different problem from one that never worked."
              />
              <Card className="overflow-x-auto p-0">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                      <th className="px-4 py-2 font-medium">Run</th>
                      <th className="px-4 py-2 font-medium">Scope</th>
                      <th className="px-4 py-2 text-right font-medium">Analysed</th>
                      <th className="px-4 py-2 text-right font-medium">Urgent</th>
                      <th className="px-4 py-2 text-right font-medium">Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.history.map((run) => (
                      <tr key={run.id} className="border-b border-ink-100 last:border-0">
                        <td className="px-4 py-2.5 text-ink-600">
                          {run.createdAt.toLocaleString("en-IN", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </td>
                        <td className="px-4 py-2.5 text-ink-600">
                          {run.trackName ?? "Whole bank"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {run.analysedCount}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {run.urgentCount}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {run.reviewCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          ) : null}
        </>
      )}
    </AppShell>
  );
}
