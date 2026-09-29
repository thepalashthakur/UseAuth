"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
export function SignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/browser/auth/sign-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        setError("Unable to sign out. Please try again.");
        return;
      }
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("Could not reach the service. Please try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <button className="button secondary" disabled={pending} onClick={signOut}>
        <LogOut size={16} />
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
