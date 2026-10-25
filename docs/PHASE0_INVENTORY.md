# Phase 0 inventory — UseAuth and Time Logger

**Checked:** 2026-10-25. **Scope:** UseAuth is the identity service. Time Logger was the initially identified consumer; the inventory also found a configured MyJournal/Stillroom consumer. The owner confirmed that all apps and data in this setup are for testing and the data may be deleted. This is a read-only inventory; no database, Auth, Vercel, or application settings were changed. The earlier [repository audit](AUDIT_REPORT.md) predates the live checks below.

## Evidence and confidence

- **Live:** Vercel project/domain/environment-variable metadata; Supabase Auth dashboard settings, OIDC discovery/JWKS, service-role OpenAPI schema, and read-only `pg_catalog` queries in the project's SQL Editor. Keys, tokens, user records, and application table rows were not recorded.
- **Source:** [Time Logger repository](../../Timelogger/README.md), especially `src/lib/useauth.ts`, `src/app/api/auth/[action]/route.ts`, `src/lib/api.ts`, and `supabase/*.sql`; [UseAuth action contract](../src/lib/auth-contract.ts).
- **Limit:** There is no linked Supabase CLI project or database connection string. The SQL Editor verified relevant live catalog objects. A table-by-table policy review is still needed if the shared tables are retained for multi-app OAuth access. No real confirmation or recovery email was sent in this inventory.

## Test-environment decision

The owner confirmed that these are test apps with disposable data. **Phase 0 does not require preserving existing users or rows, a production data backup, a backfill, or an active-traffic audit.** A clean test-data reset is an available migration option; it has **not** been performed. Before any reset, identify the exact Supabase project and affected apps, then verify the intended tables/users and the effect of the 47 cascading `auth.users` foreign keys. Vercel configuration, secrets, OAuth client settings, and code still need a reversible rollout plan. If any app or data becomes real production use, revisit this decision before deletion or migration.

## Deployment and project map

| Component | Verified configuration |
| --- | --- |
| UseAuth | Vercel project `use-auth`; production deployment `READY`; domain `use-auth-rosy.vercel.app`; Next.js project. Environment variable names: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `APP_URL` for production/preview/development; `RECOVERY_GRANT_SECRET` for production. `AUTH_ALLOWED_ORIGINS` is absent. |
| Time Logger | Vercel project `timelogger`; production deployment `READY`; domain `timelogger-gilt.vercel.app`; Next.js project. Production and preview include `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `USEAUTH_URL`. The Vercel production `SUPABASE_URL` matches UseAuth's configured URL and the local Time Logger project host. Only this URL was compared; keys were not displayed or compared. |
| MyJournal/Stillroom | Vercel project `myjournal` has production `SUPABASE_URL` matching the UseAuth project and `USEAUTH_URL` matching its production origin. Its source calls UseAuth `/api/v1/auth` for sign-in/sign-up, `/me`, refresh, and sign-out. This is a second **configured** UseAuth consumer; current traffic was not checked. |
| Other shared data | MyMoney's production `SUPABASE_URL` matches this project, but its source uses Supabase Auth directly rather than UseAuth. MyHabits' current production `SUPABASE_URL` points elsewhere, although its tracker tables remain in this shared project's database. These are database/user-lifecycle dependencies, not confirmed UseAuth clients. |
| Supabase | Project host `mxooeohiyoyguugkutzi.supabase.co` from Time Logger's local configuration. The live Auth settings endpoint reports email provider enabled, sign-up enabled, and email autoconfirm disabled. The public JWKS contains an ES256 EC signing key. OIDC discovery advertises authorization, token, and JWKS endpoints and authorization-code response type. |

## Live Supabase Auth configuration

| Area | Observed state |
| --- | --- |
| OAuth Server | **Disabled** in the dashboard; no OAuth apps registered. OIDC discovery endpoints exist, but there is no configured authorization path or client for the proposed SSO flow. |
| Email login | Email enabled; new sign-ups and confirm-email enabled; anonymous login disabled. Minimum provider password length is **6**, while the UseAuth form enforces 8. Secure password change and provider-side current-password requirement are off; UseAuth separately checks current password for its hosted change route. |
| URL configuration | Site URL is `https://use-auth-rosy.vercel.app`. **No Redirect URLs are registered.** This does not match the UseAuth README's required `/auth/confirm` and `/auth/recovery` callbacks. |
| Email templates | Confirm-sign-up and reset-password templates use the default `{{ .ConfirmationURL }}` link. They do not contain the `{{ .TokenHash }}` links to UseAuth's confirmation/recovery handlers documented in its README. |
| SMTP | Custom SMTP is enabled, using an AWS SES endpoint. The sender display name is **MyJournal**, so UseAuth/Time Logger auth mail currently has another product's branding. SMTP credentials were not recorded. |
| Sessions | Access-token expiry 3600 seconds; refresh-token reuse interval 10 seconds; compromised-refresh-token detection on. Single-session, time-box, and inactivity controls are unavailable on the current Free plan. |
| Abuse controls | Sign-up/sign-in limit 30 requests per 5 minutes per IP; token verification 30 per 5 minutes; refresh 150 per 5 minutes; project email limit 30 per hour; minimum email interval 60 seconds per user. IP forwarding and CAPTCHA are off. |

## Current Time Logger authentication path

