/**
 * Stub for Next.js's `server-only` marker.
 *
 * `server-only` exists to make importing a server module from a client
 * component a build error. It has no runtime behaviour, and its real package
 * throws outside Next's `react-server` condition — which would break the
 * background worker and the test runner, both of which legitimately run these
 * modules in plain Node.
 *
 * Only `tsconfig.worker.json` and the Vitest config map the specifier here;
 * `next build` still resolves the real package, so the guard is intact where
 * it matters.
 */
export {};
