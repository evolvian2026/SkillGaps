import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { rawDb } from "@/lib/db/client";
import type { SessionUser, UserRole } from "./types";

export const SESSION_COOKIE = "sg_session";
const SESSION_TTL_DAYS = 14;

/** Cookies carry the raw token; the database stores only its SHA-256. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await rawDb().execute(
    sql`SELECT app.create_session(${userId}::uuid, ${hashToken(token)}, ${expiresAt.toISOString()}::timestamptz)`,
  );

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await rawDb().execute(sql`SELECT app.destroy_session(${hashToken(token)})`);
  }
  jar.delete(SESSION_COOKIE);
}

export async function readSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const result = await rawDb().execute(
    sql`SELECT * FROM app.resolve_session(${hashToken(token)})`,
  );
  const row = (result.rows as Record<string, unknown>[])[0];
  if (!row) return null;

  return {
    userId: row.user_id as string,
    tenantId: row.tenant_id as string,
    role: row.user_role as UserRole,
    email: row.email as string,
    fullName: row.full_name as string,
    employerId: (row.employer_id as string | null) ?? null,
  };
}
