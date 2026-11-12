import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeRedis } from "./fake-redis";

// ---- Mocks: Prisma (in-memory table), OpenAI (spy), Redis (fake) ----
const db = vi.hoisted(() => ({
  facts: [] as { id: number; userId: string; movie: string; content: string; createdAt: Date }[],
}));
const createCompletion = vi.hoisted(() => vi.fn());

vi.mock("@/config/prisma", () => ({
  prisma: {
    fact: {
      create: async ({ data }: { data: { userId: string; movie: string; content: string } }) => {
        const row = { id: db.facts.length + 1, ...data, createdAt: new Date() };
        db.facts.push(row);
        return row;
      },
      findFirst: async ({ where }: { where: { userId: string; movie: string } }) =>
        [...db.facts]
          .filter((f) => f.userId === where.userId && f.movie === where.movie)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
    },
  },
}));
vi.mock("@/config/openai", () => ({
  openai: { chat: { completions: { create: createCompletion } } },
  OPENAI_MODEL: "test-model",
}));
vi.mock("@/config/redis", () => import("./fake-redis").then((m) => ({ getRedis: () => m.fakeRedis })));

import { FactGenerationError, getFact } from "@/utils/facts";

let factCounter = 0;
const openAiReplies = (delayMs = 0) =>
  createCompletion.mockImplementation(async () => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { choices: [{ message: { content: `Fact #${++factCounter}` } }] };
  });

beforeEach(() => {
  db.facts.length = 0;
  fakeRedis.reset();
  createCompletion.mockReset();
  factCounter = 0;
  vi.useFakeTimers({ toFake: ["Date"] }); // control the clock (Redis TTL) but keep real setTimeout
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const advanceSeconds = (s: number) => vi.setSystemTime(Date.now() + s * 1000);

describe("60-second cache window", () => {
  it("generates and stores a fact on the first request", async () => {
    openAiReplies();
    const result = await getFact("user-a", "Heat");

    expect(result).toMatchObject({ content: "Fact #1", source: "generated" });
    expect(db.facts).toHaveLength(1);
  });

  it("returns the cached fact when it is under 60 seconds old", async () => {
    openAiReplies();
    await getFact("user-a", "Heat");
    advanceSeconds(59);
    const result = await getFact("user-a", "Heat");

    expect(result).toMatchObject({ content: "Fact #1", source: "cache" });
    expect(createCompletion).toHaveBeenCalledTimes(1);
  });

  it("generates a new fact once the cached one is 60 seconds old", async () => {
    openAiReplies();
    await getFact("user-a", "Heat");
    advanceSeconds(60);
    const result = await getFact("user-a", "Heat");

    expect(result).toMatchObject({ content: "Fact #2", source: "generated" });
    expect(db.facts).toHaveLength(2);
  });

  it("does not reuse a cached fact after the movie changes", async () => {
    openAiReplies();
    await getFact("user-a", "Heat");
    const result = await getFact("user-a", "Alien");

    expect(result.source).toBe("generated");
    expect(createCompletion).toHaveBeenCalledTimes(2);
  });
});

describe("burst / idempotency protection", () => {
  it("generates exactly one fact for simultaneous requests and shares it", async () => {
    openAiReplies(30); // slow enough that all requests overlap
    const results = await Promise.all(Array.from({ length: 5 }, () => getFact("user-a", "Heat")));

    expect(createCompletion).toHaveBeenCalledTimes(1);
    expect(db.facts).toHaveLength(1);
    expect(new Set(results.map((r) => r.content))).toEqual(new Set(["Fact #1"]));
  });

  it("releases the lock after a failure so the next request can retry", async () => {
    createCompletion.mockRejectedValueOnce(new Error("boom"));
    await expect(getFact("user-a", "Heat")).rejects.toBeInstanceOf(FactGenerationError);

    openAiReplies();
    const result = await getFact("user-a", "Heat");
    expect(result.source).toBe("generated");
  });

  it("still works when Redis is down (no cache, no lock)", async () => {
    fakeRedis.down = true;
    openAiReplies();
    const result = await getFact("user-a", "Heat");

    expect(result).toMatchObject({ content: "Fact #1", source: "generated" });
  });
});

describe("OpenAI failure handling", () => {
  it("returns the most recent stored fact when OpenAI fails", async () => {
    openAiReplies();
    await getFact("user-a", "Heat");
    advanceSeconds(120); // cache expired, must regenerate
    createCompletion.mockRejectedValue(new Error("timeout"));

    const result = await getFact("user-a", "Heat");
    expect(result).toMatchObject({ content: "Fact #1", source: "stale-fallback" });
  });

  it("throws a user-friendly error when OpenAI fails and nothing is stored", async () => {
    createCompletion.mockRejectedValue(new Error("timeout"));

    await expect(getFact("user-a", "Heat")).rejects.toThrow(/could not generate a fun fact/i);
  });
});

describe("authorization / data isolation", () => {
  it("never falls back to another user's stored fact", async () => {
    db.facts.push({ id: 99, userId: "user-b", movie: "Heat", content: "B's private fact", createdAt: new Date() });
    createCompletion.mockRejectedValue(new Error("timeout"));

    await expect(getFact("user-a", "Heat")).rejects.toBeInstanceOf(FactGenerationError);
  });

  it("does not serve user B's cached fact to user A", async () => {
    openAiReplies();
    await getFact("user-b", "Heat");
    const result = await getFact("user-a", "Heat");

    expect(result.source).toBe("generated");
    expect(db.facts.map((f) => f.userId).sort()).toEqual(["user-a", "user-b"]);
  });
});
