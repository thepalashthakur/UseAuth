import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  MailCheck,
  ShieldCheck,
} from "lucide-react";
import { isConfigured } from "@/lib/config";
import { publicUser } from "@/lib/auth-contract";
import { cookieClient } from "@/lib/supabase/server";
import { Shell } from "@/components/shell";
import { SignOut } from "@/components/sign-out";
import { ChangePasswordForm } from "@/components/change-password-form";

export const metadata = { title: "My account" };
export const dynamic = "force-dynamic";

export default async function Account() {
  if (!isConfigured()) redirect("/sign-in");
  const client = await cookieClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect("/sign-in");
  const user = data.user;
  const profile = publicUser(user);
  const name =
    profile.display_name || profile.username || user.email || "Your account";
  const initial = name.charAt(0).toUpperCase();
  const joined = new Date(user.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <Shell active="account" accountEmail={user.email}>
      <div className="page-heading account-page-heading">
        <div>
          <div className="eyebrow">ACCOUNT CENTER</div>
          <h1>
            Your account<span className="heading-dot">.</span>
          </h1>
          <p>Manage your identity and keep your sign-in secure.</p>
        </div>
        <span className="status-pill connected">
          <span className="tiny-dot" /> Signed in
        </span>
      </div>

      <section className="account-hero" aria-label="Signed-in account">
        <div className="account-avatar" aria-hidden="true">
          {initial}
        </div>
        <div className="account-hero-copy">
          <span className="account-hero-label">SIGNED IN AS</span>
          <h2>{name}</h2>
          <p>{user.email}</p>
        </div>
        <span className="account-verified">
          <ShieldCheck size={16} />{" "}
          {user.email_confirmed_at ? "Email verified" : "Email not verified"}
        </span>
      </section>

      <div className="account-grid">
        <section className="panel account-info-panel">
          <div className="account-section-heading">
            <span className="account-section-icon">
              <Fingerprint size={20} />
            </span>
            <div>
              <h2>Account details</h2>
              <p>Your profile and sign-in information.</p>
            </div>
          </div>
          <dl className="account-details">
            <div>
              <dt>Email address</dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>Display name</dt>
              <dd>{profile.display_name || "Not set"}</dd>
            </div>
            <div>
              <dt>Username</dt>
              <dd>{profile.username ? `@${profile.username}` : "Not set"}</dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>{joined}</dd>
            </div>
            <div>
              <dt>User ID</dt>
              <dd className="monospace">{user.id}</dd>
            </div>
          </dl>
          <div className="account-info-footer">
            <MailCheck size={17} />
            <span>
              {user.email_confirmed_at
                ? "Your email address is confirmed."
                : "Your email address is awaiting confirmation."}
            </span>
          </div>
        </section>

        <section className="panel account-security-panel">
          <div className="account-section-heading">
            <span className="account-section-icon purple">
              <LockKeyhole size={20} />
            </span>
            <div>
              <h2>Change password</h2>
              <p>Use your current password to set a new one.</p>
            </div>
          </div>
          <ChangePasswordForm />
        </section>
      </div>

      <div className="account-actions-grid">
        <section className="account-action-card">
          <span className="account-action-icon">
            <KeyRound size={21} />
          </span>
          <div>
            <h2>Forgot your password?</h2>
            <p>Get a secure reset link by email if you can’t remember it.</p>
          </div>
          <Link href="/forgot-password">
            Reset password <ArrowRight size={16} />
          </Link>
        </section>
        <section className="account-action-card">
          <span className="account-action-icon">
            <CalendarDays size={21} />
          </span>
          <div>
            <h2>Finished for now?</h2>
            <p>Sign out of this browser when you’re done.</p>
          </div>
          <SignOut />
        </section>
      </div>
    </Shell>
  );
}
