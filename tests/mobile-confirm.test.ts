import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  tokenClient: () => ({ auth: { verifyOtp } }),
}));

import { GET } from "@/app/auth/mobile/confirm/[platform]/route";

function callback(platform: string, query = "?token_hash=hash&type=email") {
  return GET(
    new Request(
      `https://auth.example.com/auth/mobile/confirm/${platform}${query}`,
    ),
    { params: Promise.resolve({ platform }) },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("IOS_APP_REDIRECT_URL", "https://ios.example.com/auth/confirmed");
  vi.stubEnv("ANDROID_APP_REDIRECT_URL", "useauth-android://auth/confirmed");
});

describe("mobile email confirmation", () => {
  it("verifies the email before returning to the configured iOS app", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const response = await callback("ios");
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "hash",
      type: "email",
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://ios.example.com/auth/confirmed?confirmation=success",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("reports invalid links to Android without leaking tokens", async () => {
    verifyOtp.mockResolvedValue({
      error: { message: "private provider error" },
    });
    const response = await callback("android");
    expect(response.headers.get("location")).toBe(
      "useauth-android://auth/confirmed?confirmation=error",
    );
    expect(response.headers.get("location")).not.toContain("hash");
  });
  it("does not verify unknown platforms or redirect when unconfigured", async () => {
    expect((await callback("other")).status).toBe(404);
    vi.stubEnv("IOS_APP_REDIRECT_URL", "javascript:alert(1)");
    expect((await callback("ios")).status).toBe(503);
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
