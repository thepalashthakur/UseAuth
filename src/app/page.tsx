import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Code2,
  Database,
  KeyRound,
  Layers,
  Mail,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Shell } from "@/components/shell";
import { CopyButton } from "@/components/copy-button";
import { isConfigured } from "@/lib/config";
export const dynamic = "force-dynamic";
const example = `const response = await fetch(\n  'https://YOUR-SERVICE.vercel.app/api/v1/auth/sign-in',\n  {\n    method: 'POST',\n    headers: { 'Content-Type': 'application/json' },\n    body: JSON.stringify({\n      email: 'you@example.com',\n      password: 'your-password'\n    })\n  }\n);\n\nconst { session, user } = await response.json();`;

export default function Home() {
  const configured = isConfigured();
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR AUTHENTICATION, IN ONE PLACE</div>
          <h1>
            Welcome to UseAuth<span className="heading-dot">.</span>
          </h1>
          <p>A small service. A solid foundation for every app you build.</p>
        </div>
        <span className={configured ? "status-pill connected" : "status-pill"}>
          <span className="tiny-dot" />
          {configured ? "Supabase configured" : "Setup required"}
        </span>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-tag">
            <Zap size={13} /> PLUG IN. SIGN IN. SHIP.
          </span>
          <h2>
            Authentication.
            <br />
            Already handled.
          </h2>
          <p>
            Give your app a secure front door.
            <br />
            Email and password auth, a clean API, and a hosted
            <br className="desktop-break" /> sign-in experience — ready when you
            are.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/sign-up">
              Try the auth flow <ArrowRight size={16} />
            </Link>
            <Link className="hero-docs" href="/docs">
              Read the docs <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="hero-foot">
            <Check size={13} /> Open architecture <span>·</span>
            <Check size={13} /> Vercel ready
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <span className="orbit-node node-one">
            <Code2 size={21} />
          </span>
          <span className="orbit-node node-two">
            <Database size={20} />
          </span>
          <span className="orbit-node node-three">
            <Mail size={19} />
          </span>
          <div className="auth-core">
            <ShieldCheck size={62} strokeWidth={1.2} />
          </div>
          <div className="art-caption">
            <span className="tiny-dot" /> Identity, connected.
          </div>
        </div>
      </section>
      <div className="section-heading">
        <h2>Everything you need to get started</h2>
        <span>Focused by design</span>
      </div>
      <div className="feature-grid">
        <article className="feature-card">
          <span className="feature-icon lavender">
            <KeyRound size={21} />
          </span>
          <h3>Email & password</h3>
          <p>
            Sign up, sign in, and confirm emails.
            <br />A familiar flow for your users.
          </p>
          <Link href="/sign-in">
            Open hosted sign-in <ArrowUpRight size={15} />
          </Link>
        </article>
        <article className="feature-card">
          <span className="feature-icon mint">
            <Code2 size={21} />
          </span>
          <h3>A straightforward API</h3>
          <p>
            Versioned endpoints with JWT sessions.
            <br />
            Connect your frontend or backend.
          </p>
          <Link href="/docs#endpoints">
            Explore endpoints <ArrowUpRight size={15} />
          </Link>
        </article>
        <article className="feature-card">
          <span className="feature-icon peach">
            <Layers size={21} />
          </span>
          <h3>Your stack. Your service.</h3>
          <p>
            Next.js and Supabase, together.
            <br />
            Deploy on Vercel and make it yours.
          </p>
          <Link href="/docs#setup">
            View setup guide <ArrowUpRight size={15} />
          </Link>
        </article>
      </div>
      <div className="lower-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>From zero to authenticated</h2>
              <p>Three steps. One less thing to build.</p>
            </div>
            <span className="small-label">QUICK START</span>
          </div>
          <div className="steps">
            <div className="step">
              <span className="step-number">01</span>
              <div>
                <h3>Connect your Supabase project</h3>
                <p>Add your project URL and publishable key.</p>
              </div>
              <Database size={18} />
            </div>
            <div className="step">
              <span className="step-number">02</span>
              <div>
                <h3>Deploy your auth service</h3>
                <p>Import this repository into Vercel.</p>
              </div>
              <Zap size={18} />
            </div>
            <div className="step">
              <span className="step-number">03</span>
              <div>
                <h3>Plug it into your application</h3>
                <p>Call the API or use the hosted auth pages.</p>
              </div>
              <Code2 size={18} />
            </div>
          </div>
          <Link className="panel-footer" href="/docs">
            Walk through the integration <ArrowRight size={16} />
          </Link>
        </section>
        <section className="code-panel">
          <div className="code-heading">
            <span>
              <span className="code-dot" /> A little code. A lot less work.
            </span>
            <CopyButton text={example} />
          </div>
          <div className="code-file">
            <Code2 size={14} /> sign-in.ts <span>JavaScript</span>
          </div>
          <pre>
            <code>{example}</code>
          </pre>
          <div className="code-footer">
            <CheckCircle2 size={14} /> Standard JSON. Supabase-issued tokens.
          </div>
        </section>
      </div>
      <div className="foundation-note">
        <ShieldCheck size={19} />
        <p>
          <strong>Simple today. Room to grow tomorrow.</strong> Start with email
          and password. Extend the service as your app grows.
        </p>
        <span className="small-label">V1 FOUNDATION</span>
      </div>
    </Shell>
  );
}
