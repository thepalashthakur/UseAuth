import "server-only";
import type { OAuthAuthorizationDetails } from "@supabase/auth-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export function pilotClient() {
  const id = process.env.SSO_MYHABITS_CLIENT_ID;
  const callback = process.env.SSO_MYHABITS_REDIRECT_URI;
  if (!id || !callback) return null;
  try {
    const url = new URL(callback);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search || url.pathname !== "/auth/sso/callback") return null;
    return { id, callback: url.href };
  } catch {
    return null;
  }
}

export function consentPath(authorizationId: string) {
  if (!/^[a-zA-Z0-9_-]{1,256}$/.test(authorizationId)) return null;
  return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
}

export function safeOAuthRedirect(value: string, callback: string) {
  try {
    const url = new URL(value);
    const expected = new URL(callback);
    if (url.origin !== expected.origin || url.pathname !== expected.pathname || url.hash || url.username || url.password) return null;
    if (url.searchParams.has("code") === url.searchParams.has("error")) return null;
    return url;
  } catch {
    return null;
  }
}

export async function authorizedClient(client: SupabaseClient, details: OAuthAuthorizationDetails, userId: string) {
  const pilot = pilotClient();
  if (!pilot || details.client.id !== pilot.id || details.redirect_uri !== pilot.callback || details.user.id !== userId) return null;
  const { data, error } = await client.rpc("has_app_access", { app_key: "myhabits" });
  return !error && data === true ? pilot : null;
}
