import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { migrationUrl } from "./_bootstrap";

/**
 * Applies generated Drizzle migrations, then the hand-written SQL in
 * drizzle/sql (RLS policies, helper functions) which drizzle-kit cannot
 * express. Both run as the owner role.
 *
 * Applied files are recorded in `schema_migrations` so re-running is a no-op
 * rather than an error. The recorded checksum catches a migration edited after
 * it was applied, which otherwise diverges environments silently.
 */

const TRACKING_TABLE = `
  CREATE TABLE IF NOT EXISTS public.schema_migrations (
    filename    text PRIMARY KEY,
    checksum    text NOT NULL,
    applied_at  timestamptz NOT NULL DEFAULT now()
  )
`;

function checksum(body: string): string {
  return createHash("sha256").update(body).digest("hex").slice(0, 16);
}

async function collect(dir: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(dir);
  return entries
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => prefix + f);
}

async function main() {
  const client = new Client({ connectionString: migrationUrl() });
  await client.connect();

  try {
    await client.query(TRACKING_TABLE);
    const { rows: applied } = await client.query<{
      filename: string;
      checksum: string;
    }>("SELECT filename, checksum FROM public.schema_migrations");
    const appliedBy = new Map(applied.map((r) => [r.filename, r.checksum]));

    const root = path.join(process.cwd(), "drizzle");
    const files = [
      ...(await collect(root)),
      ...(await collect(path.join(root, "sql"), "sql/")),
    ];

    let ran = 0;
    for (const file of files) {
      const body = await readFile(path.join(root, file), "utf8");
      const sum = checksum(body);
      const previous = appliedBy.get(file);

      if (previous) {
        if (previous !== sum) {
          throw new Error(
            `${file} was modified after it was applied (checksum ${previous} -> ${sum}). ` +
              `Add a new migration instead of editing an applied one.`,
          );
        }
        continue;
      }

      // Generated migrations separate independent statements with this marker;
      // hand-written files are executed whole so that DO blocks and functions
      // containing semicolons survive intact.
      const statements = file.startsWith("sql/")
        ? [body]
        : body
            .split("--> statement-breakpoint")
            .map((s) => s.trim())
            .filter(Boolean);

      await client.query("BEGIN");
      try {
        for (const statement of statements) await client.query(statement);
        await client.query(
          "INSERT INTO public.schema_migrations (filename, checksum) VALUES ($1,$2)",
          [file, sum],
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`${file} failed: ${(err as Error).message}`);
      }

      console.log(`applied ${file}`);
      ran++;
    }

    console.log(ran === 0 ? "already up to date" : `migrations complete (${ran} applied)`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
