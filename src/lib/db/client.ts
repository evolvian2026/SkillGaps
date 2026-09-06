import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import { serverEnv } from "@/lib/env";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  // Reuse the pool across dev hot-reloads instead of leaking connections.
  var __skillgapsPool: Pool | undefined;
}

function pool(): Pool {
  if (!globalThis.__skillgapsPool) {
    globalThis.__skillgapsPool = new Pool({
      connectionString: serverEnv().DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return globalThis.__skillgapsPool;
}

/** Unscoped handle. Only valid for pre-identity calls into `app.*` functions. */
export function rawDb(): Db {
  return drizzle(pool(), { schema });
}

export interface RequestContext {
  userId: string;
  tenantId: string;
  role: string;
  /** Employer users only; drives every employer RLS policy. */
  employerId?: string | null;
}

/**
 * Runs `fn` inside a transaction whose identity GUCs are set for RLS.
 *
 * `set_config(..., true)` scopes the values to the transaction, so a pooled
 * connection handed to the next request never carries the previous request's
 * tenant. Every query that touches tenant data must go through here.
 */
export async function withRequestContext<T>(
  ctx: RequestContext,
  fn: (tx: Db) => Promise<T>,
): Promise<T> {
  const db = drizzle(pool(), { schema });
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT
        set_config('app.user_id',     ${ctx.userId}::text,             true),
        set_config('app.tenant_id',   ${ctx.tenantId}::text,           true),
        set_config('app.user_role',   ${ctx.role}::text,               true),
        set_config('app.employer_id', ${ctx.employerId ?? ""}::text,   true)
    `);
    return fn(tx as unknown as Db);
  });
}

export { schema };
