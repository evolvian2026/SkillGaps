import "server-only";
import { jwtVerify } from "jose";
import { sql } from "drizzle-orm";
import { rawDb } from "@/lib/db/client";
import { serverEnv } from "@/lib/env";
import type { SessionUser, UserRole } from "./types";

/**
 * Supabase Auth provider.
 *
 * Supabase owns the credential lifecycle and issues the JWT. This module only
 * verifies that token and maps `sub` onto a row in our `users` table, which
 * remains the source of truth for tenant and role. Role therefore cannot be
 * escalated by tampering with app_metadata on the Supabase side.
 */
export async function readSupabaseSession(
  accessToken: string | undefined,
): Promise<SessionUser | null> {
  if (!accessToken) return null;

  const secret = serverEnv().SUPABASE_JWT_SECRET;
  if (!secret) return null;

  let sub: string;
  try {
    const { payload } = await jwtVerify(
      accessToken,
      new TextEncoder().encode(secret),
    );
    if (typeof payload.sub !== "string") return null;
    sub = payload.sub;
  } catch {
    return null;
  }

  const result = await rawDb().execute(
    sql`SELECT * FROM app.resolve_external_user(${sub})`,
  );
  const row = (result.rows as Record<string, unknown>[])[0];
  if (!row) return null;

  return {
    userId: row.user_id as string,
    tenantId: row.tenant_id as string,
    role: row.user_role as UserRole,
    email: row.email as string,
    fullName: row.full_name as string,
  };
}
