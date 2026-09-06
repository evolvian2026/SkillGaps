import { execFileSync } from "node:child_process";

/**
 * Reseed before every run.
 *
 * The employer journey starts from a *pending* access request and ends with a
 * revoked one, so a second run against the leftovers of the first would assert
 * against the wrong state. The seed truncates everything it owns, which makes
 * the whole suite repeatable rather than only correct the first time.
 *
 * Set E2E_SKIP_SEED=1 to run against a database you are preparing yourself.
 */
export default function globalSetup(): void {
  if (process.env.E2E_SKIP_SEED === "1") return;
  execFileSync("npm", ["run", "db:seed"], { stdio: "inherit" });
}
