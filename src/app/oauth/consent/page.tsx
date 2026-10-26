import { redirect } from "next/navigation";
import { cookieClient } from "@/lib/supabase/server";
import { authorizedClient, consentPath, pilotClient, safeOAuthRedirect } from "@/lib/sso-pilot";

export const dynamic = "force-dynamic";
export const metadata = { title: "Authorize app" };

export default async function Consent({ searchParams }: { searchParams: Promise<{ authorization_id?: string }> }) {
  const path = consentPath((await searchParams).authorization_id ?? "");
  if (!path || !pilotClient()) return <main><h1>Authorization unavailable</h1></main>;
  const client = await cookieClient();
  const { data: identity, error: identityError } = await client.auth.getUser();
  if (identityError || !identity.user) redirect(`/sign-in?next=${encodeURIComponent(path)}`);
  const authorizationId = new URL(path, "https://local.invalid").searchParams.get("authorization_id")!;
  const { data, error } = await client.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) return <main><h1>Authorization expired</h1><p>Return to MyHabits and try again.</p></main>;
  if ("redirect_url" in data) {
    const allowed = await client.rpc("has_app_access", { app_key: "myhabits" });
    const url = allowed.data === true && !allowed.error ? safeOAuthRedirect(data.redirect_url, pilotClient()!.callback) : null;
    if (url) redirect(url.href);
    return <main><h1>App access unavailable</h1></main>;
  }
  const pilot = await authorizedClient(client, data, identity.user.id);
  if (!pilot) return <main><h1>App access unavailable</h1><p>This request is not approved for your account.</p></main>;
  return <main className="auth-wrap"><section className="auth-card card">
    <h1>Continue to {data.client.name}?</h1>
    <p>{data.client.name} is requesting access to your account as {identity.user.email}.</p>
    <p>Requested information: {data.scope}</p>
    <p>Return address: {pilot.callback}</p>
    <form action="/oauth/consent/decision" method="post">
      <input type="hidden" name="authorization_id" value={authorizationId} />
      <button className="button primary" name="decision" value="approve" type="submit">Continue</button>
      <button className="button secondary" name="decision" value="deny" type="submit">Cancel</button>
    </form>
  </section></main>;
}
