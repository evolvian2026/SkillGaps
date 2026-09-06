/**
 * Sentry's browser SDK is ~90 kB, and it would otherwise sit in the chunk
 * every page loads — a real cost for a student on a slow campus connection,
 * paid even by deployments with no DSN configured. Importing it dynamically
 * moves it into its own lazy chunk that is fetched only when monitoring is
 * actually switched on.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "development",
      tracesSampleRate: 0.1,
      // Assessment answers and student PII must never leave in a crash report.
      sendDefaultPii: false,
    });
  });
}

/**
 * Next.js calls this on client-side navigations. It has to be a synchronous
 * export, so it forwards to Sentry only once the lazy chunk has landed.
 */
export function onRouterTransitionStart(
  ...args: Parameters<
    typeof import("@sentry/nextjs").captureRouterTransitionStart
  >
) {
  if (!dsn) return;
  void import("@sentry/nextjs").then((Sentry) =>
    Sentry.captureRouterTransitionStart(...args),
  );
}
