import { NextResponse } from "next/server";
import { mobilePlatform } from "@/lib/auth-contract";
import { isConfigured, mobileAppUrl } from "@/lib/config";
import { tokenClient } from "@/lib/supabase/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ platform: string }> },
) {
  const { platform: rawPlatform } = await context.params;
  const platform = mobilePlatform.safeParse(rawPlatform);
  if (!platform.success)
    return new Response("Unknown mobile platform.", { status: 404 });
  const appUrl = mobileAppUrl(platform.data);
  if (!isConfigured() || !appUrl)
    return new Response("Mobile confirmation is unavailable.", { status: 503 });

  const url = new URL(request.url);
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  let confirmed = false;
  if (hash && (type === "email" || type === "signup")) {
    try {
      const { error } = await tokenClient().auth.verifyOtp({
        token_hash: hash,
        type,
      });
      confirmed = !error;
    } catch {
      // Return to the app with a generic failure, without exposing provider details.
    }
  }
  appUrl.searchParams.set("confirmation", confirmed ? "success" : "error");
  return NextResponse.redirect(appUrl, {
    status: 303,
    headers: {
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
