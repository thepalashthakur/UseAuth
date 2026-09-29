import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, ArrowUpRight } from "lucide-react";
import { isConfigured } from "@/lib/config";
import { cookieClient } from "@/lib/supabase/server";
import { Shell } from "@/components/shell";
import { SignOut } from "@/components/sign-out";
export const metadata = { title: "My account" };
export const dynamic = "force-dynamic";
export default async function Account() {
  if (!isConfigured()) redirect("/sign-in");
  const client = await cookieClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) redirect("/sign-in");
  const user = data.user;
  return (
    <Shell active="account">
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR VERIFIED IDENTITY</div>
          <h1>
            You’re signed in<span className="heading-dot">.</span>
          </h1>
          <p>Your account is ready to use.</p>
        </div>
        <span className="status-pill connected">
          <span className="tiny-dot" />
          Authenticated
        </span>
      </div>
      <section className="panel account-panel">
        <div className="account-heading">
          <span className="feature-icon lavender">
            <ShieldCheck size={25} />
          </span>
          <div>
            <h2>Account details</h2>
            <p>Verified directly with Supabase Auth.</p>
          </div>
        </div>
        <dl className="account-details">
          <div>
            <dt>Email address</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>User ID</dt>
            <dd className="monospace">{user.id}</dd>
          </div>
          <div>
            <dt>Email confirmation</dt>
            <dd>{user.email_confirmed_at ? "Confirmed" : "Not confirmed"}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>
              {new Date(user.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                timeZone: "UTC",
              })}
            </dd>
          </div>
        </dl>
        <SignOut />
      </section>
      <div className="foundation-note">
        <ShieldCheck size={20} />
        <p>Connect your application to this service using the versioned API.</p>
        <Link href="/docs">
          Integration guide <ArrowUpRight size={15} />
        </Link>
      </div>
    </Shell>
  );
}
