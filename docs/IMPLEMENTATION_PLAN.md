# UseAuth implementation plan

> **SSO pilot update (2026-10-30):** The owner selected Supabase as the only identity provider. The isolated `feat/sso-pilot` work is tracked in [SSO_PILOT.md](SSO_PILOT.md). [PHASE3_RELIABLE_AUTH_PLAN.md](PHASE3_RELIABLE_AUTH_PLAN.md) preserves the earlier reliability-first decision; this tracker reflects the active preview pilot and keeps production promotion open.

**Status:** Phases 3–5 in progress, updated 2026-10-30. **Phase 0 and Phase 2 are complete for the current test-only setup.** The owner confirmed all current apps and data are for testing and the data may be deleted. The active Supabase SSO preview work and its remaining release gate are in [SSO_PILOT.md](SSO_PILOT.md). Findings and the reset boundary are in [PHASE0_INVENTORY.md](PHASE0_INVENTORY.md); the earlier [repository audit](AUDIT_REPORT.md) and [architecture proposal](ARCHITECTURE.md) provide more detail.

## Progress tracker

Check an item only after its acceptance check has passed, and add the date plus evidence in the change log below. A passing mocked test alone does not verify a live authentication flow.

### Phase 0 — Baseline and evidence

- [x] Audit the repository, current auth flows, dependencies, and known verification gaps. See [AUDIT_REPORT.md](AUDIT_REPORT.md).
- [x] Trace Time Logger through its source, Vercel project metadata, and live Supabase API surface; identify MyJournal/Stillroom as another configured UseAuth client. See [PHASE0_INVENTORY.md](PHASE0_INVENTORY.md).
- [x] Inventory live Supabase Auth settings: OAuth Server availability, signing algorithm, email templates, SMTP, redirect URLs, rate limits, and session policy. See [PHASE0_INVENTORY.md](PHASE0_INVENTORY.md).
- [x] Verify live Time Logger table presence, RLS flags/policies/grants, and `auth.users` trigger/foreign-key counts.
- [x] Identify the relevant shared-database dependencies: 47 public tables reference `auth.users`; all have RLS enabled, including the 13 Time Logger tables. See [PHASE0_INVENTORY.md](PHASE0_INVENTORY.md).
- [x] Identify configured UseAuth consumers, their domains, token storage, and API access paths: Time Logger and MyJournal/Stillroom.
- [x] Record the test-only, disposable-data decision and the reset boundary. Full policy review of retained non-Time-Logger tables moves to Phase 4 before adding another app or identity provider.

### Phase 1 — Existing flow stabilization

- [x] Update affected dependencies and run lint, typecheck, tests, build, and dependency audit.
- [x] Verify real sign-up, email confirmation, sign-in, account access, password change, forgot/reset password, refresh, and logout in the current disposable test project.
- [x] Add resend verification and repair any failures found in recovery sign-out or hosted session refresh.
- [x] Add abuse controls and redacted security event logging for public auth routes.
- [x] Test expired sessions, CSRF/origin rejection, rate limits, invalid links, and recovery replay.

**Open Phase 1 check:** Verify successful resend delivery after Supabase's email throttle cools down. The live resend request returned provider HTTP 429 and UseAuth preserved that response. Request-ID logs redact credentials; live origin, invalid-token, rate-limit, and recovery-replay checks passed. The SMTP display name still says “MyJournal” and should be made neutral before onboarding another app. Revisit the 100/min/IP WAF threshold before real traffic: server-side consumers may share an egress IP.

### Phase 2 — Application access model

- [x] Decide who registers apps and grants/revokes user membership; registered active apps use automatic grants in the current test setup.
- [x] Define app/client mapping, per-environment callback ownership, active status, membership, and admin permissions. OAuth client IDs are populated in Phase 3.
- [x] Review the narrow registry/membership migration and its RLS against the live schema. It backfills existing users without deleting test data.
- [x] Prove unknown/inactive apps and users without membership are denied without breaking existing consumers. Inactive and future-app cases passed in isolated PostgreSQL; live unknown and revoked cases passed.

