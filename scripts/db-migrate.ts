import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { migrationUrl } from "./_bootstrap";

/**
 * Applies generated Drizzle migrations, then the hand-written SQL in
 * drizzle/sql (RLS policies, helper functions) which drizzle-kit cannot
 * express. Both run as the owner role.
 */
async function main() {
  const client = new Client({ connectionString: migrationUrl() });
  await client.connect();
  try {
    const generatedDir = path.join(process.cwd(), "drizzle");
    const generated = (await readdir(generatedDir))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of generated) {
      const body = await readFile(path.join(generatedDir, file), "utf8");
      // drizzle-kit separates independent statements with this marker.
      const statements = body
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const statement of statements) {
        await client.query(statement);
      }
      console.log(`applied ${file}`);
    }

    const sqlDir = path.join(generatedDir, "sql");
    const manual = (await readdir(sqlDir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of manual) {
      await client.query(await readFile(path.join(sqlDir, file), "utf8"));
      console.log(`applied sql/${file}`);
    }
    console.log("migrations complete");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
