import { sql } from "drizzle-orm";
import { rawDb, withRequestContext, type Db } from "@/lib/db/client";

/**
 * Runs a job under the RLS context of the student it acts for.
 *
 * The worker connects as the same non-BYPASSRLS role as the web app, so a job
 * is bound by exactly the policies that student's own request would be. A bug
 * in a job therefore cannot reach another tenant's data — the same guarantee
 * the request path has, rather than a privileged back door around it.
 */
export async function withJobContext<T>(
  userId: string,
  fn: (tx: Db, ctx: { userId: string; tenantId: string; role: string }) => Promise<T>,
): Promise<T> {
  const result = await rawDb().execute(
    sql`SELECT * FROM app.job_context(${userId}::uuid)`,
  );
  const row = (result.rows as Record<string, unknown>[])[0];
  if (!row) {
    throw new Error(`No active user ${userId}; job cannot run.`);
  }

  const ctx = {
    userId: row.user_id as string,
    tenantId: row.tenant_id as string,
    role: row.user_role as string,
    employerId: (row.employer_id as string | null) ?? null,
  };
  return withRequestContext(ctx, (tx) => fn(tx, ctx));
}
