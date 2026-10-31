# Shared auth contract baseline

**Recorded:** 2026-10-31. **Purpose:** preserve the working password/session bridge while Phase 3 adds app-aware returns and hardens consumers. This is a source-level compatibility baseline, not a claim that every legacy data path is isolated. Source snapshots: UseAuth `2d967cf` (`feat/sso-pilot`), Time Logger `1fd3d47` (`feat/sso-pilot`), MyHabits `5797c62` (`feat/sso-pilot`), MyJournal/Stillroom `291a2e9` (`main`), MyMoney `79e333c` (`main`). MyJournal and MyMoney are read-only inventory here; their current deployments were not retested for this baseline.

## Compatibility rule

Treat `/api/v1/auth/[action]` as the shared **v1** server-to-server contract. Keep its action names, HTTP methods, request field names, success fields, error envelope, and response status meanings stable while consumers migrate. A change to token refresh, logout, confirmation/recovery links, or cookie ownership requires a versioned migration or coordinated consumer updates and live disposable-account checks. Supabase remains the issuer and `auth.users.id` remains the shared UUID. Consumer cookies and OAuth client secrets are never shared between app origins.

The `src/lib/auth-contract.ts` schemas and `src/lib/auth-handler.ts` are the UseAuth implementation. The current `tests/auth-handler.test.ts` exercises v1 validation and response behavior. This document pins the external shape; the next Phase 3 item will change the app-return flow only with its own acceptance tests.

## UseAuth v1 surface

Both route families use JSON POST bodies capped at 16 KiB and `Cache-Control: private, no-store`. POST errors use `{ "error": { "code": string, "message": string } }`, and responses include `X-Request-Id`. Provider rate limits are surfaced as HTTP 429. The token route permits server/native clients without `Origin`; a supplied browser `Origin` must match UseAuth or `AUTH_ALLOWED_ORIGINS`. The hosted cookie route requires its own `Origin` for mutations and rejects cross-site fetch metadata. CORS alone is not app identity.

| Action | `POST /api/v1/auth/…` request and success | Hosted `/api/browser/auth/…` difference |
| --- | --- | --- |
| `sign-up` | `{email,password,username?,display_name?,platform?}`; HTTP 201 with `{user,session,confirmation_required,message}`. `session` is null and `user` may be null while email confirmation is required. `platform` is token-only for configured iOS/Android callbacks. | Same request except `platform`; no session object in JSON. Supabase SSR cookies hold a confirmed session. |
| `sign-in` | `{email,password}`; HTTP 200 with `{user,session,confirmation_required,message}`. | No session object in JSON; the hosted session uses its own HttpOnly cookies. |
| `me` | **GET** with `Authorization: Bearer <access_token>`; HTTP 200 `{user}` or 401. | **GET** uses the hosted cookie session. |
| `refresh` | `{refresh_token}`; HTTP 200 `{session,user}` or 401. | Not exposed; the hosted session refreshes through Supabase SSR/proxy. |
| `sign-out` | `{access_token,refresh_token}`; HTTP 200 `{message}` after local Supabase sign-out. | JSON POST with hosted cookies; local sign-out. |
| `forgot-password` | `{email,return_to?}`; generic HTTP 200 `{message}` for an unknown address. An allowed `return_to` must be an exact configured origin, with no query/fragment, and match a supplied foreign `Origin`. | Same generic response; hosted recovery is the default. |
| `resend-confirmation` | `{email}`; generic HTTP 200 `{message}` for unknown/already-confirmed addresses. | Same behavior. |
| `change-password` | `{access_token,refresh_token,current_password,new_password,nonce?}`; HTTP 200 `{user,session,message}` after verifying the current password. | `{current_password,password}` under the hosted session; HTTP 200 `{message}`. |
| `reauthenticate` | `{access_token,refresh_token}`; HTTP 200 `{message,session}`. | Not exposed. |
| `update-profile` | `{access_token,refresh_token,display_name}`; HTTP 200 `{user,session}`. | Not exposed; the hosted account page handles profile changes. |
| `reset-password` | Not exposed. | `{password}` under a verified recovery session and a short-lived `useauth-recovery` grant; HTTP 200 `{message}`, then the local recovery session is signed out. |

The public user object has `id`, `email`, `email_verified`, `created_at`, `username`, and `display_name`. A token `session` has `access_token`, `refresh_token`, `expires_at`, `expires_in`, and `token_type`. Access tokens go in server-side `Authorization` headers or host-only HttpOnly cookies; refresh tokens stay server-side/in HttpOnly cookies. No access or refresh token belongs in an app-return URL, browser storage, logs, or analytics.

## Email and browser return boundary