### Phase 3 — Reliable shared authentication

- [x] Compare the beta OAuth path with stable alternatives and record the current decision. See [PHASE3_RELIABLE_AUTH_PLAN.md](PHASE3_RELIABLE_AUTH_PLAN.md).
- [ ] Freeze the existing UseAuth and consumer auth/session contracts and inventory legacy token paths.
- [ ] Add verified, app-aware return after confirmation and password recovery.
- [ ] Harden app session refresh, denial cleanup, cookies, CSRF, and logout behavior.
- [ ] Verify signup, login, confirmation, reset, password change, refresh, and logout from both apps with disposable accounts.

### Phase 4 — Shared-data isolation and app rollout

- [ ] Inventory every direct Data API, RPC, Realtime, service-role, and personal-token path.
- [ ] Enforce current app membership and row ownership in relevant RLS and server APIs; prove revocation blocks an already-issued token.
- [ ] Add a third test app using the documented registry and auth contract, then test app-specific origin/return and data isolation.

### Phase 5 — Supabase SSO pilot and rollout

- [x] Select the existing Supabase project as the sole identity provider for an isolated OAuth/OIDC preview pilot; retain the deployed credential path while the OAuth Server remains beta. See [SSO_PILOT.md](SSO_PILOT.md).
- [x] Prove Supabase OAuth tokens preserve the existing user UUID and use an app-specific `client_id`; apply client-bound RLS and RPC guards for the two pilot apps. Direct bearer-token checks show each preview client can read its own test row and cannot read the other app's independent rows.
- [ ] Complete the remaining preview acceptance and release decision: negative code/nonce and expired-session cases, SSO-only profile editing, and an explicit decision on beta-provider risk. Live revoked-membership denial passed for an already-issued Time Logger OAuth session. Keep production OAuth clients separate from preview clients if promotion is approved.
- [ ] Publish a reusable adapter only after the protocol and session contract are stable.

### Phase 6 — Security and operations

- [ ] Run the negative security test matrix and document remaining risks.
- [ ] Configure alerting, redacted audit events, health checks, and operational ownership.
- [ ] Document staging/production setup, key rotation, backup, rollback, and incident response.
- [ ] Complete staging and production smoke tests and a rollback drill.

## Change log

