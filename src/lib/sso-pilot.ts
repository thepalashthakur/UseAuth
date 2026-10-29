import "server-only";
import type { OAuthAuthorizationDetails } from "@supabase/auth-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pilotClient } from "@/lib/sso-pilot-config";
export { pilotRedirect } from "@/lib/sso-pilot-config";

export function consentPath(authorizationId: string) {
  if (!/^[a-zA-Z0-9_-]{1,256}$/.test(authorizationId)) return null;
  return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
}

export { safeOAuthRedirect } from "@/lib/sso-pilot-config";

export async function authorizedClient(client: SupabaseClient, details: OAuthAuthorizationDetails, userId: string) {
  const pilot = pilotClient(details.client.id);
  if (!pilot || details.client.id !== pilot.id || details.redirect_uri !== pilot.callback || details.user.id !== userId) return null;
  const { data, error } = await client.rpc("has_app_access", { app_key: pilot.appKey });
  return !error && data === true ? pilot : null;
}
