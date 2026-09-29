import Link from "next/link";
import { ShieldCheck, ArrowLeft, Check } from "lucide-react";
import { Logo } from "@/components/shell";
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-layout">
      <section className="auth-brand">
        <Logo />
        <div className="auth-brand-copy">
          <div className="auth-brand-icon">
            <ShieldCheck size={58} strokeWidth={1.3} />
          </div>
          <h2>
            One identity.
            <br />
            Endless possibilities.
          </h2>
          <p>
            A secure foundation for the things
            <br />
            you’re about to build.
          </p>
          <div className="auth-brand-points">
            <span>
              <Check size={16} /> Email & password
            </span>
            <span>
              <Check size={16} /> Verified sessions
            </span>
            <span>
              <Check size={16} /> Built on Supabase
            </span>
          </div>
        </div>
        <span className="auth-brand-footer">Authentication, simplified.</span>
      </section>
      <section className="auth-main">
        <Link className="back-link" href="/">
          <ArrowLeft size={15} />
          Back to overview
        </Link>
        <div className="auth-card">{children}</div>
        <div className="auth-main-footer">
          <Link href="/docs">Integration guide</Link>
          <span>UseAuth v1.0</span>
        </div>
      </section>
    </main>
  );
}
