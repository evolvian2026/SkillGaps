import type { CohortFilters } from "./cohort";

/** Parse cohort filters out of a search-params object or URLSearchParams. */
export function parseCohortFilters(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
): CohortFilters {
  const get = (key: string): string | undefined => {
    if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const batchYear = Number(get("batchYear"));
  return {
    trackId: get("trackId") || undefined,
    branch: get("branch") || undefined,
    section: get("section") || undefined,
    batchYear: Number.isInteger(batchYear) && batchYear > 1900 ? batchYear : undefined,
  };
}

export function filtersToQuery(filters: CohortFilters): string {
  const params = new URLSearchParams();
  if (filters.trackId) params.set("trackId", filters.trackId);
  if (filters.branch) params.set("branch", filters.branch);
  if (filters.section) params.set("section", filters.section);
  if (filters.batchYear) params.set("batchYear", String(filters.batchYear));
  const query = params.toString();
  return query ? `?${query}` : "";
}
