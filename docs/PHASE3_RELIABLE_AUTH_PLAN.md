# Phase 3: reliable shared authentication plan

**Decision date:** 2026-10-26. **Scope of this update:** planning only; no provider, database, or deployment setting changes.

## Decision

Keep **Supabase Auth as the identity and password authority** for Time Logger,
MyHabits, and the next test apps. Continue using UseAuth for hosted registration,
confirmation, password recovery, password change, and the existing credential
bridge. Keep the Phase 2 app registry and automatic access policy. Each app
checks its own membership on protected requests.

This gives one account and one password across apps today. It does **not** give
seamless browser SSO: visiting another app may require entering that password
again. Do not describe the current credential bridge as OAuth or SSO.

Do not enable Supabase's OAuth Server beta for these apps yet. Do not create a
custom authorization-code, one-time-ticket, JWT issuer, or cross-domain cookie
protocol to fill that gap. Revisit standards-based SSO when its provider and
database migration have passed a separate pilot.

## Why this is the low-change path

- The current apps already use one Supabase project and the Phase 2 membership
  check. Live tests proved the same test account could sign in to both apps and
  that revocation denied both.
- The shared schema has 47 public-table foreign keys to `auth.users`, and its
  ownership/RLS logic uses UUID user IDs. A third-party provider's subject is a
  separate identity. Supabase can trust third-party JWTs, but that does not
  automatically create matching `auth.users` rows or preserve these existing
  foreign-key relationships. A provider switch therefore needs a user-ID and
  RLS migration, even while the same Postgres project is retained.
- Supabase labels its OAuth 2.1/OIDC Server **beta**. Its third-party JWT
  authentication feature is listed as generally available, so a mature external
  provider remains a viable future SSO path after schema work.

## Phase 3 implementation plan

1. **Freeze the current contract.** Document the UseAuth credential endpoint,
   app session cookie behavior, refresh, logout, confirmation, recovery, and
   failure responses. Keep passwords and refresh tokens out of browser storage,
   URLs, logs, and analytics. Inventory every route that still accepts a legacy
   Supabase JWT or a Time Logger personal API token.
2. **Make account flows app-aware.** Use the registered app's exact HTTPS origin
   for a verified return after email confirmation and password recovery. Bind
   app context to a short-lived integrity-protected value; reject unknown,
   inactive, mismatched, or arbitrary redirect URLs. Continue to send email
   links through UseAuth, then return the browser to the initiating app without
   putting access or refresh tokens in the URL.
3. **Harden consumer sessions.** Verify the local user and Phase 2 membership
   after sign-in and refresh; clear a denied or mismatched session. Apply secure,
   HttpOnly, host-only, SameSite cookies and CSRF checks to app mutations. Define
   local app logout separately from a global Supabase logout. Keep the current
   password exchange server-to-server over HTTPS until a standards-based SSO
   provider replaces it.
4. **Close direct-data bypasses.** Inventory all Data API, RPC, service-role,
   Realtime, and personal-token paths in Time Logger and MyHabits. Add app-aware
   authorization to server APIs and the relevant shared-database RLS policies.
   Test that revoking membership blocks data access with an already-issued token.
   This is the critical security work before adding another app.
5. **Run live acceptance tests.** With disposable accounts, cover sign-up from
   each app, email confirmation and return, sign-in, refresh, forgot/reset and
   return, password change, logout, expired sessions, disabled app, revoked
   membership, wrong project/user, and direct API/RPC access. Confirm the same
   new password works in both apps. Stage and test each deployment before
   assigning its public domain.
6. **Prepare operations.** Add redacted auth and access-denial events, alerts,
   key rotation steps, a deployment rollback checklist, and separate staging
   and production Supabase projects before any real users are onboarded.

**Acceptance:** Both apps complete the listed live flows, all protected data
paths deny revoked users, and no app needs to read another app's cookies or
store a password after the sign-in request. Record remaining legacy-token
exposure explicitly.

## Later SSO decision gate

If seamless sign-in between domains becomes a requirement, evaluate an
established OIDC provider in an isolated test environment. **WorkOS AuthKit**
is the leading candidate to investigate: it documents multiple applications
with separate client IDs and redirect settings sharing one user base, and
Supabase documents direct WorkOS JWT integration. Auth0 is another mature
candidate; verify cross-app SSO licensing before choosing it. Clerk's satellite
domain feature needs a paid production plan and is documented as an advanced
workflow. These are candidates, not a selected migration.

Before selecting any provider, prove all of the following with a disposable
copy of the schema and two apps:

1. One hosted account supports registration, verification, password reset,
   password change, and a second app sign-in without another password prompt.
2. Each app has an exact callback, its own client/session, and checked state,
   nonce, issuer, audience, signature, expiry, and PKCE where applicable.
3. An external subject maps to the database's UUID app user safely; every
   existing `auth.users` foreign key, `auth.uid()` assumption, RLS policy, and
   Phase 2 membership check is either migrated or replaced. A token for App A
   cannot access App B's data.
4. There is a documented account migration or fresh-start procedure, cost and
   support review, rollback plan, and no production cutover until the old and
   new paths have been compared with real browser flows.

The test-only project currently has disposable data, so a fresh-start
migration is possible, but a provider switch would still require the schema
and code work above. Until that gate passes, the current Supabase Auth path is
the supported path.

## Source notes

- [Supabase OAuth Server is beta](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [Supabase third-party auth overview and limits](https://supabase.com/docs/guides/auth/third-party/overview)
- [Supabase third-party auth feature status](https://supabase.com/features/third-party-authentication)
- [Supabase WorkOS integration](https://supabase.com/docs/guides/auth/third-party/workos)
- [WorkOS multiple applications](https://workos.com/docs/authkit/applications)
- [Auth0 pricing and cross-app SSO plan comparison](https://auth0.com/pricing)
- [Clerk satellite domain requirements](https://clerk.com/docs/guides/dashboard/dns-domains/satellite-domains)

The user-ID/RLS migration conclusion is an inference from the current database
inventory and the providers' separate JWT subjects, not a promise from a
vendor that the migration is automatic.
