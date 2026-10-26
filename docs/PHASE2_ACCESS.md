# Phase 2 application access

The shared Supabase project remains the identity provider. The `auth_platform`
schema records registered apps and user memberships. Its tables are not exposed
through the Data API. The only public-schema functions are boolean access checks:
`has_app_access(app_key)` checks the caller's JWT identity, while
`has_app_access_for_user(app_key, subject_user_id)` is executable only by the
server-side `service_role` for Time Logger personal API tokens.

## Current policy

- The project owner registers, disables, or removes apps in the Supabase SQL
  Editor. There is no public app-registration or membership-management API.
- Registered apps default to automatic enrollment. Activating one grants all
  existing users access; new users are enrolled in all active automatic apps.
  The initial records are `timelogger` and `myhabits` in the shared test project.
- An explicit revoked membership stays revoked when an app is reactivated.
  Unknown apps, inactive apps, and users without an active membership are denied.
- This is an app-entry policy for the existing credential bridge. OAuth client
  IDs are not registered yet, and existing Supabase JWTs are not bound to an
  app. Direct shared-database RLS/client isolation remains Phase 4 work.

## Migration and preflight

Apply `supabase/migrations/20261026000000_application_access.sql` to project
`mxooeohiyoyguugkutzi` before deploying the consumer code. Verify the project
reference in the dashboard and run this read-only preflight:

```sql
select
  to_regnamespace('auth_platform') as existing_schema,
  to_regprocedure('public.has_app_access(text)') as existing_check,
  (select count(*) from auth.users) as existing_users;
```

The migration creates tables, RLS, grants, functions, triggers, and two initial
app records in one transaction. It backfills automatic memberships for any
existing users. It does not alter the existing application tables or OAuth
configuration. Check the installed records:

```sql
select app_id, app_origin, active, enrollment
from auth_platform.applications order by app_id;

select app_id, status, count(*)
from auth_platform.app_memberships group by app_id, status order by app_id, status;
```

## Register and manage apps

Register a new app with a unique key and its exact HTTPS origin. The default is
inactive; review the origin, then activate it. Activation auto-grants existing
users. Do this only in the owner's SQL Editor session, not through a browser
client or service-role key embedded in an app.

```sql
insert into auth_platform.applications
  (app_id, display_name, environment, app_origin)
values ('example', 'Example', 'test', 'https://example.vercel.app');

update auth_platform.applications set active = true where app_id = 'example';
```

Disable access immediately at the policy layer with
`update auth_platform.applications set active = false where app_id = 'example';`.
For a user-specific revocation, update that user's `app_memberships.status` to
`revoked`; do not delete the row, since auto-grant intentionally leaves revoked
rows untouched. App routes check access again on each request. Existing access
JWTs remain cryptographically valid until expiry, so apps must enforce current
membership rather than relying only on JWT validity.

## Rollback

Roll back the consumer deployments first, then remove the Phase 2 database
objects in the test project. This deletes the app registry and memberships but
does not touch Supabase Auth users or existing app data:

```sql
begin;
drop trigger if exists auto_grant_active_apps on auth.users;
drop function if exists public.has_app_access(text);
drop function if exists public.has_app_access_for_user(text, uuid);
drop schema if exists auth_platform cascade;
commit;
```
