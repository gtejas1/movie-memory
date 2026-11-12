import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
const findUser = vi.hoisted(() => vi.fn());
const getFact = vi.hoisted(() => vi.fn());

vi.mock("@/config/auth", () => ({ auth }));
vi.mock("@/config/prisma", () => ({ prisma: { user: { findUnique: findUser } } }));
vi.mock("@/utils/facts", async () => {
  const actual = await vi.importActual<typeof import("@/utils/facts")>("@/utils/facts");
  return { ...actual, getFact };
});
vi.mock("@/config/openai", () => ({ openai: {}, OPENAI_MODEL: "test-model" }));
vi.mock("@/config/redis", () => ({ getRedis: () => null }));

import { GET } from "@/app/api/fact/route";
import { FactGenerationError } from "@/utils/facts";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/fact authorization", () => {
  it("returns 401 and does nothing when there is no session", async () => {
    auth.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(findUser).not.toHaveBeenCalled();
    expect(getFact).not.toHaveBeenCalled();
  });

  it("only ever fetches the signed-in user's own facts", async () => {
    auth.mockResolvedValue({ user: { id: "user-a" } });
    findUser.mockResolvedValue({ id: "user-a", favoriteMovie: "Heat" });
    getFact.mockResolvedValue({ content: "A fact", createdAt: "2026-01-01T00:00:00.000Z", source: "generated" });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(findUser).toHaveBeenCalledWith({ where: { id: "user-a" } });
    expect(getFact).toHaveBeenCalledWith("user-a", "Heat");
    expect(await response.json()).toMatchObject({ fact: { content: "A fact" }, source: "generated" });
  });

  it("returns 409 when the user has not chosen a movie", async () => {
    auth.mockResolvedValue({ user: { id: "user-a" } });
    findUser.mockResolvedValue({ id: "user-a", favoriteMovie: null });

    expect((await GET()).status).toBe(409);
    expect(getFact).not.toHaveBeenCalled();
  });

  it("returns a friendly 502 when fact generation fails", async () => {
    auth.mockResolvedValue({ user: { id: "user-a" } });
    findUser.mockResolvedValue({ id: "user-a", favoriteMovie: "Heat" });
    getFact.mockRejectedValue(new FactGenerationError("Try again later"));

    const response = await GET();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "Try again later" });
  });
});
