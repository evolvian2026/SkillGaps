import { isStaff, type UserRole } from "./types";

/**
 * Where a signed-in user belongs.
 *
 * Every guard sends a wrong-role visitor HERE rather than to another guarded
 * area. Redirecting to a different guard's page is how an infinite loop is
 * built: an employer bounced from /dashboard to /admin is bounced straight
 * back, and the browser gives up with ERR_TOO_MANY_REDIRECTS. Routing by the
 * caller's own role always terminates, because their home always admits them.
 *
 * Kept in its own leaf module — free of `next/navigation` and `server-only` —
 * so the guards, the login action and the tests can all share one definition.
 */
export function homeFor(role: UserRole): string {
  if (role === "employer") return "/employer";
  // A lecturer's home is their own classes, not the placement dashboard. The
  // placement office keeps /admin, which faculty can still reach for the
  // teaching-relevant pages.
  if (role === "faculty") return "/faculty";
  if (isStaff(role)) return "/admin";
  return "/dashboard";
}