Hosted `/auth/confirm` verifies `token_hash` (`email`/`signup`) and currently returns to UseAuth `/account`; invalid links go to `/sign-in?error=confirmation`. Hosted `/auth/recovery` verifies a recovery hash, issues a 10-minute HMAC-bound `useauth-recovery` cookie, and redirects to `/reset-password`; invalid links go to `/forgot-password?error=invalid`. Configured mobile confirmation callbacks verify the hash and return only a `confirmation=success|error` result to the app URL. The UseAuth sign-in/up `next` parameter currently accepts only the local `/oauth/consent?authorization_id=…` shape.

An allowlisted `return_to` can appear in the existing forgot/reset flow, but there is no verified, identity-bound initiating-app context for all confirmation and recovery emails. The next Phase 3 item owns that gap. Existing app-specific guidance often sends users back to an app manually after they finish on UseAuth.

## Consumer sessions and legacy token paths

| Consumer | Current login/session contract | Other accepted tokens or sensitive paths | Compatibility and isolation boundary |
| --- | --- | --- | --- |
| Time Logger | Own `/api/auth/[action]` forwards password actions to UseAuth v1. It verifies the returned UUID/email with the shared Supabase project and `has_app_access('timelogger')`, then sets host-only `timelogger_auth_access` and `timelogger_auth_refresh` HttpOnly, Secure-in-production, SameSite=Lax cookies. `/api/auth/session` uses `/me`, then `/refresh` on expiry. Preview SSO instead uses encrypted `__Host-tl-oauth` and proxy refresh. | Protected API routes also accept an explicit Supabase Bearer JWT, which takes precedence over cookies. `tl_` personal API tokens are generated once, SHA-256 hashed in `timelogger_api_tokens`, limited to 10 active/90 days, and accepted by many API routes. Service-role operations use explicit user filters. Google Calendar OAuth tokens are a separate downstream integration. | Preserve v1 refresh and profile/password field names. Session JWTs require `getUser` and current app membership. Personal tokens require current membership via the service-role helper. Full service-role/data-path audit remains Phase 4. |
| MyHabits | Own `/api/auth/[action]` forwards sign-in/up/resend to UseAuth v1, then `supabase.auth.setSession` in app-owned Supabase SSR cookies after matching the same user and checking `has_app_access('myhabits')`. Local sign-out clears that session. Preview SSO uses encrypted `__Host-mh-oauth` and proxy refresh. | `apiDatabase` accepts an explicit Supabase Bearer JWT for `/api/v1/*` and `/api/mcp`; it otherwise uses the SSO or Supabase cookie session. MCP requires Bearer explicitly. | Keep the v1 `session` fields and `confirmation_required` response. `getUser` plus membership gates the route, but a legacy Supabase JWT without an OAuth `client_id` remains a valid compatibility path. Full direct-data review remains Phase 4. |
| MyJournal/Stillroom | Own `/api/auth/[action]` forwards sign-in/up/out to UseAuth v1. Host-only `stillroom_access`/`stillroom_refresh` HttpOnly, Secure-in-production, SameSite=Lax cookies hold the Supabase tokens; `/api/auth/refresh` redirects back to `/today` after v1 refresh. | The access JWT is sent to UseAuth `/me`, Supabase Data API, and the S3 signing service as Bearer. | Source does not show a current app-membership check in `getCurrentUser`/`userDb`. Preserve v1 login, refresh, me, and sign-out until this consumer is migrated. Deployment behavior not rechecked here. |
| MyMoney | Own `/api/session/[action]` forwards sign-in/up/refresh/out to UseAuth v1 (configured `AUTH_SERVICE_URL`, with the UseAuth public origin as code fallback). Host-only `mymoney_access`/`mymoney_refresh` HttpOnly, Secure-in-production, SameSite=Lax cookies hold Supabase tokens. | APIs accept either an explicit Supabase Bearer JWT or the access cookie; MCP requires Bearer. A bearer is also forwarded to the S3 signing service. | Current source calls UseAuth v1; earlier Phase 0 described this app as direct Supabase Auth, so treat current deployed configuration as unverified. `identity()` checks `getUser` but no current app membership in this source. Preserve v1 until audited/migrated. |

For Time Logger and MyHabits preview OAuth, each client has its own exact callback, client ID, encrypted app cookie, and refresh token. The shared database migrations bind OAuth client IDs to app access for the piloted tables/RPCs; legacy Supabase user JWTs without `client_id` remain accepted for compatibility. This is why retiring the credential bridge and completing a whole-database isolation audit are separate gates.

## Change gate for Phase 3

1. Add app-aware confirmation/recovery returns without replacing the v1 request/response fields or sending tokens in URLs. Test Time Logger, MyHabits, and the configured MyJournal/MyMoney compatibility paths before changing v1 behavior.
2. Keep local app sign-out separate from UseAuth/Supabase-wide revocation. Preserve refresh-token rotation and clear denied or mismatched app sessions.
3. Inventory and migrate each explicit Bearer, personal-token, and service-role path before claiming all app data is client-isolated. This document identifies entry points; the Phase 4 table/RPC/Realtime inventory is still pending.
