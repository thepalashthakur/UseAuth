import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  cookieClient: async () => ({ auth: { verifyOtp }, rpc }),
}));
import { GET } from "@/app/auth/confirm/route";
import { createAppReturn } from "@/lib/app-return";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("APP_URL", "https://auth.example.com");
  vi.stubEnv("RECOVERY_GRANT_SECRET", "a".repeat(64));
  rpc.mockResolvedValue({ data: "https://app.example.com", error: null });
  verifyOtp.mockResolvedValue({ data: { user: { email: "person@example.com" } }, error: null });
});

describe("confirmation return", () => {
  it("redirects to the registered app after verified email confirmation", async () => {
    const context = createAppReturn("myhabits", "https://app.example.com", "person@example.com", "confirmation");
    const target = `https://auth.example.com/auth/confirm?context=${context}`;
    const response = await GET(new Request(`https://auth.example.com/auth/confirm?token_hash=secret&type=email&redirect_to=${encodeURIComponent(target)}`));
    expect(response.headers.get("location")).toBe("https://app.example.com/");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("keeps mismatched or inactive returns on UseAuth", async () => {
    const context = createAppReturn("myhabits", "https://app.example.com", "person@example.com", "confirmation");
    rpc.mockResolvedValue({ data: null, error: null });
    const response = await GET(new Request(`https://auth.example.com/auth/confirm?token_hash=secret&type=email&context=${context}`));
    expect(response.headers.get("location")).toBe("https://auth.example.com/account");
  });
});