| Date | Phase/item | Change and verification evidence |
| --- | --- | --- |
| 2026-10-30 | Phase 4/5: issued-token revocation | In the test project, the disposable user's exact Time Logger membership changed from active to revoked after SSO sign-in. The existing preview session then showed sign-in and `/api/entries` returned Unauthorized. Restoring only that membership made the same session's API request return its saved entry. SQL `RETURNING` confirmed a single row changed each way and ended active. This validates the Time Logger path; other shared-data paths still need the Phase 4 inventory. See [SSO_PILOT.md](SSO_PILOT.md). |
| 2026-10-30 | Phase 5: Time Logger preview gate | The preview session renewed after a day and read its saved entry. A temporary read-only route checked the real OAuth token against both apps: own entry visible, MyHabits habit hidden, cross-app helper false, and MyHabits RPC guard HTTP 403 / `42501`. The route was removed. A live sign-out test found that generic deletion did not clear the `__Host-` cookie; Time Logger `ef57f8b` expires it with secure host-only options. Ready preview `dpl_AvSM2hdFaSGz7DGeZgwjhwESQxNV` stayed signed out after reload and rejected an unsolicited callback. Supabase documentation still labels OAuth Server beta; production promotion remains open. See [SSO_PILOT.md](SSO_PILOT.md). |
| 2026-10-26 | Phase 3: reliability decision | Deferred Supabase OAuth Server beta and kept Supabase Auth as the current password/session authority. Compared stable third-party OIDC routes and recorded the UUID foreign-key/RLS migration required before changing identity providers. No live settings, schema, or application code changed. See [PHASE3_RELIABLE_AUTH_PLAN.md](PHASE3_RELIABLE_AUTH_PLAN.md). |
| 2026-10-26 | Phase 2: app access model | Applied `20261026000000_application_access.sql` to test project `mxooeohiyoyguugkutzi`: private registry/membership tables, RLS, scoped boolean RPCs, automatic user and future-app grants, and active Time Logger/MyHabits records. Verified both table RLS flags, RPC grants, and ordinary-user denial of the service-role RPC. Isolated PostgreSQL checks passed for automatic grants, future app activation, inactive/unknown apps, and revoked memberships. A disposable live user received both grants and could sign in to both staged and public consumer deployments; an unknown app returned false, and revoking memberships made both staged sign-ins return HTTP 403. Restored memberships, explicitly mapped Time Logger public/team aliases to its tested deployment, verified a second disposable user could sign in on both public domains (HTTP 200), then deleted the disposable users. Time Logger tests/typecheck/build, MyHabits tests/lint/typecheck/build, and UseAuth lint/build passed. Consumer deployments: Time Logger `dpl_EeaZbaQqQdMtP7qRCTZEwFB9PFYU`, MyHabits `dpl_55txZRFrj5t7ZzeVWpuAKa1Ly9JV`. Direct shared-database RLS/client isolation remains Phase 4. |
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
| 2026-10-26 | Shared test-data reset | The owner chose to keep schema and delete test accounts/app data in Supabase project `mxooeohiyoyguugkutzi`. Preflight found 8 Auth users, 53 application tables in `public`, 0 Storage objects, and 32 seeded `journal_emotion_catalog` rows. The four routine child tables without a direct `auth.users` foreign key were confirmed to cascade through user-owned routines. Deleted all 8 Auth users through Supabase Admin `deleteUser` (hard delete). Postflight found 0 Auth users, 0 Storage objects, and an exact row count across all 53 public tables showed only the 32 required emotion-catalog seed rows. Schema, RLS, functions, Auth settings, and empty Storage buckets were retained. Previously issued access JWTs may remain valid until expiry; refresh sessions were removed with users. |

## Design constraints and preserved behavior

Keep Supabase Auth as the password, OTP, session, refresh, and token issuer. Retain the hosted account/registration/recovery UI, `/api/v1/auth` contract while consumers migrate, and the current mobile confirmation callbacks. Existing test identities and rows may be reset; `public.usernames` was added in Phase 1. Verify exact deletion scope before resetting anything, and review retained RLS policies before exposing new OAuth clients. Do not publish a reusable SSO adapter until its protocol and session contract are stable.

The current target is a reliable shared Supabase Auth identity with registered apps, app-owned sessions, and enforceable memberships. The owner subsequently authorized a Supabase OAuth/OIDC pilot on isolated preview branches despite its beta status; the credential path remains available. Phase 3 strengthens the working flow, and [SSO_PILOT.md](SSO_PILOT.md) records the active release gate. [PHASE3_RELIABLE_AUTH_PLAN.md](PHASE3_RELIABLE_AUTH_PLAN.md) records the earlier decision and alternatives.

## Ordered phases and dependencies

| Phase | Work | Acceptance gate |
| --- | --- | --- |
| 0. Baseline | Repository, Auth, schema, RLS, and consumer inventory. | Complete for current test setup. |
| 1. Existing flow | Hosted registration, password lifecycle, consumer compatibility, abuse controls. | Completed live flow; resend-delivery check remains open. |
| 2. App access | Private app registry, automatic grants, membership checks in consumers. | Complete for current test setup; direct shared-data isolation remains Phase 4. |
| 3. Reliable shared auth | App-aware returns, consumer session hardening, live flow and denial checks. | One password works in both apps and all protected flows/returns pass without tokens in URLs. |
| 4. Data isolation | Audit and enforce membership/ownership across RLS, RPCs, server and personal-token paths; onboard a third test app. | Revoked and cross-app access fails even with a previously issued token. |
| 5. SSO pilot | Use Supabase OAuth/OIDC with exact clients and app-owned sessions on isolated previews; retain the credential fallback. | Both preview apps pass browser, token, and data isolation checks; beta-provider risk is accepted before any production cutover. |
| 6. Operations | Alerts, redacted events, staging/production separation, rotation, rollback. | Operational checks and rollback drill pass before real users. |

