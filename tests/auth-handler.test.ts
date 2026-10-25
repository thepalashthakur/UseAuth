import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  cookieGet: vi.fn(),
  cookieDelete: vi.fn(),
  auth: {
    signUp: vi.fn(),
    signInWithPassword: vi.fn(),
    getUser: vi.fn(),
    refreshSession: vi.fn(),
    setSession: vi.fn(),
    signOut: vi.fn(),
    verifyOtp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    updateUser: vi.fn(),
    getSession: vi.fn(),
    reauthenticate: vi.fn(),
    resend: vi.fn(),
  },
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mocks.cookieGet,
    delete: mocks.cookieDelete,
  })),
}));
vi.mock("@/lib/supabase/server", () => ({
  cookieClient: vi.fn(async () => ({ auth: mocks.auth, rpc: mocks.rpc })),
  tokenClient: vi.fn(() => ({ auth: mocks.auth, rpc: mocks.rpc })),
}));
import { handleAuth } from "@/lib/auth-handler";
import { allowedOrigin, recoveryReturnUrl } from "@/lib/auth-contract";
import { createRecoveryGrant } from "@/lib/recovery-grant";

const user = {
  id: "user-1",
  email: "test@example.com",
  email_confirmed_at: "2026-01-01",
  created_at: "2026-01-01",
  app_metadata: { private: true },
  user_metadata: {
    username: "my_user",
    display_name: "My Name",
    admin: true,
  },
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
  mocks.cookieGet.mockReset();
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("APP_URL", "https://auth.example.com");
  vi.stubEnv("RECOVERY_GRANT_SECRET", "a".repeat(64));
  vi.stubEnv("AUTH_ALLOWED_ORIGINS", "https://app.example.com");
  vi.stubEnv("IOS_APP_REDIRECT_URL", "https://ios.example.com/auth/confirmed");
  vi.stubEnv("ANDROID_APP_REDIRECT_URL", "useauth-android://auth/confirmed");
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
  it("accepts only approved recovery return URLs", () => {
    const allowed = "https://app.example.com";
    expect(recoveryReturnUrl("https://app.example.com/sign-in", allowed)).toBe(
      "https://app.example.com/sign-in",
    );
    for (const value of [
      "https://app.example.com.evil.com/sign-in",
      "https://app.example.com@evil.com/sign-in",
      "https://app.example.com/sign-in?next=evil",
      "https://app.example.com/sign-in?",
      "https://app.example.com/sign-in#token",
      "javascript:alert(1)",
    ])
      expect(recoveryReturnUrl(value, allowed)).toBeNull();
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
        username: "my_user",
        display_name: "My Name",
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
  it("sends a recovery email without revealing whether the account exists", async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const response = await handleAuth(
      request({ email: "TEST@example.com" }),
      "forgot-password",
      "token",
    );
    expect(response.status).toBe(200);
    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "test@example.com",
      { redirectTo: "https://auth.example.com/auth/recovery" },
    );
    mocks.auth.resetPasswordForEmail.mockResolvedValue({
      error: { status: 400 },
    });
    const unknown = await handleAuth(
      request({ email: "TEST@example.com" }),
      "forgot-password",
      "token",
    );
    expect(await unknown.json()).toEqual(await response.json());
  });
  it("resends confirmation without disclosing account state", async () => {
    mocks.auth.resend.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({
      error: { status: 400, message: "unknown account" },
    });
    const first = await handleAuth(
      request(
        { email: "TEST@example.com" },
        { origin: "https://auth.example.com" },
      ),
      "resend-confirmation",
      "cookie",
    );
    const second = await handleAuth(
      request(
        { email: "TEST@example.com" },
        { origin: "https://auth.example.com" },
      ),
      "resend-confirmation",
      "cookie",
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(mocks.auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "test@example.com",
      options: { emailRedirectTo: "https://auth.example.com/auth/confirm" },
    });
  });
  it("does not send unusable recovery emails when the signing secret is missing", async () => {
    vi.stubEnv("RECOVERY_GRANT_SECRET", "");
    const response = await handleAuth(
      request({ email: "test@example.com" }),
      "forgot-password",
      "token",
    );
    expect(response.status).toBe(503);
    expect(mocks.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("sends recovery back to an approved app without exposing the reset token", async () => {
    mocks.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const response = await handleAuth(
      request(
        {
          email: "test@example.com",
          return_to: "https://app.example.com/sign-in",
        },
        { origin: "https://app.example.com" },
      ),
      "forgot-password",
      "token",
    );
    expect(response.status).toBe(200);
    expect(mocks.auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "test@example.com",
      { redirectTo: "https://app.example.com/sign-in" },
    );
  });
  it("rejects unapproved and cross-app recovery destinations", async () => {
    vi.stubEnv(
      "AUTH_ALLOWED_ORIGINS",
      "https://app.example.com,https://other.example.com",
    );
    for (const [return_to, origin] of [
      ["https://evil.example.com/sign-in", "https://app.example.com"],
      ["https://app.example.com.evil.com/sign-in", "https://app.example.com"],
      ["https://app.example.com/sign-in", "https://other.example.com"],
    ]) {
      const response = await handleAuth(
        request({ email: "test@example.com", return_to }, { origin }),
        "forgot-password",
        "token",
      );
      expect(response.status).toBe(400);
    }
    expect(mocks.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("requires a valid hosted session to update a password", async () => {
    mocks.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "expired" },
    });
    const input = request(
      { password: "new-password" },
      { origin: "https://auth.example.com" },
    );
    expect((await handleAuth(input, "reset-password", "cookie")).status).toBe(
      401,
    );
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });
  it("updates the password and signs out the hosted session", async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.auth.getSession.mockResolvedValue({
      data: { session: { ...session, user } },
    });
    mocks.cookieGet.mockReturnValue({
      value: createRecoveryGrant(session.access_token, user.id),
    });
    mocks.auth.updateUser.mockResolvedValue({ error: null });
    mocks.auth.signOut.mockResolvedValue({ error: null });
    const response = await handleAuth(
      request(
        { password: "new-password" },
        { origin: "https://auth.example.com" },
      ),
      "reset-password",
      "cookie",
    );
    expect(response.status).toBe(200);
    expect(mocks.auth.updateUser).toHaveBeenCalledWith({
      password: "new-password",
    });
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(mocks.cookieDelete).toHaveBeenCalledWith("useauth-recovery");
    expect(await response.json()).not.toHaveProperty("session");
  });
  it("reports a failed sign-out after reset and clears the recovery grant", async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.auth.getSession.mockResolvedValue({
      data: { session: { ...session, user } },
    });
    mocks.cookieGet.mockReturnValue({
      value: createRecoveryGrant(session.access_token, user.id),
    });
    mocks.auth.updateUser.mockResolvedValue({ error: null });
    mocks.auth.signOut.mockResolvedValue({ error: { status: 500 } });
    const response = await handleAuth(
      request(
        { password: "new-password" },
        { origin: "https://auth.example.com" },
      ),
      "reset-password",
      "cookie",
    );
    expect(response.status).toBe(502);
    expect(mocks.cookieDelete).toHaveBeenCalledWith("useauth-recovery");
    expect((await response.json()).error.code).toBe("RESET_SESSION_FAILED");
  });
  it("rejects a normal signed-in session without a recovery grant", async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.auth.getSession.mockResolvedValue({
      data: { session: { ...session, user } },
    });
    const response = await handleAuth(
      request(
        { password: "new-password" },
        { origin: "https://auth.example.com" },
      ),
      "reset-password",
      "cookie",
    );
    expect(response.status).toBe(401);
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });
  it("does not expose password updates on the token API", async () => {
    expect(
      (
        await handleAuth(
          request({ password: "new-password" }),
          "reset-password",
          "token",
        )
      ).status,
    ).toBe(404);
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });
  it("requires a signed-in user and the current password to change it", async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { status: 400 },
    });
    const response = await handleAuth(
      request(
        { current_password: "wrong-password", password: "new-password" },
        { origin: "https://auth.example.com" },
      ),
      "change-password",
      "cookie",
    );
    expect(response.status).toBe(401);
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });
  it("changes the password after verifying the current password", async () => {
    mocks.auth.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.auth.signInWithPassword.mockResolvedValue({
      data: { user, session },
      error: null,
    });
    mocks.auth.signOut.mockResolvedValue({ error: null });
    mocks.auth.updateUser.mockResolvedValue({ error: null });
    const response = await handleAuth(
      request(
        { current_password: "old-password", password: "new-password" },
        { origin: "https://auth.example.com" },
      ),
      "change-password",
      "cookie",
    );
    expect(response.status).toBe(200);
    expect(mocks.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "old-password",
    });
    expect(mocks.auth.updateUser).toHaveBeenCalledWith({
      password: "new-password",
      current_password: "old-password",
    });
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(await response.json()).not.toHaveProperty("session");
  });
  it("requires a token session and new_password for app password changes", async () => {
    const response = await handleAuth(
      request({ current_password: "old-password", password: "new-password" }),
      "change-password",
      "token",
    );
    expect(response.status).toBe(400);
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });
  it("changes an app password only after verifying its current value", async () => {
    mocks.auth.setSession.mockResolvedValue({
      data: { session, user },
      error: null,
    });
    mocks.auth.signInWithPassword.mockResolvedValue({
      data: { user, session },
      error: null,
    });
    mocks.auth.signOut.mockResolvedValue({ error: null });
    mocks.auth.updateUser.mockResolvedValue({ data: { user }, error: null });
    const response = await handleAuth(
      request({
        access_token: "access",
        refresh_token: "refresh",
        current_password: "old-password",
        new_password: "new-password",
      }),
      "change-password",
      "token",
    );
    expect(response.status).toBe(200);
    expect(mocks.auth.updateUser).toHaveBeenCalledWith({
      password: "new-password",
      current_password: "old-password",
    });
    expect(mocks.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect((await response.json()).session.refresh_token).toBe("refresh");
  });
  it("rejects an incorrect current password from an app", async () => {
    mocks.auth.setSession.mockResolvedValue({
      data: { session, user },
      error: null,
    });
    mocks.auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { status: 400 },
    });
    const response = await handleAuth(
      request({
        access_token: "access",
        refresh_token: "refresh",
        current_password: "wrong-password",
        new_password: "new-password",
      }),
      "change-password",
      "token",
    );
    expect(response.status).toBe(401);
    expect(mocks.auth.updateUser).not.toHaveBeenCalled();
  });
  it("supports app reauthentication and profile updates", async () => {
    mocks.auth.setSession.mockResolvedValue({
      data: { session, user },
      error: null,
    });
    mocks.auth.reauthenticate.mockResolvedValue({ error: null });
    mocks.auth.updateUser.mockResolvedValue({ data: { user }, error: null });
    const tokens = { access_token: "access", refresh_token: "refresh" };
    const reauth = await handleAuth(
      request(tokens),
      "reauthenticate",
      "token",
    );
    const profile = await handleAuth(
      request({ ...tokens, display_name: "New Name" }),
      "update-profile",
      "token",
    );
    expect(reauth.status).toBe(200);
    expect(mocks.auth.reauthenticate).toHaveBeenCalledOnce();
    expect(profile.status).toBe(200);
    expect(mocks.auth.updateUser).toHaveBeenCalledWith({
      data: { display_name: "New Name" },
    });
  });
  it("rejects invalid email, weak signup passwords, and unexpected input", async () => {
    for (const body of [
      { email: "invalid", password: "long-password" },
      { email: "test@example.com", password: "short" },
      { email: "test@example.com", password: "long-password", role: "admin" },
      { email: "test@example.com", password: "long-password", username: "a!" },
      {
        email: "test@example.com",
        password: "long-password",
        display_name: "x".repeat(81),
      },
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
  it("stores optional signup profile fields in Supabase user metadata", async () => {
    mocks.auth.signUp.mockResolvedValue({
      data: { user, session: null },
      error: null,
    });
    const response = await handleAuth(
      request({
        email: "test@example.com",
        password: "my-password",
        username: "  My_User  ",
        display_name: "  My Name  ",
      }),
      "sign-up",
      "token",
    );
    expect(response.status).toBe(201);
    expect(mocks.auth.signUp).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "my-password",
      options: {
        emailRedirectTo: "https://auth.example.com/auth/confirm",
        data: { username: "my_user", display_name: "My Name" },
      },
    });
    expect(mocks.rpc).toHaveBeenCalledWith("username_available", {
      candidate: "my_user",
    });
    expect((await response.json()).user).toBeNull();
  });
  it("rejects a duplicate username before signup", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    const response = await handleAuth(
      request({
        email: "test@example.com",
        password: "my-password",
        username: "taken_name",
      }),
      "sign-up",
      "token",
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("USERNAME_TAKEN");
    expect(mocks.auth.signUp).not.toHaveBeenCalled();
  });
  it("reports a username claimed during a concurrent signup", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: false, error: null });
    mocks.auth.signUp.mockResolvedValue({ error: { status: 500 } });
    const response = await handleAuth(
      request({
        email: "test@example.com",
        password: "my-password",
        username: "race_name",
      }),
      "sign-up",
      "token",
    );
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("USERNAME_TAKEN");
  });
  it("fails closed when username uniqueness cannot be checked", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "missing function" },
    });
    const response = await handleAuth(
      request({
        email: "test@example.com",
        password: "my-password",
        username: "new_name",
      }),
      "sign-up",
      "token",
    );
    expect(response.status).toBe(503);
    expect(mocks.auth.signUp).not.toHaveBeenCalled();
  });
  it("treats blank optional signup fields as absent", async () => {
    mocks.auth.signUp.mockResolvedValue({
      data: { user, session: null },
      error: null,
    });
    await handleAuth(
      request({
        email: "test@example.com",
        password: "my-password",
        username: "  ",
        display_name: " ",
      }),
      "sign-up",
      "token",
    );
    expect(mocks.auth.signUp).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "my-password",
      options: { emailRedirectTo: "https://auth.example.com/auth/confirm" },
    });
  });
  it("accepts a display name without a username", async () => {
    mocks.auth.signUp.mockResolvedValue({
      data: { user, session: null },
      error: null,
    });
    const response = await handleAuth(
      request({
        email: "test@example.com",
        password: "my-password",
        display_name: "My Name",
      }),
      "sign-up",
      "token",
    );
    expect(response.status).toBe(201);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.auth.signUp).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "my-password",
      options: {
        emailRedirectTo: "https://auth.example.com/auth/confirm",
        data: { display_name: "My Name" },
      },
    });
  });
  it("sends mobile signup confirmation to the fixed platform callback", async () => {
    mocks.auth.signUp.mockResolvedValue({
      data: { user, session: null },
      error: null,
    });
    const response = await handleAuth(
      request({
        email: "test@example.com",
        password: "my-password",
        platform: "ios",
      }),
      "sign-up",
      "token",
    );
    expect(response.status).toBe(201);
    expect(mocks.auth.signUp).toHaveBeenCalledWith({
      email: "test@example.com",
      password: "my-password",
      options: {
        emailRedirectTo: "https://auth.example.com/auth/mobile/confirm/ios",
      },
    });
  });
  it("rejects unknown platforms and missing mobile configuration", async () => {
    const body = { email: "test@example.com", password: "my-password" };
    expect(
      (
        await handleAuth(
          request({ ...body, platform: "web" }),
          "sign-up",
          "token",
        )
      ).status,
    ).toBe(400);
    vi.stubEnv("IOS_APP_REDIRECT_URL", "");
    expect(
      (
        await handleAuth(
          request({ ...body, platform: "ios" }),
          "sign-up",
          "token",
        )
      ).status,
    ).toBe(503);
    expect(mocks.auth.signUp).not.toHaveBeenCalled();
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
