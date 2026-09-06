"use client";

import dynamic from "next/dynamic";

/**
 * Recharts is by far the heaviest dependency in the app. Loading it lazily and
 * client-side only keeps it off the critical path for a student on a slow
 * connection — the page is readable before the chart arrives.
 */
const loading = () => (
  <div className="h-[240px] animate-pulse rounded-lg bg-ink-100" aria-hidden />
);

export const SkillGapChart = dynamic(
  () => import("./charts").then((m) => m.SkillGapChart),
  { ssr: false, loading },
);

export const TrendChart = dynamic(
  () => import("./charts").then((m) => m.TrendChart),
  { ssr: false, loading },
);

export const CohortChart = dynamic(
  () => import("./charts").then((m) => m.CohortChart),
  { ssr: false, loading },
);
