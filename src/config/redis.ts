import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: Redis };

/**
 * Shared Redis client, or null when REDIS_URL is not set (caching is then skipped).
 * Tuned to fail fast: short connect and command timeouts, so a slow or down Redis
 * never makes a page wait more than a fraction of a second.
 */
export function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;

  if (!globalForRedis.redis) {
    const client = new Redis(url, {
      connectTimeout: 1_000,
      commandTimeout: 300,
      maxRetriesPerRequest: 1,
    });
    client.on("error", (error) => console.error("Redis error:", error.message));
    globalForRedis.redis = client;
  }
  return globalForRedis.redis;
}
