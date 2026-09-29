import Link from "next/link";
import { ArrowUpRight, BookOpen } from "lucide-react";
import { Shell } from "@/components/shell";
import { CopyButton } from "@/components/copy-button";
export const metadata = { title: "Integration guide" };
const login = `const res = await fetch(AUTH_URL + '/api/v1/auth/sign-in', {\n  method: 'POST',\n  headers: { 'Content-Type': 'application/json' },\n  body: JSON.stringify({ email, password })\n});\nconst result = await res.json();\nif (!res.ok) throw new Error(result.error.message);\n// Store tokens securely on your application server.\nconst { session, user } = result;`;
const endpoints = [
  ["POST", "sign-up", "Create an account; send a confirmation email."],
  ["POST", "sign-in", "Exchange email and password for a session."],
  ["GET", "me", "Return the user for a Bearer access token."],
  ["POST", "refresh", "Rotate the session using a refresh token."],
  ["POST", "sign-out", "Revoke this session’s refresh token."],
];
export default function Docs() {
  return (
    <Shell active="docs">
      <div className="page-heading">
        <div>
          <div className="eyebrow">A SMALL API. A QUICK INTEGRATION.</div>
          <h1>
            Make yourself at home<span className="heading-dot">.</span>
          </h1>
          <p>Connect once. Use authentication across your applications.</p>
        </div>
        <span className="feature-icon lavender">
          <BookOpen size={23} />
        </span>
      </div>
      <div className="docs-layout">
        <article className="docs-content">
          <section className="panel docs-section" id="setup">
            <span className="small-label">01 / SETUP</span>
            <h2>Connect & deploy</h2>
            <ol>
              <li>
                <strong>Create a Supabase project.</strong>
                <p>
                  Email/password is the initial provider. Enable email
                  confirmations and set a minimum password length of 8 or
                  greater.
                </p>
              </li>
              <li>
                <strong>Configure the environment.</strong>
                <p>
                  Copy <code>.env.example</code> to <code>.env.local</code> and
                  fill in <code>SUPABASE_URL</code>,{" "}
                  <code>SUPABASE_PUBLISHABLE_KEY</code>, and{" "}
                  <code>APP_URL</code>. Use the publishable key from your
                  project’s Connect dialog.
                </p>
              </li>
              <li>
                <strong>Set the confirmation template.</strong>
                <p>
                  In Supabase → Authentication → Email Templates → Confirm
                  signup, use this link:
                </p>
                <pre>
                  <code>
                    {
                      '<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>'
                    }
                  </code>
                </pre>
                <p>
                  Set the Site URL to your service’s origin and allow{" "}
                  <code>https://your-service.vercel.app/auth/confirm</code> in
                  Redirect URLs. Add the localhost equivalent for development.
                </p>
              </li>
              <li>
                <strong>Deploy to Vercel.</strong>
                <p>
                  Import the Git repository as a Next.js project. Add the same
                  variables, set <code>APP_URL</code> to your production origin,
                  and set <code>AUTH_ALLOWED_ORIGINS</code> to your apps’ exact
                  origins. Redeploy after environment changes.
                </p>
              </li>
            </ol>
            <div className="docs-callout">
              Supabase Auth owns the users table and password storage. This
              version needs no custom database migration or service-role key.
            </div>
          </section>
          <section id="endpoints" className="panel docs-section">
            <span className="small-label">02 / API REFERENCE</span>
            <h2>Five endpoints. One identity.</h2>
            <p>
              Base path: <code>/api/v1/auth</code>. POST requests accept JSON.
              All session responses use{" "}
              <code>Cache-Control: private, no-store</code>.
            </p>
            <div className="endpoint-table">
              {endpoints.map(([method, path, description]) => (
                <div key={path} className="endpoint-row">
                  <span className={`method ${method.toLowerCase()}`}>
                    {method}
                  </span>
                  <code>/{path}</code>
                  <p>{description}</p>
                </div>
              ))}
            </div>
            <h3>Request bodies</h3>
            <ul>
              <li>
                <code>sign-up</code> and <code>sign-in</code>:{" "}
                <code>
                  {
                    '{ "email": "you@example.com", "password": "your-password" }'
                  }
                </code>
              </li>
              <li>
                <code>me</code>:{" "}
                <code>Authorization: Bearer &lt;access_token&gt;</code>
              </li>
              <li>
                <code>refresh</code>:{" "}
                <code>{'{ "refresh_token": "..." }'}</code>
              </li>
              <li>
                <code>sign-out</code>:{" "}
                <code>
                  {'{ "access_token": "...", "refresh_token": "..." }'}
                </code>
              </li>
            </ul>
            <p>
              A successful sign-in returns <code>user</code>,{" "}
              <code>session</code>, and{" "}
              <code>confirmation_required: false</code>. Sessions contain{" "}
              <code>access_token</code>, <code>refresh_token</code>,{" "}
              <code>expires_at</code>, <code>expires_in</code>, and{" "}
              <code>token_type</code>. Sign-up with confirmation enabled returns{" "}
              <code>session: null</code> and{" "}
              <code>confirmation_required: true</code>; confirm the email, then
              sign in from the consuming app.
            </p>
            <p>
              Errors use{" "}
              <code>{'{ "error": { "code": "...", "message": "..." } }'}</code>.
              Validation: 400; unauthorized: 401; origin denied: 403; rate
              limited: 429; unconfigured or unavailable: 503.
            </p>
          </section>
          <section id="integrate" className="panel docs-section">
            <span className="small-label">03 / INTEGRATE</span>
            <h2>Call it from your application</h2>
            <div className="docs-code-heading">
              <span>sign-in.ts</span>
              <CopyButton text={login} />
            </div>
            <pre>
              <code>{login}</code>
            </pre>
            <p>
              Use the returned access token as a Bearer token for{" "}
              <code>me</code> and your protected backend. Validate Supabase JWTs
              on each consuming backend using your project’s JWKS or{" "}
              <code>supabase.auth.getUser(token)</code>. Authentication does not
              automatically authorize access to your app’s data; apply row-level
              security to new Supabase tables.
            </p>
            <p>
              Refresh before expiry and atomically replace both tokens; Supabase
              rotates refresh tokens. Sign-out revokes this session’s refresh
              token. Issued access tokens can remain usable until expiry; clear
              local session state immediately.
            </p>
            <div className="docs-callout">
              For browser apps, use your backend as a proxy and keep tokens in
              secure, HttpOnly cookies. The hosted UI’s cookies belong to this
              service’s origin; visiting it does not create a session on another
              domain. This version provides a token API, not a cross-domain SSO
              redirect protocol.
            </div>
          </section>
          <section className="panel docs-section" id="operations">
            <span className="small-label">04 / OPERATIONS</span>
            <h2>Ready for your environment</h2>
            <p>
              <code>GET /api/health</code> reports configuration status, not a
              database connectivity check. Before launch, configure Supabase
              SMTP for confirmation emails and review provider rate limits. For
              public apps, enable Supabase CAPTCHA and extend the credential
              requests with a CAPTCHA token.
            </p>
            <p>
              Vercel can run this service without a persistent server. Session
              state is held in Supabase and in each client’s cookies or token
              store. No in-memory session database is required.
            </p>
            <Link
              className="text-link"
              href="https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs"
              target="_blank"
              rel="noreferrer"
            >
              Supabase session documentation <ArrowUpRight size={14} />
            </Link>
          </section>
        </article>
        <aside className="docs-toc">
          <span className="nav-label">ON THIS PAGE</span>
          <a href="#setup">Connect & deploy</a>
          <a href="#endpoints">API reference</a>
          <a href="#integrate">Integrate your app</a>
          <a href="#operations">Operations</a>
          <div className="docs-toc-note">
            Built with standard tools.
            <br />
            Designed to stay yours.
          </div>
        </aside>
      </div>
    </Shell>
  );
}
