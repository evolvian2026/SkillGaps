"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * All Recharts usage lives in this file and is loaded through next/dynamic by
 * its callers, so the charting bundle never blocks first paint. Everything
 * else on the report and dashboard pages is server-rendered.
 */

/** Recharts hands formatters a loosely-typed value; normalise it once here. */
function asPercent(value: unknown): string {
  return typeof value === "number" ? `${value}%` : "not set";
}

// Animation is off throughout: it costs frames on the low-end Android devices
// many students use, and adds nothing to a static diagnostic report.
const AXIS = { fontSize: 11, fill: "#4a5468" };
const GOOD = "#14895a";
const RISK = "#c2410c";
const WARN = "#b7791f";
const BRAND = "#2f6bff";

function toneFor(percent: number, bar: number | null): string {
  if (bar === null) return BRAND;
  if (percent >= bar) return GOOD;
  return bar - percent >= 15 ? RISK : WARN;
}

/**
 * Draws the hiring bar for one row as a notch on the plot, positioned from the
 * row's own bar value. Rendered as a zero-fill Bar so Recharts supplies the
 * correct x-scale for that row.
 */
function HiringBarMarker(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  value?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, value } = props;
  if (value === null || value === undefined || width <= 0) return null;
  const tickX = x + width;
  return (
    <g>
      <line
        x1={tickX}
        x2={tickX}
        y1={y - 3}
        y2={y + height + 3}
        stroke="#151b26"
        strokeWidth={2}
        strokeDasharray="3 2"
      />
    </g>
  );
}

export interface SkillDatum {
  name: string;
  percent: number;
  hiringBar: number | null;
}

/** Score per skill area against that area's hiring bar. */
export function SkillGapChart({ data }: { data: SkillDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 46)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} stroke="#eceef2" />
        <XAxis type="number" domain={[0, 100]} unit="%" tick={AXIS} />
        <YAxis type="category" dataKey="name" width={132} tick={AXIS} />
        <Tooltip
          cursor={{ fill: "#f6f7f9" }}
          formatter={(value, key) => [
            asPercent(value),
            key === "percent" ? "Your score" : "Hiring bar (provisional)",
          ]}
        />
        <Bar
          dataKey="percent"
          radius={[0, 4, 4, 0]}
          barSize={18}
          isAnimationActive={false}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={toneFor(d.percent, d.hiringBar)} />
          ))}
        </Bar>
        {/* Each area has its own bar, so the marker is drawn per row rather
            than as a single chart-wide ReferenceLine. */}
        <Bar
          dataKey="hiringBar"
          barSize={18}
          shape={<HiringBarMarker />}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export interface TrendDatum {
  label: string;
  percent: number;
}

export function TrendChart({ data }: { data: TrendDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: 0, right: 16, top: 8 }}>
        <CartesianGrid stroke="#eceef2" />
        <XAxis dataKey="label" tick={AXIS} />
        <YAxis domain={[0, 100]} unit="%" tick={AXIS} width={44} />
        <Tooltip formatter={(value) => [asPercent(value), "Overall score"]} />
        <Line
          type="monotone"
          dataKey="percent"
          stroke={BRAND}
          strokeWidth={2}
          dot={{ r: 3 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export interface CohortDatum {
  name: string;
  average: number;
  hiringBar: number | null;
}

/** Cohort-wide average per skill area, weakest first. */
export function CohortChart({ data }: { data: CohortDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(240, data.length * 44)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24 }}>
        <CartesianGrid horizontal={false} stroke="#eceef2" />
        <XAxis type="number" domain={[0, 100]} unit="%" tick={AXIS} />
        <YAxis type="category" dataKey="name" width={140} tick={AXIS} />
        <Tooltip
          cursor={{ fill: "#f6f7f9" }}
          formatter={(value) => [asPercent(value), "Cohort average"]}
        />
        <Bar
          dataKey="average"
          radius={[0, 4, 4, 0]}
          barSize={16}
          isAnimationActive={false}
        >
          {data.map((d, i) => (
            <Cell key={i} fill={toneFor(d.average, d.hiringBar)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
