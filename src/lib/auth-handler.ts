import { NextResponse } from "next/server";
import type { Session } from "@supabase/supabase-js";
import {
  actions,
  allowedOrigin,
  credentials,
  signup,
  refresh,
  logout,
  publicUser,
  type AuthAction,
} from "@/lib/auth-contract";
import { appOrigin, isConfigured } from "@/lib/config";
import { cookieClient, tokenClient } from "@/lib/supabase/server";

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
  const json = (body: unknown, status = 200) =>
    NextResponse.json(body, { status, headers });
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
    if (action === "sign-up" || action === "sign-in") {
      const parsed = (action === "sign-up" ? signup : credentials).safeParse(
        input,
      );
      if (!parsed.success)
        return fail("VALIDATION_ERROR", parsed.error.issues[0].message, 400);
      const result =
        action === "sign-up"
          ? await client.auth.signUp({
              ...parsed.data,
              options: { emailRedirectTo: `${appOrigin()}/auth/confirm` },
            })
          : await client.auth.signInWithPassword(parsed.data);
      if (result.error) {
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
