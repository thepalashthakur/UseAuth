import { NextResponse } from "next/server";
import { cookieClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/config";
import { appOrigin, mobileAppUrl } from "@/lib/config";
import { readAppReturn, registeredAppOrigin } from "@/lib/app-return";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const hintedRedirect = url.searchParams.get("redirect_to");
  let contextValue = url.searchParams.get("context");
  if (hintedRedirect) {
    try {
      const hinted = new URL(hintedRedirect);
      if (hinted.origin === appOrigin() && hinted.pathname === "/auth/confirm")
        contextValue = hinted.searchParams.get("context");
      for (const platform of ["ios", "android"] as const) {
        if (hinted.origin === appOrigin() && hinted.pathname === `/auth/mobile/confirm/${platform}` &&
            hinted.search === "" && hinted.hash === "" &&
            mobileAppUrl(platform) && hash && (type === "email" || type === "signup")) {
          const mobile = new URL(hinted);
          mobile.searchParams.set("token_hash", hash);
          mobile.searchParams.set("type", type);
          return NextResponse.redirect(mobile, { status: 303, headers: {
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
          } });
        }
      }
    } catch { /* Ignore untrusted redirect hints. */ }
  }
  if (isConfigured() && hash && (type === "email" || type === "signup")) {
    try {
      const client = await cookieClient();
      const { data, error } = await client.auth.verifyOtp({ token_hash: hash, type });
      if (!error) {
        const context = data.user?.email
          ? readAppReturn(contextValue, data.user.email, "confirmation")
          : null;
        const origin = context ? await registeredAppOrigin(client, context.appId) : null;
        const destination = origin === context?.origin
          ? new URL("/auth/return?result=confirmed", origin)
          : new URL("/account", url.origin);
        return NextResponse.redirect(destination, {
          headers: {
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
      }
    } catch {
      /* Show a recoverable message without exposing provider details. */
    }
  }
  return NextResponse.redirect(
    new URL("/sign-in?error=confirmation", url.origin),
    {
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
