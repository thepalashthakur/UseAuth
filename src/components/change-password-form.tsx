"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";

export function ChangePasswordForm() {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError("");
    setSuccess("");
    if (form.get("password") !== form.get("confirm_password")) {
      setError("New passwords do not match.");
      return;
    }
    setPending(true);
    try {
      const response = await fetch("/api/browser/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          current_password: form.get("current_password"),
          password: form.get("password"),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error?.message ?? "Unable to change your password.");
        return;
      }
      formElement.reset();
      setSuccess("Password changed successfully.");
    } catch {
      setError(
        "Could not reach the service. Check your connection and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="account-password-form" onSubmit={submit}>
      <label htmlFor="current_password">Current password</label>
      <input
        id="current_password"
        name="current_password"
        type={visible ? "text" : "password"}
        autoComplete="current-password"
        maxLength={128}
        required
        disabled={pending}
        placeholder="Enter current password"
      />
      <label htmlFor="new_password">New password</label>
      <div className="account-password-input">
        <input
          id="new_password"
          name="password"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
          disabled={pending}
          placeholder="At least 8 characters"
        />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? "Hide passwords" : "Show passwords"}
        >
          {visible ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
      <label htmlFor="confirm_new_password">Confirm new password</label>
      <input
        id="confirm_new_password"
        name="confirm_password"
        type={visible ? "text" : "password"}
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        required
        disabled={pending}
        placeholder="Enter new password again"
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="form-success" role="status">
          {success}
        </p>
      )}
      <button
        type="submit"
        className="button primary account-password-submit"
        disabled={pending}
      >
        {pending ? (
          <>
            <LoaderCircle size={16} className="spin" /> Updating…
          </>
        ) : (
          <>
            Change password <ArrowRight size={16} />
          </>
        )}
      </button>
      <p className="account-password-help">
        Forgotten your current password?{" "}
        <Link href="/forgot-password">Reset it by email</Link>
      </p>
    </form>
  );
}