1. The browser sends credentials to Time Logger's `/api/auth/[action]` route on its own origin. The route forwards sign-in, sign-up, forgot-password, refresh, and sign-out requests to UseAuth `/api/v1/auth/[action]` from the server.
2. Time Logger stores the Supabase access and refresh tokens in host-only, `HttpOnly`, `SameSite=Lax` cookies; `Secure` is enabled in production. Its session route calls UseAuth `/me` or `/refresh`, then checks the returned user against `supabase.auth.getUser(accessToken)` in the configured Supabase project.
3. Time Logger's API accepts its session cookie or an explicit bearer token. It validates Supabase bearer tokens with `getUser`. Separately, `tl_` personal API tokens are looked up through a server-side service-role client. Time Logger's server also uses the service-role client for many catalog, analytics, calendar, and token operations, with `user_id` filters in source code.
4. This is a direct-credential/token integration, not OAuth client registration or cross-app SSO. A valid Supabase user token is not bound to Time Logger by `client_id`; moving to OAuth requires updating Time Logger's session creation and API policy, not only adding a UseAuth consent page.

## Live database surface

Service-role PostgREST OpenAPI lists these 13 Time Logger public tables:

`timelogger_api_tokens`, `timelogger_calendar_integrations`, `timelogger_calendar_sync`, `timelogger_calendar_webhook_secrets`, `timelogger_entry_tags`, `timelogger_google_connections`, `timelogger_google_sync`, `timelogger_jira_task_links`, `timelogger_projects`, `timelogger_tags`, `timelogger_task_hierarchy`, `timelogger_tasks`, `timelogger_time_entries`.

The live database catalog confirms **RLS is enabled on all 13 Time Logger tables**. It contains exactly two Time Logger policies, both on `timelogger_time_entries`: authenticated users may select and insert rows whose `user_id = auth.uid()`. The other 12 tables have no authenticated-user RLS policy and their live grants are to `service_role`; `timelogger_time_entries` also has authenticated select/insert grants. This fits the Time Logger server's service-role access pattern. An unauthenticated, zero-row REST query to each listed table returned HTTP 401; that does not replace user-by-user RLS testing.

The live catalog confirms `public.usernames` **does not exist**, there are **no non-internal triggers on `auth.users`**, and `supabase_migrations.schema_migrations` is absent. UseAuth's checked-in username reservation migration is therefore not applied in this project. There are **47 public foreign keys on `auth.users`**: 13 Time Logger tables and 34 other tables. RLS is enabled on all 34 other tables too; their individual policies and grants have not yet been reviewed. The other names map by repository source to MyJournal/Stillroom journal and entry tables, MyMoney finance tables, and MyHabits tracker tables. All 47 foreign keys use `ON DELETE CASCADE`; review the full set before any account deletion or identity migration.

## Findings that affect the next phase

| Priority | Finding | Action before rollout |
| --- | --- | --- |
| High | Time Logger calls `reauthenticate` and `update-profile`, but UseAuth's current action list has neither. A read-only GET to deployed `/api/v1/auth/reauthenticate` returned 404. Time Logger also sends `new_password`, while UseAuth's current `change-password` contract expects `password`; the extra field is rejected. | Reconcile the two applications' auth contracts and test profile/password flows in staging. |
| High | Time Logger accepts general Supabase user sessions and relies on server-side service-role operations. | During OAuth migration, bind sessions to the registered Time Logger client and review every service-role path for app membership and `user_id` enforcement. Do not assume RLS protects service-role calls. |
| High | The live project has no registered Auth Redirect URLs, and its confirmation/recovery templates use default Supabase links rather than the UseAuth handlers. | Align exact redirect URLs and templates with the hosted flows, then verify fresh confirmation and recovery emails in staging before changing production. |
| Medium | `auth.users` has 34 non-Time-Logger public-table dependents. All are test data per the owner, but deleting a user cascades across these tables. | Use an explicit reset scope if clearing test data; review their policies before retaining them for cross-app OAuth access. |
| High | MyJournal/Stillroom is also configured in production to call UseAuth's token API. | Include it in compatibility testing and migration planning; confirm whether its deployment has active users before changing the API. |
| Medium | UseAuth's Vercel environment lacks `AUTH_ALLOWED_ORIGINS`. Server-to-server token calls without `Origin` can still work, but configured app-origin browser CORS and app-specific recovery return URLs are not available through that setting. | Decide the recovery return URL and browser integration contract, then configure exact origin/redirect values and test them. |
| Medium | UseAuth's `public.usernames` migration is not applied; the live table and signup trigger are absent. | Decide whether username reservation is needed, then review duplicate/backfill effects before applying a migration. |
| Medium | Auth's minimum password length is 6, CAPTCHA is off, and SMTP sender name is MyJournal. | Align provider policy and email branding with UseAuth's intended experience during Phase 1 hardening. |
| Open | OAuth Server is disabled and no client is registered, so the Phase 3 flow cannot run yet. | Pilot on staging after the app-access model and existing flow corrections are ready. |

## Remaining read-only checks

- [x] Supabase Auth dashboard: Site URL, Redirect URLs, SMTP/email templates, password/session policies, rate limits, OAuth Server state, and registered clients.
- [x] Database catalog: Time Logger table RLS flags, policies, grants, `auth.users` trigger count, `public.usernames` existence, migration table existence, and public FK count.
- [x] Identify the 34 other `auth.users` dependent tables and likely repository owners: MyJournal/Stillroom, MyMoney, and MyHabits.
- [ ] If retaining other apps' tables for cross-app OAuth access, review their live policies, grants, functions, and triggers before issuing client-bound tokens.
- [x] Compare production Vercel `SUPABASE_URL` values for UseAuth and Time Logger without recording keys; they match.
- [x] Record owner decision that all current apps and data are test-only and may be reset; no active-traffic or data-backfill gate is needed for Phase 0.

## Phase 0 exit condition

**Phase 0 is complete for the test-only scope.** The relevant consumers, live Auth settings, Time Logger schema/policies, and shared `auth.users` dependencies have been identified. The next work is Phase 1 stabilization and real email-flow verification. Review the other apps' row policies before exposing them to new OAuth clients, and verify exact deletion scope before any test-data reset.
