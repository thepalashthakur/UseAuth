import { NextResponse } from "next/server";
import { cookieClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/config";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (isConfigured() && hash && (type === "email" || type === "signup")) {
    try {
      const client = await cookieClient();
      const { error } = await client.auth.verifyOtp({ token_hash: hash, type });
      if (!error)
        return NextResponse.redirect(new URL("/account", url.origin), {
          headers: {
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
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
