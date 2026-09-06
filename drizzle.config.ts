import "dotenv/config";
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Schema changes run as the owner, never as the RLS-bound app role.
    url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL!,
  },
} satisfies Config;
