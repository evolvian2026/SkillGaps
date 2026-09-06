import { config } from "dotenv";

// Scripts run outside Next.js, which would otherwise load these for us.
config({ path: ".env.local" });
config({ path: ".env" });

export function migrationUrl(): string {
  const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL must be set");
  return url;
}
