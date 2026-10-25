# UseAuth implementation plan

**Status:** Phase 1 in progress, updated 2026-10-26. **Phase 0 is complete for the current test-only setup.** The owner confirmed all current apps and data are for testing and the data may be deleted. Findings and the reset boundary are in [PHASE0_INVENTORY.md](PHASE0_INVENTORY.md); the earlier [repository audit](AUDIT_REPORT.md) and [architecture proposal](ARCHITECTURE.md) provide more detail.

## Progress tracker

Check an item only after its acceptance check has passed, and add the date plus evidence in the change log below. A passing mocked test alone does not verify a live authentication flow.

### Phase 0 — Baseline and evidence

- [x] Audit the repository, current auth flows, dependencies, and known verification gaps. See [AUDIT_REPORT.md](AUDIT_REPORT.md).
- [x] Trace Time Logger through its source, Vercel project metadata, and live Supabase API surface; identify MyJournal/Stillroom as another configured UseAuth client. See [PHASE0_INVENTORY.md](PHASE0_INVENTORY.md).
- [x] Inventory live Supabase Auth settings: OAuth Server availability, signing algorithm, email templates, SMTP, redirect URLs, rate limits, and session policy. See [PHASE0_INVENTORY.md](PHASE0_INVENTORY.md).
- [x] Verify live Time Logger table presence, RLS flags/policies/grants, and `auth.users` trigger/foreign-key counts.
- [x] Identify the relevant shared-database dependencies: 47 public tables reference `auth.users`; all have RLS enabled, including the 13 Time Logger tables. See [PHASE0_INVENTORY.md](PHASE0_INVENTORY.md).
- [x] Identify configured UseAuth consumers, their domains, token storage, and API access paths: Time Logger and MyJournal/Stillroom.
- [x] Record the test-only, disposable-data decision and the reset boundary. Full policy review of retained non-Time-Logger tables moves to Phase 4 before their OAuth access is enabled.

### Phase 1 — Existing flow stabilization

- [x] Update affected dependencies and run lint, typecheck, tests, build, and dependency audit.
- [x] Verify real sign-up, email confirmation, sign-in, account access, password change, forgot/reset password, refresh, and logout in the current disposable test project.
- [x] Add resend verification and repair any failures found in recovery sign-out or hosted session refresh.
- [x] Add abuse controls and redacted security event logging for public auth routes.
- [x] Test expired sessions, CSRF/origin rejection, rate limits, invalid links, and recovery replay.

**Open Phase 1 check:** Verify successful resend delivery after Supabase's email throttle cools down. The live resend request returned provider HTTP 429 and UseAuth preserved that response. Request-ID logs redact credentials; live origin, invalid-token, rate-limit, and recovery-replay checks passed. The SMTP display name still says “MyJournal” and should be made neutral before onboarding another app. Revisit the 100/min/IP WAF threshold before real traffic: server-side consumers may share an egress IP.

### Phase 2 — Application access model

- [ ] Decide who registers apps and grants/revokes user membership; default to explicit access grants.
- [ ] Define app/client mapping, per-environment callback ownership, active status, membership, and admin permissions.
- [ ] Review database migrations and RLS against the live schema; use a clean test-data reset instead of a backfill where it simplifies the model, after verifying deletion scope.
- [ ] Prove unknown/inactive apps and users without membership are denied without breaking existing consumers.

### Phase 3 — OAuth/OIDC pilot

- [ ] Enable and verify Supabase OAuth Server in the current test project; confirm its existing ES256 signing works for OIDC.
- [ ] Register one development client with an exact callback URL.
- [ ] Implement hosted authorization/consent UI that obtains verified request details from Supabase and checks app membership.
- [ ] Integrate one Next.js consumer using authorization code + PKCE and an app-owned server session.
- [ ] Reject wrong client, redirect, state, nonce, PKCE verifier, issuer, audience, inactive app, and nonmember.

### Phase 4 — Multi-app rollout

