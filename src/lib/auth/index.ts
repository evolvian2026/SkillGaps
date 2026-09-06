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
