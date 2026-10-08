# UseAuth

A plug-and-play email/password authentication microservice built with Next.js App Router, TypeScript, and Supabase Auth. Deploy the frontend and API together on Vercel.

## Included

- Hosted sign-up, sign-in, confirmation, and protected account pages.
- HttpOnly, SameSite=Lax cookies for the hosted UI, server-verified identity, and automatic session refresh.
- Versioned JSON token API for consuming applications, refresh-token rotation, and session sign-out.
- Exact-origin CORS allowlist, same-origin checks for cookie mutations, bounded JSON bodies, validated input, and non-cacheable auth responses.
- Responsive overview and integration guide at `/docs`.
- Supabase PostgreSQL's managed `auth.users` is the account database; passwords stay with Supabase. A small `public.usernames` table reserves optional usernames; no service-role credential is needed by the app.

## Local setup

Node.js 20.9+ (Node 24 recommended).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set these variables in `.env.local`:

| Variable                   | Purpose                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `SUPABASE_URL`             | Project URL from Supabase's Connect dialog                                                |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key; never use a secret or service-role key                                   |
| `APP_URL`                  | Canonical service origin, e.g. `http://localhost:3000`                                    |
| `AUTH_ALLOWED_ORIGINS`     | Comma-separated browser app origins, e.g. `http://localhost:3001,https://app.example.com` |
| `IOS_APP_REDIRECT_URL`     | Fixed iOS return link after email confirmation                                            |
| `ANDROID_APP_REDIRECT_URL` | Fixed Android return link after email confirmation                                        |

Open http://localhost:3000. Without credentials, the app renders setup instructions and auth endpoints return 503. No fake user accounts or demo sessions are created.

### Supabase configuration

1. Create a Supabase project. Under Authentication → Providers, enable Email and password authentication and Confirm email. Set the minimum password length to at least 8.
2. Under Authentication → URL Configuration, set Site URL to the auth service's origin. Add `http://localhost:3000/auth/confirm` and the deployed equivalent to Redirect URLs.
3. Under Authentication → Email Templates → Confirm signup, use:

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email"
  >Confirm your email</a
>
```

The callback verifies the hash, creates the hosted UI session, and redirects to `/account`. Consuming applications sign in through the API after confirmation. The callback never redirects to a caller-supplied URL.

4. Apply `supabase/migrations/20261006000000_unique_usernames.sql` to the project using `supabase db push` before deploying this version. The migration reserves usernames case-insensitively and adds an availability check for signup. It can fail if existing users already have duplicate username metadata; resolve those duplicates before retrying.

## Deploy on Vercel

1. Push this Git repository to your preferred Git host, then import it into Vercel.
2. Select the Next.js preset (automatically detected). No custom `vercel.json` is required.
3. Add the environment variables above. Set `APP_URL` to your stable production domain. Add exact consuming-app origins to `AUTH_ALLOWED_ORIGINS`; no wildcard or path prefixes.
4. Update Supabase's Site URL and confirmation Redirect URLs for that domain.
5. Deploy. Redeploy after changing variables. Configure separate preview environments if previews should authenticate; do not allow arbitrary preview domains in production.

## API

Base URL: `https://your-auth-service.vercel.app/api/v1/auth`.