- [ ] Register a separate OAuth client for each app and environment with exact HTTPS callbacks.
- [ ] Enforce `client_id`, resource audience/policy, app membership, and user ownership in each API and relevant RLS policy.
- [ ] Verify App A's token cannot access App B's APIs or rows; test same-domain and unrelated-domain browser flows.
- [ ] Define app logout, UseAuth logout, global logout, session revocation, and the legacy token API migration schedule.
- [ ] Migrate consuming apps one at a time with rollback controls.

### Phase 5 — Reusable integration

- [ ] Publish a small OAuth client core and Next.js server adapter for redirect, callback validation, session, refresh, and logout.
- [ ] Provide a working example app and configuration guide for app owners.
- [ ] Verify no client secret or refresh token reaches browser storage or logs.

### Phase 6 — Security and operations

- [ ] Run the negative security test matrix and document remaining risks.
- [ ] Configure alerting, redacted audit events, health checks, and operational ownership.
- [ ] Document staging/production setup, key and client-secret rotation, backup, rollback, and incident response.
- [ ] Complete staging and production smoke tests and a rollback drill.

## Change log

| Date | Phase/item | Change and verification evidence |
| --- | --- | --- |
| 2026-10-25 | Phase 0: repository audit | Repository review recorded in [AUDIT_REPORT.md](AUDIT_REPORT.md). Live Supabase and database state remain unverified. |
| 2026-10-25 | Phase 0: Time Logger inventory | Read-only source, Vercel metadata, and limited live Supabase checks recorded in [PHASE0_INVENTORY.md](PHASE0_INVENTORY.md). Live RLS and dashboard-only settings remain open. |
| 2026-10-25 | Phase 0: live Supabase inventory | Read-only dashboard and catalog checks added to [PHASE0_INVENTORY.md](PHASE0_INVENTORY.md). OAuth Server is disabled, no Auth Redirect URLs are registered, and 34 other tables depend on `auth.users`. No provider settings or data were changed. |
| 2026-10-25 | Phase 0: consumer discovery | Vercel production configuration and source show MyJournal/Stillroom also calls UseAuth. Its current traffic was not needed to classify the test-only setup. |
| 2026-10-25 | Phase 0: test-data decision | Owner confirmed all current apps and data are for testing and data may be deleted. Phase 0 closed for this scope; no data has been deleted. See [PHASE0_INVENTORY.md](PHASE0_INVENTORY.md). |
| 2026-10-25 | Phase 1: code and dependencies | Updated Next.js to 16.4.3, Zod to 4.6.6, and Vitest to 5.0.3. Added confirmation resend, token-client account actions, hosted reset session cleanup, hosted recovery refresh coverage, request-ID security logging, and verification-session cleanup after current-password checks. `npm run lint`, `npm run typecheck`, `npm test` (53 passing), `npm run build`, and `npm audit --audit-level=moderate` (0 vulnerabilities) passed. |
| 2026-10-25 | Phase 1: Supabase configuration | Registered exact hosted confirmation and recovery URLs; updated both email templates; raised password minimum to eight characters; enabled password-changed notice; applied `public.usernames` migration after a duplicate preflight. Verified table, availability function, RLS, and trigger exist. No test rows were deleted. |
| 2026-10-25 | Phase 1: live smoke | Promoted Vercel deployment `dpl_5X2788jLoSvBk8us1YD1N45YeRdR` after staging health check. A disposable account completed sign-up, email confirmation, hosted account page, token sign-in, account lookup, refresh, current-password change, sign-in with the new password, forgot-password email, recovery-link landing, and logout. Reusing the recovery link went to the invalid-link page. The owner completed the hosted reset form; it showed “Password updated.” The old password was rejected and sign-in with the new password opened the account page. Chrome had first filled the base Gmail address; the successful sign-in used the actual `+myapps` test address. |
| 2026-10-25 | Phase 1: negative smoke | Public hosted sign-in rejected a foreign Origin with HTTP 403. Public `/me` rejected a forged/expired bearer token with HTTP 401. Both returned request IDs without credential data. Unit tests cover provider 429 forwarding, invalid recovery grants, and origin allowlisting; a live provider 429 is still open. |
| 2026-10-25 | Phase 1: edge abuse control | Published Vercel WAF rule `rule_auth_post_baseline_JHsCCX` for POST paths under `/api/`: fixed 100 requests per 60 seconds per IP, HTTP 429 above the limit. First published in log-only mode, then promoted to enforcement; inspected the active rule and confirmed a normal POST still reaches application validation (HTTP 400). Supabase provider-specific limits remain in place. |
| 2026-10-25 | Phase 1: Time Logger compatibility | The previous Time Logger production deployment `dpl_Bnuhx6xSTQK2YiwxfAHnueHXfJcR` lacked `/api/auth/[action]` and returned HTML 404. Built the committed Time Logger source in a temporary snapshot, leaving its uncommitted working tree untouched; 14 tests and the production build passed. Staged deployment `dpl_9nxc7gTTe3FcvewFVLRq5KUDXqBd` returned the expected JSON session response and forwarded an invalid sign-in to UseAuth. Promoted it and verified the public route. Disposable account tests then passed Time Logger sign-in, session, profile update, current-password change, logout, and sign-in with the new password; the test account was removed. |
| 2026-10-25 | Phase 1: resend/rate-limit check | A second disposable account received `confirmation_required: true` on sign-up. An immediate resend reached Supabase's email throttle and UseAuth returned HTTP 429 `RATE_LIMITED`; the account was removed. Resend success and email delivery remain unverified until the provider cooldown ends. |
| 2026-10-25 | Phase 1: MyHabits consumer | Confirmed MyHabits production uses the same Supabase project with a disposable shared identity. Its linked source is `/Users/p/Github/MyCodexV1/MyHabits`. Changed its server sign-in/sign-up route to call UseAuth and verify the returned session against MyHabits' Supabase project before setting host-only HttpOnly cookies. Added `USEAUTH_URL` to its Vercel production/preview/development config and a hosted recovery link. Updated its lockfile to remove three dependency advisories. MyHabits lint, typecheck, build, and 41 tests passed. Staged and promoted Vercel deployment `dpl_6cCNd2wuNTh8V7shvmN3P1U5bcg5`. On the public domain, disposable-account sign-in, profile read, Today page, logout, and post-logout 401 all passed; the account was removed. Its separate untracked document was left untouched. This is a direct-credential compatibility bridge; OAuth SSO remains Phase 3/4 work. |
| 2026-10-26 | Phase 1: MyHabits sign-up | The public MyHabits sign-up route returned HTTP 201 with `confirmationRequired: true` through UseAuth. An immediate confirmation resend returned the provider's HTTP 429 throttle, which UseAuth forwarded correctly. The disposable unconfirmed account was removed. Successful resend delivery remains open after cooldown. |
| 2026-10-26 | Phase 1: MyHabits local setup | Aligned the ignored MyHabits `.env.local` with the shared test Supabase project and `USEAUTH_URL`; preserved its previous contents in a private temporary backup. A fresh build from the linked checkout passed with the updated configuration. |
| 2026-10-26 | Phase 1: Time Logger registration and recovery | The reported Time Logger account exists in Supabase but is unconfirmed and has never signed in. A disposable account registered through Time Logger, opened its UseAuth confirmation link, then signed in through Time Logger with a valid app session. Its password change and sign-in with the new password passed. A forgot-password request delivered a link that opened the hosted UseAuth reset form; hosted reset submission had passed in the earlier UseAuth live smoke. Added clear confirmation/return-to-app guidance and a resend action to Time Logger. Tested the isolated release snapshot with 14 tests, typecheck, and production build; staged deployment `dpl_kxoXZViNygcuFC9MZZjF1xxFBaBX` returned the expected validation response for the new resend route, then promoted it and checked the public Time Logger URL. Removed the disposable account. The reported account owner still needs to open its existing confirmation email before signing in. |
| 2026-10-26 | Phase 1: MyHabits confirmation guidance | MyHabits already forwarded registration and sign-in to UseAuth, showed a confirmation-required state, and linked to hosted password recovery; an earlier disposable sign-up returned HTTP 201 with confirmation required. Added explicit UseAuth email/return guidance, a same-origin confirmation resend proxy and UI, and a Settings link to hosted password management. The resend proxy does not establish a MyHabits session and preserves provider HTTP 429. The isolated release snapshot passed 42 tests, lint, typecheck, and production build. Staged deployment `dpl_9ZPv2iFP1AUJMJ5WJApn91fjG529` returned the expected HTTP 400 for an empty resend address, was promoted, and passed the same check on `myhabits-dun.vercel.app`. Successful resend delivery remains subject to the shared Supabase email throttle and is not yet verified. |

