import { createHash, randomUUID } from "node:crypto";
import { getRedis } from "@/config/redis";

/** A fact stays cached for 60 seconds; Redis expires the key itself (no timestamp math). */
export const FACT_CACHE_TTL_SECONDS = 60;

/** The lock outlives one OpenAI call (8s timeout) but still frees itself if the server crashes. */
const LOCK_TTL_MS = 15_000;
/** How long a request waits for another request's fact before giving up. */
const WAIT_FOR_OTHER_MS = 10_000;
const POLL_INTERVAL_MS = 200;

export type CachedFact = { content: string; createdAt: string };

/** One key per user + movie, so changing the movie never returns the old movie's fact. */
function keySuffix(userId: string, movie: string) {
  const movieHash = createHash("sha256").update(movie).digest("hex").slice(0, 16);
  return `${userId}:${movieHash}`;
}

const cacheKey = (userId: string, movie: string) => `fact:${keySuffix(userId, movie)}`;
const lockKey = (userId: string, movie: string) => `lock:fact:${keySuffix(userId, movie)}`;

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

// ---- "Generation in progress" lock ----------------------------------------------------------

export type GenerationLock =
  | { status: "acquired"; key: string; token: string }
  | { status: "busy" } // another request is generating this fact right now
  | { status: "unavailable" }; // Redis is down or not configured: proceed without a lock

/** SET NX PX: succeeds only if nobody holds the lock. The expiry prevents a stuck lock. */
export async function acquireGenerationLock(userId: string, movie: string): Promise<GenerationLock> {
  const redis = getRedis();
  if (!redis) return { status: "unavailable" };

  const key = lockKey(userId, movie);
  const token = randomUUID();
  try {
    const result = await redis.set(key, token, "PX", LOCK_TTL_MS, "NX");
    return result === "OK" ? { status: "acquired", key, token } : { status: "busy" };
  } catch (error) {
    console.error("Fact lock failed:", error);
    return { status: "unavailable" };
  }
}

// Delete the lock only if we still own it (it may have expired and been taken by someone else).
const RELEASE_SCRIPT =
  'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';

export async function releaseGenerationLock(lock: GenerationLock) {
  if (lock.status !== "acquired") return;
  try {
    await getRedis()?.eval(RELEASE_SCRIPT, 1, lock.key, lock.token);
  } catch (error) {
    console.error("Fact lock release failed:", error); // it will expire on its own
  }
}

/**
 * Called by a request that lost the lock race: poll until the winner's fact appears in the cache.
 * Stops early if the winner finished without caching anything (e.g. OpenAI failed).
 */
export async function waitForCachedFact(userId: string, movie: string): Promise<CachedFact | null> {
  const deadline = Date.now() + WAIT_FOR_OTHER_MS;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const fact = await readCachedFact(userId, movie);
    if (fact) return fact;

    const stillGenerating = await getRedis()?.exists(lockKey(userId, movie)).catch(() => 0);
    if (!stillGenerating) return readCachedFact(userId, movie);
  }
  return null;
}
