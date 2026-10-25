import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRecoveryGrant, validRecoveryGrant } from "@/lib/recovery-grant";

beforeEach(() => {
  vi.stubEnv("RECOVERY_GRANT_SECRET", "a".repeat(64));
});

describe("recovery grants", () => {
  it("binds a short-lived grant to one session and user", () => {
    const grant = createRecoveryGrant("session-one", "user-one");
    expect(validRecoveryGrant(grant, "session-one", "user-one")).toBe(true);
    expect(validRecoveryGrant(grant, "session-two", "user-one")).toBe(false);
    expect(validRecoveryGrant(grant, "session-one", "user-two")).toBe(false);
  });

  it("rejects a forged or expired grant", () => {
    const grant = createRecoveryGrant("session-one", "user-one");
    const [expires, mac] = grant.split(".");
    const forged = `${expires}.${mac[0] === "0" ? "1" : "0"}${mac.slice(1)}`;
    expect(validRecoveryGrant(forged, "session-one", "user-one")).toBe(false);
    vi.useFakeTimers();
    try {
      vi.advanceTimersByTime(11 * 60 * 1000);
      expect(validRecoveryGrant(grant, "session-one", "user-one")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
