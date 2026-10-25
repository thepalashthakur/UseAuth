import Link from "next/link";
import {
  ArrowUpRight,
  Fingerprint,
  BookOpen,
  LayoutDashboard,
  KeyRound,
  Terminal,
  CircleUserRound,
} from "lucide-react";

export function Logo() {
  return (
    <Link href="/" className="logo" aria-label="UseAuth home">
      <span className="logo-symbol">
        <Fingerprint size={23} />
      </span>
      use<span className="logo-light">auth</span>
      <span className="version">v1.0</span>
    </Link>
  );
}

export function Shell({
  children,
  active = "overview",
  accountEmail,
}: {
  children: React.ReactNode;
  active?: "overview" | "docs" | "account";
  accountEmail?: string;
}) {
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Logo />
        <div className="workspace-label">
          <span className="workspace-icon">U</span>
          <div>
            UseAuth workspace<small>Email & password</small>
          </div>
          <span className="tiny-dot" />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          <Link
            href="/"
            className={active === "overview" ? "nav-item active" : "nav-item"}
          >
            <LayoutDashboard size={18} />
            Overview
          </Link>
          <Link
            href="/account"
            className={active === "account" ? "nav-item active" : "nav-item"}
          >
            <KeyRound size={18} />
            My account
          </Link>
          <Link
            href="/docs"
            className={active === "docs" ? "nav-item active" : "nav-item"}
          >
            <BookOpen size={18} />
            Integration guide
          </Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Terminal size={19} />
            <strong>Built to plug in.</strong>
            <p>
              One auth service.
              <br />
              Any application.
            </p>
            <Link href="/docs">
              Start integrating <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="powered">
            <span className="tiny-dot" /> Powered by Supabase
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {active === "overview"
                ? "Overview"
                : active === "docs"
                  ? "Integration guide"
                  : "My account"}
            </strong>
          </span>
          {accountEmail ? (
            <span className="topbar-identity" title={accountEmail}>
              <CircleUserRound size={17} /> {accountEmail}
            </span>
          ) : (
            <Link href="/sign-in" className="topbar-signin">
              Sign in <ArrowUpRight size={15} />
            </Link>
          )}
        </header>
        <main className="content">{children}</main>
        <footer className="footer">
          <span>UseAuth · Authentication, simplified.</span>
          <span>
            Next.js <span className="footer-dot">·</span> Supabase{" "}
            <span className="footer-dot">·</span> Vercel
          </span>
        </footer>
      </div>
    </div>
  );
}
