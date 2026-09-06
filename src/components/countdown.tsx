"use client";

import { useEffect, useState } from "react";

function format(seconds: number): string {
  const s = Math.max(0, seconds);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Display-only countdown. The deadline is enforced server-side on save and
 * submit; this just tells the student where they stand.
 */
export function Countdown({
  expiresAtIso,
  onExpire,
}: {
  expiresAtIso: string;
  onExpire: () => void;
}) {
  const deadline = new Date(expiresAtIso).getTime();
  const [remaining, setRemaining] = useState(() =>
    Math.round((deadline - Date.now()) / 1000),
  );

  useEffect(() => {
    const tick = () => {
      const next = Math.round((deadline - Date.now()) / 1000);
      setRemaining(next);
      if (next <= 0) onExpire();
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [deadline, onExpire]);

  const urgent = remaining <= 120;
  return (
    <div
      role="timer"
      aria-live={urgent ? "assertive" : "off"}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums ${
        urgent ? "bg-risk-100 text-risk-500" : "bg-ink-100 text-ink-800"
      }`}
    >
      {format(remaining)} left
    </div>
  );
}
