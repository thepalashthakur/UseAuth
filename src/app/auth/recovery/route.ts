import { NextResponse } from "next/server";
import { cookieClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/config";
import { recoveryReturnUrl } from "@/lib/auth-contract";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const hash = url.searchParams.get("token_hash");
  if (isConfigured() && hash && url.searchParams.get("type") === "recovery") {
    try {
      const client = await cookieClient();
      const { error } = await client.auth.verifyOtp({
        token_hash: hash,
        type: "recovery",
      });
      if (!error) {
        const destination = new URL("/reset-password", url.origin);
        const returnTo = recoveryReturnUrl(
          url.searchParams.get("return_to"),
          process.env.AUTH_ALLOWED_ORIGINS,
        );
        if (returnTo) destination.searchParams.set("return_to", returnTo);
        return NextResponse.redirect(destination, {
          status: 303,
          headers: {
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
          },
        });
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