## Design constraints and preserved behavior

Keep Supabase Auth as the password, OTP, session, refresh, and token issuer. Retain the hosted account/registration/recovery UI, `/api/v1/auth` contract while consumers migrate, and the current mobile confirmation callbacks. Existing test identities and rows may be reset; `public.usernames` was added in Phase 1. Verify exact deletion scope before resetting anything, and review retained RLS policies before exposing new OAuth clients. Do not publish an SDK that implies SSO before a standards-based flow exists.

The target is a centralized identity service with registered OAuth clients, an application membership decision, and each app's own session and authorization layer. Supabase OAuth 2.1/OIDC (currently documented as **beta**) is the preferred authorization server, subject to project-level enablement and compatibility verification. UseAuth would provide sign-in/consent UX and policy checks; it would not mint authorization codes or refresh tokens. [Supabase OAuth Server](https://supabase.com/docs/guides/auth/oauth-server), [getting started](https://supabase.com/docs/guides/auth/oauth-server/getting-started).

## Ordered phases and dependencies

| Phase                          | Work                                                                                                                                                                                                                                                                                                              | Depends on                                                          | Acceptance gate                                                                                                                                                                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Baseline and evidence       | Complete repository audit, live Auth and relevant schema/RLS inventory, and configured-consumer discovery. Record the disposable-data decision.                                                                                                                                                                     | Read-only access to project metadata and owner scope decision.      | Relevant clients and shared `auth.users` dependencies are recorded; test-data reset boundary is explicit. **Complete for current test setup.**                                                                                     |
| 1. Existing flow stabilization | Patch dependency advisories; verify email templates/redirects/SMTP; fix reset sign-out failure behavior and hosted refresh coverage; add resend verification, abuse controls, security event format, and critical browser/provider tests. Retain API and UI contracts.                                            | Phase 0 metadata; test Supabase project and mailboxes.              | No known critical production dependency advisory; real sign-up → confirmation → login → account → change/reset → logout works; expired session tested; rate limit and CSRF negative tests pass.                                    |
| 2. Application access model    | Design and review registered-app mapping, active flag, redirect URI ownership, user-app memberships, admin roles, and policy decisions. Add narrowly scoped migrations only after preflight/backup/rollback review.                                                                                               | Phase 0 inventory; app owner/access policy decisions.               | An active registered app plus explicit membership is required; inactive/unknown app and nonmember are denied in tests; existing apps retain access during staged rollout.                                                          |
| 3. OAuth/OIDC pilot            | Verify Supabase OAuth Server is enabled/available in this project, signing key is asymmetric for OIDC, and installed SDK exposes consent methods. Register one dev client via Supabase's client registry, implement hosted authorization/consent UI with server-side membership check, code+PKCE client callback. | Phase 2 model; dev Supabase project and redirect registry.          | One Next.js app gets an ID token via code+PKCE, validates issuer/signature/audience/nonce/state, establishes its own session, and rejects wrong client, redirect, state, PKCE, inactive app, and nonmember. No custom auth server. |
| 4. Multi-app rollout           | Register clients per environment; exact HTTPS callbacks; enforce `client_id` and resource audience in consumers, RLS and backend APIs; migrate direct-password token consumers behind feature flags. Define local and global logout effects.                                                                      | Phase 3 pilot; each app's RLS/API inventory.                        | Same-domain and cross-domain browser tests pass. A token issued for app A cannot authorize app B. Legacy routes remain compatible until consumers are migrated and signed off.                                                     |
| 5. Reusable SDK                | Publish framework-independent OAuth client core and Next.js server adapter plus example app. Provide login redirect, callback validation, server session helpers, logout, typed errors and protected-route helper.                                                                                                | Stable Phase 3/4 protocol and session decisions.                    | Example integrates with only URL/client ID/callback and server secret where needed; no refresh token in browser localStorage or exposed server credential; SDK compatibility and contract tests pass.                              |
| 6. Security and operations     | Threat-model and test all requested bypass/replay/CSRF/redirect/RLS/PKCE cases; audit event pipeline, alerting, health and rollback runbooks; deployment docs.                                                                                                                                                    | Stable flows and operational owners.                                | Security test matrix and remaining-risk register approved; CI, staging smoke, production smoke and rollback drill documented.                                                                                                      |

