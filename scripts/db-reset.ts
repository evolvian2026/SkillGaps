import { Client } from "pg";
import { migrationUrl } from "./_bootstrap";

/** Drops and recreates the public + app schemas. Development only. */
async function main() {
  const client = new Client({ connectionString: migrationUrl() });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS app CASCADE");
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
    await client.query("GRANT USAGE ON SCHEMA public TO skillgaps_app");
    console.log("schema reset");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
