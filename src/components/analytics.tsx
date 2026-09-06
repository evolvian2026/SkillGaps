"use client";

import { useEffect } from "react";

/**
 * PostHog, loaded only when a key is configured and only after the page is
 * interactive — assessment funnel drop-off is worth measuring, but not at the
 * cost of blocking first paint on a slow campus connection.
 */
export function Analytics() {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key) return;

    let cancelled = false;
    const load = async () => {
      const posthog = (await import("posthog-js")).default;
      if (cancelled) return;
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://app.posthog.com",
        capture_pageview: true,
        persistence: "localStorage",
      });
    };

    // requestIdleCallback is unavailable on Safari; fall back to a timer.
    const idle = window.requestIdleCallback;
    if (typeof idle === "function") {
      const id = idle(() => void load());
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const timer = window.setTimeout(() => void load(), 1500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}

/** Fire a funnel event. No-ops when PostHog is not configured. */
export async function track(event: string, props?: Record<string, unknown>) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  const posthog = (await import("posthog-js")).default;
  posthog.capture(event, props);
}
