import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  cookieClient: async () => ({ auth: { verifyOtp } }),
}));

import { GET } from "@/app/auth/recovery/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("RECOVERY_GRANT_SECRET", "a".repeat(64));
  vi.stubEnv("AUTH_ALLOWED_ORIGINS", "https://app.example.com");
});

describe("password recovery callback", () => {
  it("verifies a recovery hash and redirects without exposing it", async () => {
    verifyOtp.mockResolvedValue({
      data: { session: { access_token: "access", user: { id: "user-1" } } },
      error: null,
    });
    const response = await GET(
      new Request(
        "https://auth.example.com/auth/recovery?token_hash=secret&type=recovery",
      ),
    );
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "secret",
      type: "recovery",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://auth.example.com/reset-password",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("set-cookie")).toContain("useauth-recovery=");
  });
  it("rejects invalid or non-recovery links", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "invalid" } });
    for (const query of [
      "?token_hash=secret&type=recovery",
      "?token_hash=secret&type=email",
      "",
    ]) {
      const response = await GET(
        new Request(`https://auth.example.com/auth/recovery${query}`),
      );
      expect(response.headers.get("location")).toBe(
        "https://auth.example.com/forgot-password?error=invalid",
      );
    }
    expect(verifyOtp).toHaveBeenCalledTimes(1);
  });
  it("carries only an approved app return URL to the reset page", async () => {
    verifyOtp.mockResolvedValue({
      data: { session: { access_token: "access", user: { id: "user-1" } } },
      error: null,
    });
    const callback = (returnTo: string) =>
      GET(
        new Request(
          `https://auth.example.com/auth/recovery?token_hash=secret&type=recovery&return_to=${encodeURIComponent(returnTo)}`,
        ),
      );
    const approved = await callback("https://app.example.com/sign-in");
    expect(approved.headers.get("location")).toBe(
      "https://auth.example.com/reset-password?return_to=https%3A%2F%2Fapp.example.com%2Fsign-in",
    );
    const attacker = await callback("https://app.example.com.evil.com/sign-in");
    expect(attacker.headers.get("location")).toBe(
      "https://auth.example.com/reset-password",
    );
  });
});
