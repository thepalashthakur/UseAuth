# Phase 3 app return rollout

**Status:** implementation prepared on isolated SSO branches; live provider configuration and email tests pending.

## Contract

Time Logger and MyHabits send an optional `app_id` on sign-up, confirmation resend, and forgot-password. UseAuth resolves only an active app's exact HTTPS origin from `auth_platform.applications`, signs the app ID, origin, email hash, purpose, and expiry with the existing server-only recovery secret, and asks Supabase to include that context in the hosted redirect. Confirmation contexts live 24 hours; recovery contexts live one hour. On callback, UseAuth verifies the OTP first, checks the context against the verified email and active registry again, then returns the browser to the app origin. The app establishes its own session through its existing SSO or credential flow; no Supabase access or refresh token goes into the return URL.

The existing v1 fields remain optional for older consumers. A caller cannot combine `app_id` with legacy `return_to`. Unknown or inactive app IDs fail before an email is requested. The preview branch uses `timelogger_sso_preview` or `myhabits_sso_preview`; main uses `timelogger` or `myhabits`.

## Coordinated test-project changes

1. Apply `supabase/migrations/20261031000000_auth_app_return_origin.sql`. It publishes only an active app's origin through `public.auth_app_return_origin` and registers the two exact pilot preview origins. The registry tables stay private. Review the two active preview entries before application because the existing auto-enrollment trigger grants users access to active apps.
2. In Supabase Auth URL Configuration, retain existing URLs and add `https://use-auth-rosy.vercel.app/auth/confirm\?context=*.*` and `https://use-auth-rosy.vercel.app/auth/recovery\?context=*.*`. The backslash makes `?` literal in Supabase's glob syntax; the two `*` segments match the signed payload and signature. Verify the dashboard accepts a test context URL before sending mail. Do not add a host-wide wildcard.
3. Change **Confirm signup** email link to `<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&redirect_to={{ .RedirectTo }}">Confirm email address</a>`. Change **Reset password** link to `<a href="{{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&type=recovery&redirect_to={{ .RedirectTo }}">Reset your password</a>`. The hosted callbacks also accept the prior direct confirmation link and prior recovery `return_to` link for already-sent emails. The confirmation callback forwards configured iOS/Android links to their existing mobile verifier.
4. Deploy UseAuth first, then the Time Logger and MyHabits SSO preview branches. Do not promote consumer code before the migration and template check: app-specific requests would otherwise fail closed.
5. With disposable accounts, send sign-up from each preview, open each confirmation email, and verify return to the exact initiating preview origin. Repeat recovery from each app, complete the password form, and verify return to the exact app origin. Test an old direct link, an altered context, an expired context, and an inactive registry app. Record deployment IDs and outcomes in `IMPLEMENTATION_PLAN.md` before checking off this item.

## Rollback

Revert consumer preview deployments first. Existing UseAuth endpoints still accept requests without `app_id`. Restore the previous email templates and redirect allowlist only after pending emails using the new format expire. The public origin resolver may remain because it exposes only an already-public active origin; preview entries can be deactivated if needed.
