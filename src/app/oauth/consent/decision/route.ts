import { NextResponse } from "next/server";
import { cookieClient } from "@/lib/supabase/server";
import { authorizedClient, consentPath, safeOAuthRedirect } from "@/lib/sso-pilot";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  if (request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") return new Response("Forbidden", { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 4096) return new Response("Invalid request", { status: 400 });
  const form = await request.formData().catch(() => null);
  const id = form?.get("authorization_id");
  const decision = form?.get("decision");
  if (typeof id !== "string" || !consentPath(id) || (decision !== "approve" && decision !== "deny")) return new Response("Invalid request", { status: 400 });
  const client = await cookieClient();
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity.user) return new Response("Sign in required", { status: 401 });
  const details = await client.auth.oauth.getAuthorizationDetails(id);
  if (details.error || !details.data || !("authorization_id" in details.data)) return new Response("Authorization expired", { status: 400 });
  const pilot = await authorizedClient(client, details.data, identity.user.id);
  if (!pilot) return new Response("App access unavailable", { status: 403 });
  const result = decision === "approve" ? await client.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true }) : await client.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true });
  const target = result.data?.redirect_url && safeOAuthRedirect(result.data.redirect_url, pilot.callback);
  if (result.error || !target) return new Response("Authorization failed", { status: 502 });
  return NextResponse.redirect(target, { status: 303, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
