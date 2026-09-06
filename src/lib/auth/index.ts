import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { serverEnv } from "@/lib/env";
import { readSession } from "./session";
import { readSupabaseSession } from "./supabase";
import { isStaff, type SessionUser } from "./types";

export * from "./types";
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
  if (user.role !== "student") redirect("/admin");
  return user;
}

/** Institution dashboard: faculty, TPO/admin and super-admin only. */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (!isStaff(user.role)) redirect("/dashboard");
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
  if (user.role !== "employer" || !user.employerId) redirect("/login");
  return user as SessionUser & { employerId: string };
}
