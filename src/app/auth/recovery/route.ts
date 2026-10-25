import { NextResponse } from "next/server";
import { cookieClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/config";
import { recoveryReturnUrl } from "@/lib/auth-contract";
import {
  createRecoveryGrant,
  recoveryConfigured,
  recoveryCookie,
} from "@/lib/recovery-grant";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hash = url.searchParams.get("token_hash");
  if (
    isConfigured() &&
    recoveryConfigured() &&
    hash &&
    url.searchParams.get("type") === "recovery"
  ) {
    try {
      const client = await cookieClient();
      const { data, error } = await client.auth.verifyOtp({
        token_hash: hash,
        type: "recovery",
      });
      if (!error && data.session?.user) {
        const destination = new URL("/reset-password", url.origin);
        const returnTo = recoveryReturnUrl(
          url.searchParams.get("return_to"),
          process.env.AUTH_ALLOWED_ORIGINS,
        );
        if (returnTo) destination.searchParams.set("return_to", returnTo);
        const response = NextResponse.redirect(destination, {
          status: 303,
          headers: {
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
        response.cookies.set(
          recoveryCookie,
          createRecoveryGrant(data.session.access_token, data.session.user.id),
          {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
            maxAge: 600,
          },
        );
        return response;
      }
    } catch {
      // Keep provider details out of the redirect.
    }
  }
  return NextResponse.redirect(
    new URL("/forgot-password?error=invalid", url.origin),
    {
      status: 303,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
