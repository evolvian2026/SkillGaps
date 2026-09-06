import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next.js resolves this at build time; it has no runtime meaning here.
      "server-only": path.resolve(__dirname, "./src/lib/shims/server-only.ts"),
    },
  },
});
