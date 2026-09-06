import type { CohortFilters, FilterOptions } from "@/lib/admin/cohort";

/**
 * Filters as a plain GET form: no client JS, and the resulting URL is
 * shareable and bookmarkable, which is what a TPO actually wants when passing
 * a view to a colleague.
 */
export function CohortFiltersForm({
  options,
  current,
  action = "/admin",
}: {
  options: FilterOptions;
  current: CohortFilters;
  action?: string;
}) {
  const select =
    "rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none focus:border-brand-500";

  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Track</span>
        <select name="trackId" defaultValue={current.trackId ?? ""} className={select}>
          <option value="">All tracks</option>
          {options.tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Branch</span>
        <select name="branch" defaultValue={current.branch ?? ""} className={select}>
          <option value="">All branches</option>
          {options.branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Section</span>
        <select name="section" defaultValue={current.section ?? ""} className={select}>
          <option value="">All sections</option>
          {options.sections.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Batch</span>
        <select
          name="batchYear"
          defaultValue={current.batchYear ? String(current.batchYear) : ""}
          className={select}
        >
          <option value="">All batches</option>
          {options.batchYears.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
      >
        Apply
      </button>
    </form>
  );
}
