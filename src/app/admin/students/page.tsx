import { AppShell } from "@/components/app-shell";
import { CohortFiltersForm } from "@/components/cohort-filters";
import { ButtonLink, Card, Empty, SectionHeading } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { withRequestContext } from "@/lib/db/client";
import { loadFilterOptions, loadStudentRows, type StudentRow } from "@/lib/admin/cohort";
import { filtersToQuery, parseCohortFilters } from "@/lib/admin/filters";

export const metadata = { title: "Students" };
export const dynamic = "force-dynamic";

type SortKey = "name" | "score" | "attempts" | "branch";

/**
 * Sorting is done here rather than in SQL because the page already holds the
 * full filtered set, which for a single college is hundreds of rows, not
 * millions. Revisit if a tenant ever gets large enough for that to matter.
 */
function sortRows(rows: StudentRow[], key: SortKey, dir: "asc" | "desc"): StudentRow[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    switch (key) {
      case "score": {
        // Unassessed students sort last regardless of direction — they are a
        // separate follow-up, not the bottom of the score distribution.
        if (a.latestPercent === null && b.latestPercent === null) return 0;
        if (a.latestPercent === null) return 1;
        if (b.latestPercent === null) return -1;
        return (a.latestPercent - b.latestPercent) * factor;
      }
      case "attempts":
        return (a.attemptCount - b.attemptCount) * factor;
      case "branch":
        return (a.branch ?? "").localeCompare(b.branch ?? "") * factor;
      default:
        return a.fullName.localeCompare(b.fullName) * factor;
    }
  });
}

function SortLink({
  label,
  column,
  current,
  dir,
  query,
}: {
  label: string;
  column: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  query: string;
}) {
  const nextDir = current === column && dir === "asc" ? "desc" : "asc";
  const params = new URLSearchParams(query.replace(/^\?/, ""));
  params.set("sort", column);
  params.set("dir", nextDir);
  return (
    <a href={`?${params.toString()}`} className="hover:text-ink-900">
      {label}
      {current === column ? (dir === "asc" ? " ↑" : " ↓") : ""}
    </a>
  );
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireStaff();
  const resolved = await searchParams;
  const filters = parseCohortFilters(resolved);

  const sortParam = Array.isArray(resolved.sort) ? resolved.sort[0] : resolved.sort;
  const dirParam = Array.isArray(resolved.dir) ? resolved.dir[0] : resolved.dir;
  const sort: SortKey = (["name", "score", "attempts", "branch"] as const).includes(
    sortParam as SortKey,
  )
    ? (sortParam as SortKey)
    : "name";
  const dir: "asc" | "desc" = dirParam === "desc" ? "desc" : "asc";

  const data = await withRequestContext(user, async (tx) => ({
    options: await loadFilterOptions(tx),
    rows: await loadStudentRows(tx, filters),
  }));

  const rows = sortRows(data.rows, sort, dir);
  const query = filtersToQuery(filters);

  return (
    <AppShell user={user}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Students</h1>
          <p className="mt-1 text-sm text-ink-600">
            Latest result per student. This view is read-only — student records
            cannot be edited here.
          </p>
        </div>
        <ButtonLink variant="secondary" href={`/api/admin/export${query}`} prefetch={false}>
          Export CSV
        </ButtonLink>
      </div>

      <Card className="mb-6">
        <CohortFiltersForm options={data.options} current={filters} action="/admin/students" />
      </Card>

      <SectionHeading title={`${rows.length} students`} />
      {rows.length === 0 ? (
        <Empty>No students match this filter.</Empty>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-xs uppercase tracking-wide text-ink-400">
                <th className="px-5 py-3 font-medium">
                  <SortLink label="Name" column="name" current={sort} dir={dir} query={query} />
                </th>
                <th className="px-5 py-3 font-medium">Roll no.</th>
                <th className="px-5 py-3 font-medium">
                  <SortLink label="Branch" column="branch" current={sort} dir={dir} query={query} />
                </th>
                <th className="px-5 py-3 font-medium">Batch</th>
                <th className="px-5 py-3 font-medium">Latest track</th>
                <th className="px-5 py-3 text-right font-medium">
                  <SortLink label="Score" column="score" current={sort} dir={dir} query={query} />
                </th>
                <th className="px-5 py-3 text-right font-medium">
                  <SortLink
                    label="Attempts"
                    column="attempts"
                    current={sort}
                    dir={dir}
                    query={query}
                  />
                </th>
                <th className="px-5 py-3 text-right font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.userId} className="border-b border-ink-100 last:border-0">
                  <td className="px-5 py-3">
                    <span className="font-medium text-ink-800">{row.fullName}</span>
                    <span className="block text-xs text-ink-600">{row.email}</span>
                  </td>
                  <td className="px-5 py-3 text-ink-600">{row.rollNumber ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-600">
                    {row.branch ?? "—"}
                    {row.section ? ` · ${row.section}` : ""}
                  </td>
                  <td className="px-5 py-3 text-ink-600">{row.batchYear ?? "—"}</td>
                  <td className="px-5 py-3 text-ink-600">{row.latestTrack ?? "—"}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {row.latestPercent === null ? (
                      <span className="text-ink-400">not assessed</span>
                    ) : (
                      `${row.latestPercent}%`
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-ink-600">
                    {row.attemptCount}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {row.flaggedAttempts > 0 ? (
                      <span className="rounded-full bg-warn-100 px-2 py-0.5 text-xs font-semibold text-warn-500">
                        {row.flaggedAttempts}
                      </span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}
