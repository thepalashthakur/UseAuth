import { NextResponse } from "next/server";
import type { Session } from "@supabase/supabase-js";
import {
  actions,
  allowedOrigin,
  credentials,
  signup,
  tokenSignup,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  tokenPasswordChange,
  tokenProfileUpdate,
  recoveryReturnUrl,
  publicUser,
  type AuthAction,
} from "@/lib/auth-contract";
import { appOrigin, isConfigured, mobileAppUrl } from "@/lib/config";
import { cookieClient, tokenClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import {
  recoveryConfigured,
  recoveryCookie,
  validRecoveryGrant,
} from "@/lib/recovery-grant";
import { createAppReturn, registeredAppOrigin } from "@/lib/app-return";

function sessionData(session: Session | null) {
  return session
    ? {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        expires_in: session.expires_in,
        token_type: session.token_type,
      }
    : null;
}

export async function handleAuth(
  request: Request,
  action: string,
  mode: "cookie" | "token",
) {
  const origin = request.headers.get("origin");
  const ownOrigin = new URL(request.url).origin;
  const headers: Record<string, string> = {
    "Cache-Control": "private, no-store",
    Vary: "Origin",
  };
  const requestId = crypto.randomUUID();
  headers["X-Request-Id"] = requestId;
  const json = (body: unknown, status = 200) => {
    if (request.method === "POST")
      console.info(JSON.stringify({
        event: "auth_request",
        request_id: requestId,
        action,
        mode,
        status,
      }));
    return NextResponse.json(body, { status, headers });
  };
  const fail = (code: string, message: string, status: number) =>
    json({ error: { code, message } }, status);

  if (mode === "token") {
    if (!allowedOrigin(origin, ownOrigin, process.env.AUTH_ALLOWED_ORIGINS))
      return fail("ORIGIN_NOT_ALLOWED", "This origin is not allowed.", 403);
    if (origin) headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type";
    headers["Access-Control-Max-Age"] = "600";
  } else if (
    request.method !== "GET" &&
    (origin !== ownOrigin ||
      request.headers.get("sec-fetch-site") === "cross-site")
  ) {
    return fail(
      "ORIGIN_NOT_ALLOWED",
      "Use this site's hosted sign-in form.",
      403,
    );
  }
  if (!actions.includes(action as AuthAction))
    return fail("NOT_FOUND", "Unknown auth endpoint.", 404);
  if (request.method === "OPTIONS" && mode === "token")
    return new NextResponse(null, { status: 204, headers });
  const expectedMethod = action === "me" ? "GET" : "POST";
  if (request.method !== expectedMethod) {
    headers.Allow = expectedMethod;
    return fail(
      "METHOD_NOT_ALLOWED",
      `Use ${expectedMethod} for this endpoint.`,
      405,
    );
  }
  if (!isConfigured())
    return fail(
      "NOT_CONFIGURED",
      "Connect your Supabase project to enable authentication.",
      503,
    );

  try {
    let input: unknown;
    if (request.method === "POST") {
      if (
        !request.headers
          .get("content-type")
          ?.toLowerCase()
          .startsWith("application/json")
      )
        return fail(
          "INVALID_CONTENT_TYPE",
          "Send an application/json body.",
          415,
        );
      // Read a bounded stream; Content-Length alone is not trustworthy.
      const reader = request.body?.getReader();
      if (!reader) return fail("INVALID_JSON", "A JSON body is required.", 400);
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) {
          await reader.cancel();
          return fail("PAYLOAD_TOO_LARGE", "Body exceeds 16 KB.", 413);
        }
        chunks.push(value);
      }
      try {
        input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        return fail("INVALID_JSON", "Send a valid JSON body.", 400);
      }
    }
    const client = mode === "cookie" ? await cookieClient() : tokenClient();

    if (action === "me") {
      const bearer = request.headers
        .get("authorization")
        ?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if (mode === "token" && !bearer)
        return fail("UNAUTHORIZED", "A Bearer access token is required.", 401);
      const { data, error } = await client.auth.getUser(
        mode === "token" ? bearer : undefined,
      );
      if (error || !data.user)
        return fail("UNAUTHORIZED", "Your session is invalid or expired.", 401);
      return json({ user: publicUser(data.user) });
    }
    if (action === "forgot-password") {
      if (!recoveryConfigured())
        return fail(
          "NOT_CONFIGURED",
          "Password recovery is not configured.",
          503,
        );
      const parsed = forgotPassword.safeParse(input);
      if (!parsed.success)
        return fail("VALIDATION_ERROR", parsed.error.issues[0].message, 400);
      if (parsed.data.app_id && parsed.data.return_to)
        return fail("INVALID_RETURN_URL", "Use app_id without return_to.", 400);
      const appReturnOrigin = parsed.data.app_id
        ? await registeredAppOrigin(client, parsed.data.app_id)
        : null;
      if (parsed.data.app_id && !appReturnOrigin)
        return fail("UNKNOWN_APP", "This app is not registered or active.", 400);
      const returnTo = parsed.data.return_to
        ? recoveryReturnUrl(
            parsed.data.return_to,
            process.env.AUTH_ALLOWED_ORIGINS,
          )
        : null;
      if (parsed.data.return_to && !returnTo)
        return fail(
          "INVALID_RETURN_URL",
          "Use a return_to URL on an allowed app origin without a query or fragment.",
          400,
        );
      if (
        origin &&
        origin !== ownOrigin &&
        returnTo &&
        new URL(returnTo).origin !== origin
      )
        return fail(
          "INVALID_RETURN_URL",
          "The return_to origin must match the requesting app.",
          400,
        );
      const { error } = await client.auth.resetPasswordForEmail(
        parsed.data.email,
        { redirectTo: appReturnOrigin
          ? `${appOrigin()}/auth/recovery?context=${createAppReturn(parsed.data.app_id!, appReturnOrigin, parsed.data.email, "recovery")}`
          : returnTo ?? `${appOrigin()}/auth/recovery` },
      );
      if (error?.status === 429)
        return fail(
          "RATE_LIMITED",
          "Too many attempts. Please try again later.",
          429,
        );
      // Keep unknown addresses and other provider rejections indistinguishable.
      return json({
        message:
          "If an account exists for this email, a password reset link will arrive shortly.",
      });
    }
    if (action === "resend-confirmation") {
      const parsed = forgotPassword.pick({ email: true, app_id: true }).safeParse(input);
      if (!parsed.success)
        return fail("VALIDATION_ERROR", parsed.error.issues[0].message, 400);
      if (parsed.data.app_id && !recoveryConfigured())
        return fail("NOT_CONFIGURED", "App return is not configured.", 503);
      const appReturnOrigin = parsed.data.app_id
        ? await registeredAppOrigin(client, parsed.data.app_id)
        : null;
      if (parsed.data.app_id && !appReturnOrigin)
        return fail("UNKNOWN_APP", "This app is not registered or active.", 400);
      const { error } = await client.auth.resend({
        type: "signup",
        email: parsed.data.email,
        options: { emailRedirectTo: appReturnOrigin
          ? `${appOrigin()}/auth/confirm?context=${createAppReturn(parsed.data.app_id!, appReturnOrigin, parsed.data.email, "confirmation")}`
          : `${appOrigin()}/auth/confirm` },
      });
      if (error?.status === 429)
        return fail("RATE_LIMITED", "Too many attempts. Please try again later.", 429);
      // Do not reveal whether an account exists or has already been verified.
      return json({
        message:
          "If this address needs confirmation, a new link will arrive shortly.",
      });
    }
    if (action === "reset-password") {
      if (mode === "token")
        return fail("NOT_FOUND", "Use the hosted password reset link.", 404);
      const parsed = resetPassword.safeParse(input);
      if (!parsed.success)
        return fail("VALIDATION_ERROR", parsed.error.issues[0].message, 400);
      const { data, error: userError } = await client.auth.getUser();
      if (userError || !data.user)
        return fail(
          "UNAUTHORIZED",
          "Your reset link is invalid or expired. Request a new one.",
          401,
        );
      const store = await cookies();
      const { data: sessionData } = await client.auth.getSession();
      const session = sessionData.session;
      if (
        !session ||
        session.user.id !== data.user.id ||
        !validRecoveryGrant(
          store.get(recoveryCookie)?.value,
          session.access_token,
          data.user.id,
        )
      )
        return fail(
          "UNAUTHORIZED",
          "Your reset link is invalid or expired. Request a new one.",
          401,
        );
      const { error } = await client.auth.updateUser({
        password: parsed.data.password,
      });
      if (error?.status === 429)
        return fail(
          "RATE_LIMITED",
          "Too many attempts. Please try again later.",
          429,
        );
      if (error?.code === "same_password")
        return fail(
          "SAME_PASSWORD",
          "Choose a password different from your current password.",
          422,
        );
      if (error)
        return fail(
          "RESET_FAILED",
          "Unable to update your password. Please try again.",
          400,
        );
      const { error: signOutError } = await client.auth.signOut({ scope: "local" });
      store.delete(recoveryCookie);
      if (signOutError)
        return fail(
          "RESET_SESSION_FAILED",
          "Your password changed, but this session could not be closed. Sign out and sign in again.",
          502,
        );
      return json({
        message:
          "Your password has been updated. Sign in with your new password.",
      });
    }
    if (action === "change-password") {
      if (mode === "token") {
        const parsed = tokenPasswordChange.safeParse(input);
        if (!parsed.success)
          return fail("VALIDATION_ERROR", "Invalid password request.", 400);
        const { access_token, refresh_token, current_password, new_password, nonce } =
          parsed.data;
        const { data: active, error: sessionError } = await client.auth.setSession({
          access_token,
          refresh_token,
        });
        if (sessionError || !active.session || !active.user?.email)
          return fail("UNAUTHORIZED", "Your session is invalid or expired.", 401);
        const verifier = tokenClient();
        const check = await verifier.auth.signInWithPassword({
          email: active.user.email,
          password: current_password,
        });
        if (check.data?.session) {
          const { error: cleanupError } = await verifier.auth.signOut({ scope: "local" });
          if (cleanupError)
            return fail("VERIFICATION_SESSION_FAILED", "Unable to finish password verification. Try again.", 502);
        }
        if (check.error?.status === 429)
          return fail("RATE_LIMITED", "Too many attempts. Try again later.", 429);
        if (check.error || check.data.user?.id !== active.user.id)
          return fail("INVALID_CREDENTIALS", "Current password is incorrect.", 401);
        const { data, error } = await client.auth.updateUser({
          password: new_password,
          current_password,
          ...(nonce ? { nonce } : {}),
        });
        if (error?.code === "reauthentication_needed")
          return fail(
            "reauthentication_needed",
            "A verification code is required to change your password.",
            403,
          );
        if (error?.status === 429)
          return fail("RATE_LIMITED", "Too many attempts. Try again later.", 429);
        if (error || !data.user)
          return fail(
            "CHANGE_PASSWORD_FAILED",
            "Unable to change your password. Please try again.",
            400,
          );
        return json({
          user: publicUser(data.user),
          session: sessionData(active.session),
          message: "Your password has been changed.",
        });
      }
      const parsed = changePassword.safeParse(input);
      if (!parsed.success)
        return fail("VALIDATION_ERROR", parsed.error.issues[0].message, 400);
      const { data, error: userError } = await client.auth.getUser();
      if (userError || !data.user?.email)
        return fail(
          "UNAUTHORIZED",
          "Sign in again to change your password.",
          401,
        );
      const verifier = tokenClient();
      const check = await verifier.auth.signInWithPassword({
        email: data.user.email,
        password: parsed.data.current_password,
      });
      if (check.data?.session) {
        const { error: cleanupError } = await verifier.auth.signOut({ scope: "local" });
        if (cleanupError)
          return fail("VERIFICATION_SESSION_FAILED", "Unable to finish password verification. Try again.", 502);
      }
      if (check.error?.status === 429)
        return fail(
          "RATE_LIMITED",
          "Too many attempts. Please try again later.",
          429,
        );
      if (check.error || check.data.user?.id !== data.user.id)
        return fail(
          "INVALID_CREDENTIALS",
          "Your current password is incorrect.",
          401,
        );
      const { error } = await client.auth.updateUser({
        password: parsed.data.password,
        current_password: parsed.data.current_password,
      });
      if (error?.status === 429)
        return fail(
          "RATE_LIMITED",
          "Too many attempts. Please try again later.",
          429,
        );
      if (error)
        return fail(
          "CHANGE_PASSWORD_FAILED",
          "Unable to change your password. Please try again.",
          400,
        );
      return json({ message: "Your password has been changed." });
    }
    if (action === "reauthenticate" || action === "update-profile") {
      if (mode === "cookie")
        return fail("NOT_FOUND", "Use the account page.", 404);
      const parsed = (
        action === "reauthenticate" ? logout : tokenProfileUpdate
      ).safeParse(input);
      if (!parsed.success)
        return fail("VALIDATION_ERROR", "Invalid account request.", 400);
      const { data: active, error: sessionError } = await client.auth.setSession({
        access_token: parsed.data.access_token,
        refresh_token: parsed.data.refresh_token,
      });
      if (sessionError || !active.session || !active.user)
        return fail("UNAUTHORIZED", "Your session is invalid or expired.", 401);
      if (action === "reauthenticate") {
        const { error } = await client.auth.reauthenticate();
        if (error?.status === 429)
          return fail("RATE_LIMITED", "Too many attempts. Try again later.", 429);
        if (error)
          return fail(
            "REAUTHENTICATION_FAILED",
            "Unable to send a verification code. Please try again.",
            400,
          );
        return json({
          message: "Verification code sent.",
          session: sessionData(active.session),
        });
      }
      if (!("display_name" in parsed.data))
        return fail("VALIDATION_ERROR", "Invalid account request.", 400);
      const { data, error } = await client.auth.updateUser({
        data: { display_name: parsed.data.display_name },
      });
      if (error || !data.user)
        return fail(
          "PROFILE_UPDATE_FAILED",
          "Unable to update your profile. Please try again.",
          400,
        );
      return json({ user: publicUser(data.user), session: sessionData(active.session) });
    }
    if (action === "sign-up" || action === "sign-in") {
      const parsed = (
        action === "sign-up"
          ? mode === "token"
            ? tokenSignup
            : signup
          : credentials
      ).safeParse(input);
      if (!parsed.success)
        return fail("VALIDATION_ERROR", parsed.error.issues[0].message, 400);
      const platformValue =
        "platform" in parsed.data ? parsed.data.platform : undefined;
      const platform =
        platformValue === "ios" || platformValue === "android"
          ? platformValue
          : undefined;
      if (platform && !mobileAppUrl(platform))
        return fail(
          "MOBILE_NOT_CONFIGURED",
          "Mobile confirmation is not configured.",
          503,
        );
      const { email, password } = parsed.data;
      const appId = "app_id" in parsed.data && typeof parsed.data.app_id === "string"
        ? parsed.data.app_id
        : undefined;
      if (appId && !recoveryConfigured())
        return fail("NOT_CONFIGURED", "App return is not configured.", 503);
      if (platform && appId)
        return fail("VALIDATION_ERROR", "Use either platform or app_id.", 400);
      const appReturnOrigin = action === "sign-up" && appId
        ? await registeredAppOrigin(client, appId)
        : null;
      if (appId && !appReturnOrigin)
        return fail("UNKNOWN_APP", "This app is not registered or active.", 400);
      const username =
        "username" in parsed.data && typeof parsed.data.username === "string"
          ? parsed.data.username
          : undefined;
      const displayName =
        "display_name" in parsed.data &&
        typeof parsed.data.display_name === "string"
          ? parsed.data.display_name
          : undefined;
      if (action === "sign-up" && username) {
        const { data: available, error: lookupError } = await client.rpc(
          "username_available",
          { candidate: username },
        );
        if (lookupError || typeof available !== "boolean")
          return fail(
            "SERVICE_UNAVAILABLE",
            "Username validation is unavailable.",
            503,
          );
        if (!available)
          return fail("USERNAME_TAKEN", "That username is already taken.", 409);
      }
      const result =
        action === "sign-up"
          ? await client.auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: platform
                  ? `${appOrigin()}/auth/mobile/confirm/${platform}`
                  : appReturnOrigin
                    ? `${appOrigin()}/auth/confirm?context=${createAppReturn(appId!, appReturnOrigin, email, "confirmation")}`
                    : `${appOrigin()}/auth/confirm`,
                ...(username || displayName
                  ? {
                      data: {
                        ...(username ? { username } : {}),
                        ...(displayName ? { display_name: displayName } : {}),
                      },
                    }
                  : {}),
              },
            })
          : await client.auth.signInWithPassword({ email, password });
      if (result.error) {
        if (action === "sign-up" && username) {
          const { data: available } = await client.rpc("username_available", {
            candidate: username,
          });
          if (available === false)
            return fail(
              "USERNAME_TAKEN",
              "That username is already taken.",
              409,
            );
        }
        if (result.error.status === 429)
          return fail(
            "RATE_LIMITED",
            "Too many attempts. Please try again later.",
            429,
          );
        if (action === "sign-in")
          return fail(
            "INVALID_CREDENTIALS",
            "Unable to sign in. Check your credentials and confirm your email.",
            401,
          );
        return fail(
          "SIGNUP_FAILED",
          "Unable to create an account. Please try again later.",
          400,
        );
      }
      // Supabase can obfuscate duplicate accounts. Never reveal whether an address exists.
      const session = result.data.session;
      return json(
        {
          user:
            result.data.user && session ? publicUser(result.data.user) : null,
          ...(mode === "token" ? { session: sessionData(session) } : {}),
          confirmation_required: !session,
          message: session
            ? "You are signed in."
            : "If this address can be registered, a confirmation email will arrive shortly.",
        },
        action === "sign-up" ? 201 : 200,
      );
    }
    if (action === "refresh") {
      if (mode === "cookie")
        return fail("NOT_FOUND", "Hosted sessions refresh automatically.", 404);
      const parsed = refresh.safeParse(input);
      if (!parsed.success)
        return fail("VALIDATION_ERROR", "A refresh_token is required.", 400);
      const { data, error } = await client.auth.refreshSession(parsed.data);
      if (error || !data.session)
        return fail(
          "UNAUTHORIZED",
          "Your refresh token is invalid or expired.",
          401,
        );
      return json({
        session: sessionData(data.session),
        user: publicUser(data.user!),
      });
    }
    if (mode === "token") {
      const parsed = logout.safeParse(input);
      if (!parsed.success)
        return fail(
          "VALIDATION_ERROR",
          "Both access_token and refresh_token are required.",
          400,
        );
      const { error } = await client.auth.setSession(parsed.data);
      if (error)
        return fail("UNAUTHORIZED", "Your session is invalid or expired.", 401);
    }
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error)
      return fail(
        "SIGNOUT_FAILED",
        "Unable to sign out. Please try again.",
        502,
      );
    return json({ message: "You are signed out." });
  } catch {
    return fail(
      "SERVICE_UNAVAILABLE",
      "Authentication is temporarily unavailable. Please try again later.",
      503,
    );
  }
}
