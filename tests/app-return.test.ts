import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppReturn, readAppReturn } from "@/lib/app-return";

beforeEach(() => vi.stubEnv("RECOVERY_GRANT_SECRET", "a".repeat(64)));

describe("signed app return context", () => {
  it("binds the exact app origin, email, purpose, and lifetime", () => {
    const value = createAppReturn("myhabits", "https://myhabits.example.com", "PERSON@example.com", "confirmation");
    expect(readAppReturn(value, "person@example.com", "confirmation")).toEqual({
      appId: "myhabits", origin: "https://myhabits.example.com",
    });
    expect(readAppReturn(value, "other@example.com", "confirmation")).toBeNull();
    expect(readAppReturn(value, "person@example.com", "recovery")).toBeNull();
    const [payload, signature] = value.split(".");
    expect(readAppReturn(`${payload}.${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`, "person@example.com", "confirmation")).toBeNull();
    vi.setSystemTime(Date.now() + 24 * 60 * 60 * 1000 + 1);
    expect(readAppReturn(value, "person@example.com", "confirmation")).toBeNull();
    vi.useRealTimers();
  });
});
