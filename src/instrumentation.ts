import * as Sentry from "@sentry/nextjs";

/**
 * Sentry is initialised only when a DSN is configured, so a pilot deployment
 * without one runs clean rather than erroring on startup.
 */
export function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? "development",
    tracesSampleRate: 0.1,
    // Assessment answers and student PII must never leave the platform in a
    // crash report.
    sendDefaultPii: false,
  });
}

export const onRequestError = Sentry.captureRequestError;
