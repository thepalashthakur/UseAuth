import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    getUser: vi.fn(),
    refreshSession: vi.fn(),
    setSession: vi.fn(),
    signOut: vi.fn(),
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  cookieClient: vi.fn(async () => ({ auth: mocks.auth })),
  tokenClient: vi.fn(() => ({ auth: mocks.auth })),
}));
import { handleAuth } from "@/lib/auth-handler";
import { allowedOrigin } from "@/lib/auth-contract";

const user = {
  id: "user-1",
  email: "test@example.com",
  email_confirmed_at: "2026-01-01",
  created_at: "2026-01-01",
  app_metadata: { private: true },
};
const session = {
  access_token: "access",
  refresh_token: "refresh",
  expires_at: 9999999999,
  expires_in: 3600,
  token_type: "bearer",
};
function request(
  body: unknown = {},
  options: {
    origin?: string;
    method?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const method = options.method ?? "POST";
  return new Request("https://auth.example.com/api/v1/auth/sign-in", {
    method,
    headers: {
      "content-type": "application/json",
      ...(options.origin ? { origin: options.origin } : {}),
      ...options.headers,
    },
    ...(method === "POST" ? { body: JSON.stringify(body) } : {}),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("APP_URL", "https://auth.example.com");
  vi.stubEnv("AUTH_ALLOWED_ORIGINS", "https://app.example.com");
});

describe("authentication boundaries", () => {
  it("requires configuration instead of attempting an auth request", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    expect((await handleAuth(request(), "sign-in", "token")).status).toBe(503);
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("blocks cross-origin cookie mutations and originless POSTs", async () => {
    for (const origin of [undefined, "https://evil.example.com"]) {
      expect(
        (await handleAuth(request({}, { origin }), "sign-in", "cookie")).status,
      ).toBe(403);
    }
    expect(mocks.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it("does not match an allowlisted origin by substring", () => {
    expect(
      allowedOrigin(
        "https://app.example.com.evil.com",
        "https://auth.example.com",
        "https://app.example.com",
      ),
    ).toBe(false);
  });
  it("permits explicit CORS preflight without cookies", async () => {
    const response = await handleAuth(
      request({}, { origin: "https://app.example.com", method: "OPTIONS" }),
      "sign-in",
      "token",
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://app.example.com",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });
  it("rejects unlisted origins", async () => {
    expect(
      (
        await handleAuth(
          request({}, { origin: "https://evil.example.com" }),
          "sign-in",
          "token",
        )
      ).status,
    ).toBe(403);
  });
  it("rejects the wrong method", async () => {
    const response = await handleAuth(
      request({}, { method: "GET" }),
      "sign-in",
      "token",
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });
  it("requires an explicit Bearer token for the integration API", async () => {
    expect(
      (await handleAuth(request({}, { method: "GET" }), "me", "token")).status,
    ).toBe(401);
    expect(mocks.auth.getUser).not.toHaveBeenCalled();
  });
  it("validates the access token with Supabase and excludes private metadata", async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user }, error: null });
    const response = await handleAuth(
      request(
        {},
        { method: "GET", headers: { authorization: "Bearer valid-token" } },
      ),
      "me",
      "token",
    );
    expect(mocks.auth.getUser).toHaveBeenCalledWith("valid-token");
    expect(await response.json()).toEqual({
      user: {
        id: "user-1",
        email: "test@example.com",
        email_verified: true,
        created_at: "2026-01-01",
      },
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects forged or expired tokens", async () => {
    mocks.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid" },
    });
    expect(
      (
        await handleAuth(
          request(
            {},
            { method: "GET", headers: { authorization: "Bearer fake" } },
          ),
          "me",
          "token",
        )
      ).status,
    ).toBe(401);
  });
});

describe("credential and session flows", () => {
  it("rejects invalid email, weak signup passwords, and unexpected input", async () => {
    for (const body of [
      { email: "invalid", password: "long-password" },
      { email: "test@example.com", password: "short" },
      { email: "test@example.com", password: "long-password", role: "admin" },
    ]) {
      expect((await handleAuth(request(body), "sign-up", "token")).status).toBe(
        400,
      );
    }
    expect(mocks.auth.signUp).not.toHaveBeenCalled();
  });
  it("normalizes emails and returns token sessions", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({
      data: { user, session },
      error: null,
    });
    const response = await handleAuth(
      request({ email: "TEST@example.com", password: "my-password" }),
      "sign-in",
      "token",
    );
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "my-password",
    });
    expect((await response.json()).session).toEqual(session);
  });
  it("keeps tokens out of hosted UI response bodies", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({
      data: { user, session },
      error: null,
    });
    const response = await handleAuth(
      request(
        { email: "test@example.com", password: "my-password" },
        { origin: "https://auth.example.com" },
      ),
      "sign-in",
      "cookie",
    );
    expect(await response.json()).not.toHaveProperty("session");
  });
  it("supports signup confirmation without leaking account existence", async () => {
    mocks.auth.signUp.mockResolvedValue({
      data: { user, session: null },
      error: null,
    });
    const response = await handleAuth(
      request({ email: "test@example.com", password: "my-password" }),
      "sign-up",
      "token",
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      user: null,
      session: null,
      confirmation_required: true,
    });
    expect(mocks.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { emailRedirectTo: "https://auth.example.com/auth/confirm" },
      }),
    );
  });
  it("returns generic credential errors without provider details", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({
      error: { status: 400, message: "private provider diagnostic" },
    });
    const response = await handleAuth(
      request({ email: "test@example.com", password: "incorrect" }),
      "sign-in",
      "token",
    );
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain(
      "private provider diagnostic",
    );
  });
  it("preserves provider rate-limit responses", async () => {
    mocks.auth.signInWithPassword.mockResolvedValue({ error: { status: 429 } });
    expect(
      (
        await handleAuth(
          request({ email: "test@example.com", password: "password" }),
          "sign-in",
          "token",
        )
      ).status,
    ).toBe(429);
  });
  it("rotates refresh tokens through Supabase", async () => {
    mocks.auth.refreshSession.mockResolvedValue({
      data: { session, user },
      error: null,
    });
    const response = await handleAuth(
      request({ refresh_token: "old-refresh" }),
      "refresh",
      "token",
    );
    expect(mocks.auth.refreshSession).toHaveBeenCalledWith({
      refresh_token: "old-refresh",
    });
    expect((await response.json()).session.refresh_token).toBe("refresh");
  });
  it("refuses invalid session establishment before sign-out", async () => {
    mocks.auth.setSession.mockResolvedValue({
      error: { message: "invalid token" },
    });
    expect(
      (
        await handleAuth(
          request({ access_token: "bad", refresh_token: "bad" }),
          "sign-out",
          "token",
        )
      ).status,
    ).toBe(401);
    expect(mocks.auth.signOut).not.toHaveBeenCalled();
  });
  it("revokes only the provided session", async () => {
    mocks.auth.setSession.mockResolvedValue({ error: null });
    mocks.auth.signOut.mockResolvedValue({ error: null });
    expect(
      (
        await handleAuth(
          request({ access_token: "access", refresh_token: "refresh" }),
          "sign-out",
          "token",
        )
      ).status,
    ).toBe(200);
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("rejects oversized, malformed, and non-JSON payloads", async () => {
    expect(
      (
        await handleAuth(
          request({ text: "x".repeat(17000) }),
          "sign-in",
          "token",
        )
      ).status,
    ).toBe(413);
    const malformed = new Request("https://auth.example.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    expect((await handleAuth(malformed, "sign-in", "token")).status).toBe(400);
    expect(
      (
        await handleAuth(
          request({}, { headers: { "content-type": "text/plain" } }),
          "sign-in",
          "token",
        )
      ).status,
    ).toBe(415);
  });
  it("handles provider outages without unhandled errors", async () => {
    mocks.auth.signInWithPassword.mockRejectedValue(
      new Error("network failure"),
    );
    expect(
      (
        await handleAuth(
          request({ email: "test@example.com", password: "password" }),
          "sign-in",
          "token",
        )
      ).status,
    ).toBe(503);
  });
});