| Method | Endpoint    | Input                                                                                                                         |
| ------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/sign-up`  | `{ "email": "you@example.com", "password": "your-password", "username": "optional_handle", "display_name": "Optional Name" }` |
| POST   | `/sign-in`  | Same credential shape                                                                                                         |
| GET    | `/me`       | `Authorization: Bearer <access_token>`                                                                                        |
| POST   | `/refresh`  | `{ "refresh_token": "..." }`                                                                                                  |
| POST   | `/sign-out` | `{ "access_token": "...", "refresh_token": "..." }`                                                                           |

POST bodies must be JSON and no larger than 16 KB. Sign-up passwords must be 8–128 characters; Supabase can enforce stricter rules. Sign-in accepts existing shorter passwords. Unknown fields are rejected.

`username` and `display_name` are optional at sign-up. Usernames are unique, normalized to lowercase, and may contain 3–30 letters, numbers, or underscores. Display names may contain up to 80 characters. Both are stored in Supabase user metadata and returned by `/me`, sign-in, and refresh as `username` and `display_name` (or `null` for older users). User metadata is editable by its owner, so consuming apps must not treat either field as an authorization claim. Apply the migration in `supabase/migrations` before deploying this version; it reserves usernames and keeps the reservation synchronized with metadata changes.

```js
const response = await fetch(`${AUTH_URL}/api/v1/auth/sign-in`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error.message);
const { user, session } = result;
```

Successful sign-in (200) and sign-up without email confirmation (201):

```json
{
  "user": {
    "id": "supabase-user-id",
    "email": "you@example.com",
    "email_verified": true,
    "created_at": "2026-01-01T00:00:00Z",
    "username": "optional_handle",
    "display_name": "Optional Name"
  },
  "session": {
    "access_token": "...",
    "refresh_token": "...",
    "expires_at": 1767229200,
    "expires_in": 3600,
    "token_type": "bearer"
  },
  "confirmation_required": false,
  "message": "You are signed in."
}
```

With confirmation enabled, sign-up returns `user: null`, `session: null`, `confirmation_required: true`, and a generic confirmation message. This deliberately avoids exposing whether an email is already registered. `/me` returns `{ "user": ... }`; refresh returns `{ "session": ..., "user": ... }`; sign-out returns a message.

Errors: `{ "error": { "code": "INVALID_CREDENTIALS", "message": "..." } }`. Statuses: 400 validation/JSON, 401 unauthorized, 403 disallowed origin, 404 unknown route, 405 method, 413 payload size, 415 content type, 429 rate limit, 502 sign-out provider failure, 503 missing configuration or service unavailable.

### Consuming applications

- Prefer your application's backend as a proxy, keeping tokens in secure HttpOnly cookies. Avoid storing refresh tokens in browser localStorage.
- Use `Authorization: Bearer <access_token>` for `/me`. Validate Supabase JWTs in every consuming backend through the project's JWKS or `supabase.auth.getUser(token)`; never trust decoded claims without verification.
- Refresh before expiry. Save the newly returned access **and** refresh tokens atomically; avoid concurrent refresh calls for the same session.
- Sign-out uses `scope: local`, revoking this session's refresh token. Already issued JWTs can remain valid until expiry. Clear local tokens/cookies immediately.
- The token API does not use cookies or credentialed CORS. CORS controls browser origins, not server-to-server access or authorization.
- The hosted pages use cookies on the auth service's domain. They do not establish a session on a different app domain. Cross-domain SSO/redirect handoff is not implemented in v1.
- Add RLS policies to any future application tables; authenticating a user does not grant blanket database access.

### iOS and Android email confirmation

Mobile apps use the same token API. To sign up, include `"platform": "ios"` or `"platform": "android"` in the `/sign-up` JSON body. Configure `IOS_APP_REDIRECT_URL` and/or `ANDROID_APP_REDIRECT_URL` as fixed app links (or app URL schemes). Add the corresponding auth-service callback URL, `/auth/mobile/confirm/ios` or `/auth/mobile/confirm/android`, to Supabase Authentication → URL Configuration → Redirect URLs. Keep the confirmation email template above using `{{ .RedirectTo }}`.

The email opens the auth-service callback. It verifies the token hash and redirects to the configured app link with `confirmation=success` or `confirmation=error`. Configure the link in iOS Universal Links or Android App Links (or register its custom URL scheme) so the app can receive it. No access or refresh token is placed in the link. After success, the app signs in with the user's email and password through `/api/v1/auth/sign-in`, then securely stores the returned session. The existing `/auth/confirm` browser callback continues to create a hosted cookie session.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Tests cover API validation, origin checks, missing and invalid credentials, session response isolation, email confirmation responses, token refresh, sign-out, payload limits, and provider failures using mocked Supabase calls. They do not replace live provider verification.

After configuring a project, test with a fresh email: sign up → open confirmation email → account page → sign out → sign in. Then exercise token sign-in → `/me` → refresh → sign-out from a consuming app. `GET /api/health` reports whether Supabase variables are present; it is not a provider connectivity probe.

## Production setup

Configure custom SMTP and review Supabase's [rate limits](https://supabase.com/docs/guides/auth/rate-limits). The app maps credential provider rate limits to 429; it does not implement its own distributed IP throttle. Since Supabase is behind this server, consider an edge IP rate limit (Vercel Firewall) for public auth routes. To add CAPTCHA, extend the credentials schema and forward a verified `captchaToken` to Supabase after enabling its [bot protection](https://supabase.com/docs/guides/auth/auth-captcha).

OAuth, password recovery, MFA, tenant management, admin APIs, and SSO handoff are future extensions.

Implementation follows Supabase's [server-side session guide](https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs) and [email template guide](https://supabase.com/docs/guides/auth/auth-email-templates).