## Implementation decisions

1. **Application entitlement policy.** For the current test setup, the project owner registers apps and manages revocations through SQL. Every active registered app defaults to automatic enrollment for existing and new users. Unknown and inactive apps, plus revoked or missing memberships, are denied. Review this policy before onboarding real users or third-party apps. See [PHASE2_ACCESS.md](PHASE2_ACCESS.md).
2. **SSO provider.** Keep Supabase Auth as the sole identity authority. The owner selected its OAuth Server for an isolated two-app preview pilot; its beta status remains a release decision. Never ship a client secret to the browser.
3. **Existing consumer compatibility.** Time Logger and MyHabits now use UseAuth's token API for credential exchange; MyJournal/Stillroom remains another configured consumer. Reconcile every `/api/v1/auth` contract before changing the API; all apps are test-only, so migration may happen together after end-to-end tests. CORS origin is not proof of app identity.
4. **Token resource model.** Legacy Supabase JWTs have no OAuth `client_id`, so they are not proof of which app initiated login. Each app checks current membership. OAuth tokens include a client ID; the pilot applies client-bound RLS and RPC guards for Time Logger and MyHabits. Phase 4 must inventory and close remaining direct-data paths across the shared database.
5. **Logout expectations.** Separate UseAuth hosted logout, one app's local session logout, Supabase session revocation, and all-device logout. Access JWTs may remain valid until expiration; global instantaneous logout needs additional online checks for sensitive actions.

## Testing strategy

- Keep fast Vitest unit/contract tests for validation, error shaping, return URI rules, session cookie options, policy decisions, and Phase 2 access decisions.
- Add integration tests against the current disposable Supabase project with test accounts and reviewed migrations. Exercise live OTP/email links, password update, expired JWT, refresh reuse, app-aware returns, revocation, and RLS through both existing apps. Use a separate production project before onboarding real users.
- Add browser tests for hosted registration and recovery returns from both same-parent-domain and unrelated-domain apps. Verify HttpOnly/Secure/SameSite cookies, CSRF checks, and local/global logout behavior. The active SSO preview also needs PKCE, consent, and OIDC checks.
- Add security negative tests for expired/revoked tokens, inactive apps, revoked membership, altered return URLs, recovery replay, account enumeration, and rate-limit bypass. Include issuer, audience, PKCE, and cross-client checks in the SSO pilot.
- In CI, run lint, typecheck, tests, production build, dependency audit gate, and migration/static-policy checks. Keep live provider tests in an isolated staging pipeline with test credentials stored as CI secrets; redact tokens and email-link hashes from output.

## Database migration considerations

The Phase 0 read-only inventory found 47 public tables with cascading `auth.users` foreign keys and no `public.usernames` table or Supabase CLI migration-history table. The reviewed `public.usernames` migration was applied in Phase 1 after a duplicate preflight. Since all rows are test data, a clean reset may replace later backfills, but first specify the exact tables/users to remove and verify the effect on every test app. The registry and membership tables were implemented in Phase 2; the security-events table in [ARCHITECTURE.md](ARCHITECTURE.md) remains a proposal. Review retained table policies before adding another app. A third-party identity provider requires a separate migration of the UUID user keys, foreign keys, and RLS assumptions; see [PHASE3_RELIABLE_AUTH_PLAN.md](PHASE3_RELIABLE_AUTH_PLAN.md).

## Deployment and rollback approach

Use the current project only for test users and disposable data. When the platform is ready for real users, create separate production and staging Supabase projects, with exact per-environment app origins and Vercel environment variables. Use separate OAuth clients and callbacks for each app and environment if SSO is promoted. In the current test setup, code can roll back through Vercel deployments, while provider/configuration and secret changes need an explicit reversal plan; deleted test rows will not be restored. Before any future production release, add database backup/restore and staged rollout gates. Rolling back code does not automatically roll back schema or issued sessions.

## Phase-end report template

At each approved phase end, report completed tasks, modified files, database changes, checks run/results, security implications, remaining issues and the recommended next phase. Do not call a feature verified from mocks alone.
