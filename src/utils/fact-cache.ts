import { createHash } from "node:crypto";
import { getRedis } from "@/config/redis";

/** A fact stays cached for 60 seconds; Redis expires the key itself (no timestamp math). */
export const FACT_CACHE_TTL_SECONDS = 60;

export type CachedFact = { content: string; createdAt: string };

/** One key per user + movie, so changing the movie never returns the old movie's fact. */
function cacheKey(userId: string, movie: string) {
  const movieHash = createHash("sha256").update(movie).digest("hex").slice(0, 16);
  return `fact:${userId}:${movieHash}`;
}

/** Single GET. Any Redis problem counts as a cache miss so the request still works. */
export async function readCachedFact(userId: string, movie: string): Promise<CachedFact | null> {
  try {
    const raw = await getRedis()?.get(cacheKey(userId, movie));
    return raw ? (JSON.parse(raw) as CachedFact) : null;
  } catch (error) {
    console.error("Fact cache read failed:", error);
    return null;
  }
}

/** Single SET with a 60s TTL. Failures are logged and ignored; the fact is already in Postgres. */
export async function writeCachedFact(userId: string, movie: string, fact: CachedFact) {
  try {
    await getRedis()?.set(cacheKey(userId, movie), JSON.stringify(fact), "EX", FACT_CACHE_TTL_SECONDS);
  } catch (error) {
    console.error("Fact cache write failed:", error);
  }
}
