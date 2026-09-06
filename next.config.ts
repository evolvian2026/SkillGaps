import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // BullMQ and the Postgres driver are server-only and ship optional native
  // dependencies (Valkey, pg-native) that the bundler should not try to
  // resolve. Leaving them external also keeps them out of the client graph.
  serverExternalPackages: ["bullmq", "ioredis", "pg"],
};

export default nextConfig;