## Implementation decisions to settle before Phase 2

1. **Application entitlement policy.** Who can create apps, approve users, invite users, and grant default access? The safe default is deny until an explicit membership/grant exists. A first-party app may later opt into self-service enrollment only with a reviewed policy.
2. **OAuth client type.** Prefer confidential clients and backend-for-frontend sessions for Next.js servers; public clients with PKCE for mobile/native or browser-only apps. Never ship a client secret to the browser.
3. **Existing consumer compatibility.** Time Logger and MyHabits now use UseAuth's token API for credential exchange; MyJournal/Stillroom remains another configured consumer. Reconcile every `/api/v1/auth` contract before changing the API; all apps are test-only, so migration may happen together after end-to-end tests. CORS origin is not proof of app identity.
4. **Token resource model.** Supabase OAuth access tokens use `aud: authenticated` by default and carry `client_id`; ID tokens have client audience. Define resource/API audience policy and a Custom Access Token Hook only if needed. Do not conflate OAuth scopes with app roles or RLS permissions. [Token security](https://supabase.com/docs/guides/auth/oauth-server/token-security).
5. **Logout expectations.** Separate UseAuth hosted logout, one app's local session logout, Supabase session revocation, and all-device logout. Access JWTs may remain valid until expiration; global instantaneous logout needs additional online checks for sensitive actions.

## Testing strategy

- Keep fast Vitest unit/contract tests for validation, error shaping, return URI rules, session cookie options, policy decisions, and consent state handling.
- Add integration tests against the current disposable Supabase project with test accounts and reviewed migrations. Exercise live OTP/email links, rotation, password update, expired JWT, refresh reuse, and RLS with identities and OAuth clients from two different apps. Use a separate production project before onboarding real users.
- Add browser tests for hosted UI and OAuth redirects on both same-parent-domain and unrelated-domain clients. Verify HttpOnly/Secure/SameSite cookies, CSRF state, PKCE, consent, and logout propagation.
- Add security negative tests: unsigned/wrong issuer or audience, expired/revoked token, cross-app `client_id`, inactive app, revoked membership, altered redirect, recovery replay, account enumeration, and rate-limit bypass.
- In CI, run lint, typecheck, tests, production build, dependency audit gate, and migration/static-policy checks. Keep live provider tests in an isolated staging pipeline with test credentials stored as CI secrets; redact tokens and email-link hashes from output.

## Database migration considerations

The Phase 0 read-only inventory found 47 public tables with cascading `auth.users` foreign keys and no `public.usernames` table or Supabase CLI migration-history table. The reviewed `public.usernames` migration was applied in Phase 1 after a duplicate preflight. Since all rows are test data, a clean reset may replace later backfills, but first specify the exact tables/users to remove and verify the effect on every test app. The proposed registry/membership/audit tables in [ARCHITECTURE.md](ARCHITECTURE.md) are **logical entities**, not approved DDL. Review retained table policies before issuing tokens to new OAuth clients, then test cross-app isolation with real client tokens.

## Deployment and rollback approach

Use the current project only for test users and disposable data. When the platform is ready for real users, create separate production and staging Supabase projects and OAuth clients, with exact per-environment redirect URIs and Vercel environment variables. In the current test setup, code can roll back through Vercel deployments, while OAuth client/configuration and secret changes need an explicit reversal plan; deleted test rows will not be restored. Before any future production release, add database backup/restore and staged rollout gates. Rolling back code does not automatically roll back schema or issued sessions.

## Phase-end report template

At each approved phase end, report completed tasks, modified files, database changes, checks run/results, security implications, remaining issues and the recommended next phase. Do not call a feature verified from mocks alone.
