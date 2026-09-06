import type { SkillAreaAggregate } from "@/lib/admin/cohort";

/**
 * Cohort heatmap. Pure server-rendered CSS grid rather than a charting
 * component — it carries the same information at zero client JS cost.
 */
function cellTone(average: number, bar: number | null): string {
  if (bar === null) {
    if (average >= 70) return "bg-good-100 text-good-500";
    if (average >= 50) return "bg-warn-100 text-warn-500";
    return "bg-risk-100 text-risk-500";
  }
  const gap = bar - average;
  if (gap <= 0) return "bg-good-100 text-good-500";
  if (gap <= 10) return "bg-warn-100 text-warn-500";
  return "bg-risk-100 text-risk-500";
}

export function CohortHeatmap({ areas }: { areas: SkillAreaAggregate[] }) {
  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {areas.map((area) => (
          <div
            key={area.skillAreaId}
            className={`rounded-lg p-3.5 ${cellTone(area.average, area.hiringBarPercent)}`}
          >
            <p className="text-sm font-semibold">{area.name}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{area.average}%</p>
            <p className="mt-0.5 text-xs opacity-80">
              {area.hiringBarPercent === null
                ? "bars vary by track"
                : `bar ${area.hiringBarPercent}%`}{" "}
              · {area.belowBarCount}/{area.studentCount} below their bar
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-4 text-xs text-ink-600">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-good-100" /> at or above bar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-warn-100" /> within 10 points
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-risk-100" /> more than 10 below
        </span>
      </p>
    </div>
  );
}
