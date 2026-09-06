import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Small shared primitives. Server-rendered — none of this ships JS. */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-ink-200 bg-white p-5 shadow-[0_1px_2px_rgba(21,27,38,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionHeading({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
        {hint ? <p className="mt-1 text-sm text-ink-600">{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";

const variants = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary: "border border-ink-200 bg-white text-ink-800 hover:bg-ink-50",
  danger: "border border-risk-500 text-risk-500 hover:bg-risk-100",
} as const;

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof variants }) {
  return (
    <button {...props} className={`${buttonBase} ${variants[variant]} ${className}`} />
  );
}

export function ButtonLink({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof variants }) {
  return <Link {...props} className={`${buttonBase} ${variants[variant]} ${className}`} />;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-800">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs text-ink-600">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

export function Alert({
  tone = "error",
  children,
}: {
  tone?: "error" | "info" | "success";
  children: ReactNode;
}) {
  const tones = {
    error: "border-risk-500/30 bg-risk-100 text-risk-500",
    info: "border-brand-500/25 bg-brand-50 text-brand-700",
    success: "border-good-500/30 bg-good-100 text-good-500",
  } as const;
  return (
    <div className={`rounded-lg border px-3.5 py-3 text-sm ${tones[tone]}`} role="status">
      {children}
    </div>
  );
}

/**
 * Benchmarks are not validated against real placement outcomes until Phase 3
 * calibration. Every surface that shows a hiring bar carries this label so it
 * is never read as established fact.
 */
export function ProvisionalBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-warn-500/30 bg-warn-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-warn-500 ${className}`}
      title="Hiring-bar benchmarks are provisional estimates, not yet validated against real placement outcomes."
    >
      Provisional benchmark
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-ink-200 px-4 py-8 text-center text-sm text-ink-600">
      {children}
    </p>
  );
}
