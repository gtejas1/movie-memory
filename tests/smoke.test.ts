import { describe, it, expect } from "vitest";
import { movieSchema } from "@/utils/validation";

describe("movieSchema", () => {
  it("trims input", () => expect(movieSchema.parse("  Heat  ")).toBe("Heat"));
  it("rejects empty", () => expect(movieSchema.safeParse("   ").success).toBe(false));
  it("rejects too long", () => expect(movieSchema.safeParse("x".repeat(101)).success).toBe(false));
});
