# Supabase SSO pilot

Decision: use the existing Supabase project as the only identity provider. Supabase's OAuth 2.1/OIDC Server is currently beta, so the new flow stays on `feat/sso-pilot` and Vercel previews until browser and data-access acceptance passes. The deployed credential flow remains the fallback.

## Progress

- [x] Preserve the three current releases with pushed tags and isolated SSO branches/worktrees.
- [x] Add a UseAuth consent page with exact MyHabits client/callback allowlist and membership check. It is dormant unless `SSO_MYHABITS_CLIENT_ID` and `SSO_MYHABITS_REDIRECT_URI` are set.
- [x] Implement MyHabits authorization start, code exchange, ID-token validation, encrypted app-owned session, OAuth refresh, and local logout on its SSO branch. Local checks pass; live behavior remains unverified.
- [x] Draft client-bound RLS and callable-RPC guards in `supabase/migrations/20261027000000_sso_client_bound_data_access.sql`. PGlite checks passed for client isolation, privileged RPC denial, legacy compatibility, revocation, and the shared habit timer. The migration has not been applied to Supabase.
- [ ] Enable Supabase OAuth Server, register test clients, configure preview secrets, and run live browser acceptance after action-time approval.
- [ ] Pilot Time Logger after MyHabits passes, then review merges and production promotion.

## Git safety

The pushed annotated tag `pre-sso-2026-10-26` records the working release in UseAuth, Time Logger, and MyHabits. Each repository has a pushed `feat/sso-pilot` branch and a linked worktree under `/Users/p/Github/.worktrees/`. Keep SSO commits on these branches. Time Logger's pre-existing uncommitted files and MyHabits' untracked document in the original checkouts are outside this pilot. Merge and promote each app independently after its acceptance gate; revert the app deployment before changing provider settings if a live issue appears.

## Flow

1. MyHabits starts an authorization-code request to Supabase with PKCE S256, random `state` and `nonce`, exact callback URI, and `openid email profile` scopes. UseAuth is the Supabase authorization UI at `/oauth/consent`.
2. UseAuth authenticates with its existing Supabase browser session, gets authorization details from Supabase, and accepts only a configured client ID and exact callback for the active app. It checks `has_app_access` before consent. Consent approval and denial use Supabase SDK methods; no custom token issuer is introduced.
3. MyHabits checks `state`, exchanges the code from its server with a confidential client secret and PKCE verifier, validates the ID token against Supabase JWKS, issuer, audience, expiration, and nonce, and creates its own host-only HttpOnly session. Refresh uses Supabase's OAuth token endpoint and rotates the stored refresh token.
4. MyHabits checks its own membership on protected requests. Keep its existing credential path available until OAuth sessions, refresh, logout, recovery, and direct data access have been tested. Then pilot Time Logger separately.

## Configuration and access gate

- Use one OAuth client per app and environment. Register exact HTTPS callbacks only. Store client secrets in server-only Vercel environment variables.
- The new private `auth_platform.oauth_clients` table maps each exact preview or production client ID and callback to one existing app. The old single `applications.oauth_client_id` column cannot represent both preview and production clients and is not used for the pilot. OAuth data access stays denied until the new client row is active.
- Set Supabase Site URL to the UseAuth origin and OAuth Authorization Path to `/oauth/consent`. The project's ES256 signing key supports OIDC ID tokens.
- Keep OAuth disabled until consent and consumer code pass local checks, app-specific RLS is reviewed, and the preview deployment is ready. Enabling OAuth Server and registering a client in the dashboard require action-time confirmation.
- Phase 2 automatically grants registered active apps to current and future test users. Review this policy before any real users or outside apps join.
- Supabase OAuth access tokens have `aud: authenticated`; `client_id` and RLS must enforce app boundaries. Test direct Data API/RPC access with a token for the wrong app and with a revoked membership. The existing legacy tokens also require policy review.
- MyHabits' current `tracker_*` policies check `auth.uid() = user_id` only. Several `tracker_*` RPCs are `SECURITY DEFINER`, so table RLS alone cannot secure those paths. The drafted migration adds both client-bound table policies and callable-RPC guards. The deliberate shared-timer exception permits a MyHabits client to access only its habit-linked Time Logger entries. Compare the live catalog and function definitions with the migration before applying it; the local fixture is not proof of the current live schema.

## Acceptance

- New user: hosted registration and email confirmation, then return to MyHabits and start the OAuth redirect again if the pending authorization expired. Verify the MyHabits callback, app-owned session, and same identity in UseAuth and Time Logger. A direct continuation from the confirmation email remains a follow-up UX check.
- Existing user: sign in once through UseAuth and then enter MyHabits without typing the password again; repeat from Time Logger when piloted.
- Refresh rotates; local sign-out clears only the app session; revoked/disabled app loses API and direct database access; invalid state, nonce, code, client, callback, and expired session fail closed.
- Recovery and password change work through UseAuth; browser returns to the initiating app without credentials in the URL.
- Pass lint, typecheck, build, tests, and live disposable-account checks on previews before any merge or production promotion. Record the deployed commit and rollback deployment ID.

Sources: [Supabase OAuth getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started), [OAuth flows](https://supabase.com/docs/guides/auth/oauth-server/oauth-flows), [Token security and RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security).
