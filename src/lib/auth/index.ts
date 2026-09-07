import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverEnv } from "@/lib/env";
import { readSession } from "./session";
import { readSupabaseSession } from "./supabase";
import { isStaff, type SessionUser } from "./types";
import { homeFor } from "./routing";

export * from "./types";
export { homeFor } from "./routing";
export { SESSION_COOKIE, issueSession, clearSession } from "./session";

/**
 * The single place the app asks "who is calling?". Dispatches to whichever
 * provider is configured; everything downstream sees the same `SessionUser`.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (serverEnv().AUTH_PROVIDER === "supabase") {
    const jar = await cookies();
    // supabase-js stores the access token in a cookie named for the project ref.
    const tokenCookie = jar
      .getAll()
      .find((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
    return readSupabaseSession(tokenCookie?.value);
  }
  return readSession();
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireStudent(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "student") redirect(homeFor(user.role));
  return user;
}

/** Institution dashboard: faculty, TPO/admin and super-admin only. */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isStaff(user.role)) redirect(homeFor(user.role));
  return user;
}

/**
 * Placement-office surfaces: admin and super-admin, never faculty.
 *
 * `faculty` is inside `isStaff`, so before this existed a lecturer could
 * approve an employer's access to the cohort, resolve a DPDP data request, or
 * export every student's placement status. None of that is teaching, and none
 * of it is a lecturer's to decide. They keep the pages that are about their
 * students' learning and get `/faculty` as their home.
 */
export async function requirePlacementStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "super_admin") {
    redirect(homeFor(user.role));
  }
  return user;
}

/**
 * The faculty view.
 *
 * Open to the placement office too: an admin who also teaches should not need
 * a second account, and they can already see everything it shows.
 */
export async function requireTeachingStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isStaff(user.role)) redirect(homeFor(user.role));
  return user;
}

/**
 * Platform-owner surfaces: the question bank's own health.
 *
 * Narrower than `requireStaff` on purpose. Item statistics pool responses
 * across every institution, and they describe a bank a placement office
 * neither owns nor can edit — so a TPO landing here would be reading other
 * tenants' response behaviour and being told the scores they present are
 * built on a shaky item, with no way to act on either.
 */
export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "super_admin") redirect(homeFor(user.role));
  return user;
}

/**
 * Employer portal.
 *
 * Requires both the role and a resolved organisation: an employer user with no
 * `employerId` has no grants to key on, so every policy would deny them
 * anyway. Failing here makes that an explicit, debuggable state rather than a
 * confusing empty portal.
 */
export async function requireEmployer(): Promise<
  SessionUser & { employerId: string }
> {
  const user = await requireUser();
  // An employer user with no organisation has no grants to key on, so every
  // policy would deny them anyway. Sending them to /login makes that an
  // explicit state rather than a confusing empty portal.
  if (user.role === "employer" && !user.employerId) redirect("/login");
  if (user.role !== "employer") redirect(homeFor(user.role));
  return user as SessionUser & { employerId: string };
}
