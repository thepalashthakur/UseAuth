"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  Mail,
  CheckCircle2,
} from "lucide-react";

export function AuthForm({
  mode,
  configured,
  confirmationError = false,
}: {
  mode: "sign-in" | "sign-up";
  configured: boolean;
  confirmationError?: boolean;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(
    confirmationError
      ? "That confirmation link is invalid or expired. Try signing in if you have already confirmed your email."
      : "",
  );
  const [confirmation, setConfirmation] = useState(false);
  const signingUp = mode === "sign-up";

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError("");
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/browser/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email")).trim(),
          password: form.get("password"),
          ...(signingUp
            ? {
                username: String(form.get("username") ?? "").trim(),
                display_name: String(form.get("display_name") ?? "").trim(),
              }
            : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(
          body.error?.message ?? "Unable to continue. Please try again.",
        );
        return;
      }
      if (body.confirmation_required) {
        setConfirmation(true);
        return;
      }
      router.replace("/account");
      router.refresh();
    } catch {
      setError(
        "Could not reach the service. Check your connection and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  if (confirmation)
    return (
      <div className="confirmation">
        <span className="feature-icon mint">
          <Mail size={28} />
        </span>
        <h1>Check your inbox.</h1>
        <p>
          If this address can be registered, you’ll receive a confirmation link
          shortly. Open it to finish creating your account.
        </p>
        <Link href="/sign-in" className="button primary">
          Back to sign in <ArrowRight size={16} />
        </Link>
      </div>
    );

  return (
    <>
      <span className="auth-eyebrow">
        {signingUp ? "A FRESH START" : "GOOD TO SEE YOU AGAIN"}
      </span>
      <h1>{signingUp ? "Create your account." : "Welcome back."}</h1>
      <p className="auth-description">
        {signingUp
          ? "Your next application starts with a secure identity."
          : "Sign in to your UseAuth account."}
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
        {signingUp && (
          <>
            <label htmlFor="username">Username (optional)</label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              minLength={3}
              maxLength={30}
              pattern="[A-Za-z0-9_]{3,30}"
              title="3–30 letters, numbers, or underscores"
              placeholder="your_username"
              disabled={pending}
            />
            <label htmlFor="display_name">Display name (optional)</label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              autoComplete="nickname"
              maxLength={80}
              placeholder="How you want to be known"
              disabled={pending}
            />
          </>
        )}
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
        <div className="password-label">
          <label htmlFor="password">Password</label>
          {signingUp ? (
            <span>At least 8 characters</span>
          ) : (
            <Link href="/forgot-password">Forgot password?</Link>
          )}
        </div>
        <div className="password-input">
          <input
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete={signingUp ? "new-password" : "current-password"}
            minLength={signingUp ? 8 : 1}
            maxLength={128}
            placeholder={
              signingUp ? "Create a strong password" : "Enter your password"
            }
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
              <LoaderCircle size={17} className="spin" />
              Please wait…
            </>
          ) : (
            <>
              {signingUp ? "Create account" : "Sign in"}
              <ArrowRight size={17} />
            </>
          )}
        </button>
      </form>
      <p className="auth-switch">
        {signingUp ? "Already have an account?" : "New to UseAuth?"}{" "}
        <Link href={signingUp ? "/sign-in" : "/sign-up"}>
          {signingUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
      <div className="auth-security">
        <CheckCircle2 size={14} /> Your password is securely managed by
        Supabase.
      </div>
    </>
  );
}
