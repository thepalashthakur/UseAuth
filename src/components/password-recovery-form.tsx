"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle, Mail } from "lucide-react";

export function PasswordRecoveryForm({
  mode,
  configured,
  invalidLink = false,
  returnTo = null,
  appId = null,
}: {
  mode: "forgot" | "reset";
  configured: boolean;
  invalidLink?: boolean;
  returnTo?: string | null;
  appId?: string | null;
}) {
  const forgot = mode === "forgot";
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(
    invalidLink
      ? "That reset link is invalid or expired. Request a new one."
      : "",
  );

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setError("");
    if (!forgot && form.get("password") !== form.get("confirm_password")) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch(
        `/api/browser/auth/${forgot ? "forgot-password" : "reset-password"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            forgot
              ? {
                  email: String(form.get("email")).trim(),
                  ...(appId ? { app_id: appId } : {}),
                  ...(returnTo ? { return_to: returnTo } : {}),
                }
              : { password: form.get("password") },
          ),
        },
      );
      const body = await response.json();
      if (!response.ok) {
        setError(
          body.error?.message ?? "Unable to continue. Please try again.",
        );
        return;
      }
      setComplete(true);
      if (!forgot && returnTo) window.location.assign(returnTo);
    } catch {
      setError(
        "Could not reach the service. Check your connection and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  if (complete)
    return (
      <div className="confirmation">
        <span className="feature-icon mint">
          <Mail size={28} />
        </span>
        <h1>{forgot ? "Check your inbox." : "Password updated."}</h1>
        <p>
          {forgot
            ? "If an account exists for that email, a reset link will arrive shortly. Open it to choose a new password."
            : "You can now sign in with your new password."}
        </p>
        {returnTo ? (
          <a href={returnTo} className="button primary">
            Back to your app <ArrowRight size={16} />
          </a>
        ) : (
          <Link href="/sign-in" className="button primary">
            Back to sign in <ArrowRight size={16} />
          </Link>
        )}
      </div>
    );

  return (
    <>
      <span className="auth-eyebrow">
        {forgot ? "ACCOUNT RECOVERY" : "CHOOSE A NEW PASSWORD"}
      </span>
      <h1>{forgot ? "Forgot your password?" : "Reset your password."}</h1>
      <p className="auth-description">
        {forgot
          ? "Enter your email and we’ll send you a link to reset it."
          : "Enter a new password for your account."}
      </p>
      {!configured && (
        <div className="setup-alert">
          <strong>Let’s connect Supabase first.</strong>
          <p>
            Add the environment variables to enable authentication.{" "}
            <Link href="/docs#setup">
              View setup guide <ArrowRight size={12} />
            </Link>
          </p>
        </div>
      )}
      <form onSubmit={submit} className="auth-form">
        {forgot ? (
          <>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              placeholder="you@example.com"
              required
              disabled={pending}
            />
          </>
        ) : (
          <>
            <div className="password-label">
              <label htmlFor="password">New password</label>
              <span>At least 8 characters</span>
            </div>
            <div className="password-input">
              <input
                id="password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                maxLength={128}
                placeholder="Create a new password"
                required
                disabled={pending}
              />
              <button
                type="button"
                aria-label={visible ? "Hide password" : "Show password"}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <label
              htmlFor="confirm_password"
              className="recovery-confirm-label"
            >
              Confirm new password
            </label>
            <input
              id="confirm_password"
              name="confirm_password"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              minLength={8}
              maxLength={128}
              placeholder="Enter your new password again"
              required
              disabled={pending}
            />
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="button primary auth-submit"
          disabled={pending || !configured}
        >
          {pending ? (
            <>
              <LoaderCircle size={17} className="spin" /> Please wait…
            </>
          ) : (
            <>
              {forgot ? "Send reset link" : "Update password"}
              <ArrowRight size={17} />
            </>
          )}
        </button>
      </form>
      <p className="auth-switch">
        {forgot ? "Remember your password?" : "Need another link?"}{" "}
        <Link href={forgot ? "/sign-in" : "/forgot-password"}>
          {forgot ? "Sign in" : "Request a new link"}
        </Link>
      </p>
    </>
  );
}
