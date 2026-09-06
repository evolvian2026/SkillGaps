import { z } from "zod";

/**
 * Server-side environment. Parsed lazily so that importing this module from a
 * client component boundary (which would have no access to these values) fails
 * loudly at call time rather than silently producing `undefined`.
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  MIGRATION_DATABASE_URL: z.string().optional(),
  AUTH_PROVIDER: z.enum(["local", "supabase"]).default("local"),
  AUTH_SESSION_SECRET: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  JUDGE0_URL: z.string().optional(),
  JUDGE0_API_KEY: z.string().optional(),
  JUDGE0_API_HOST: z.string().optional(),
  SENTRY_ENVIRONMENT: z.string().default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server environment:\n${issues}`);
  }
  if (parsed.data.AUTH_PROVIDER === "local" && !parsed.data.AUTH_SESSION_SECRET) {
    throw new Error("AUTH_SESSION_SECRET is required when AUTH_PROVIDER=local");
  }
  if (parsed.data.AUTH_PROVIDER === "supabase" && !parsed.data.SUPABASE_JWT_SECRET) {
    throw new Error("SUPABASE_JWT_SECRET is required when AUTH_PROVIDER=supabase");
  }
  cached = parsed.data;
  return cached;
}

/** Judge0 is optional; coding questions degrade to "store, do not run". */
export function judge0Config() {
  const env = serverEnv();
  if (!env.JUDGE0_URL) return null;
  return {
    url: env.JUDGE0_URL.replace(/\/+$/, ""),
    apiKey: env.JUDGE0_API_KEY,
    apiHost: env.JUDGE0_API_HOST,
  };
}
