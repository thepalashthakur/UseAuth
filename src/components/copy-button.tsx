"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
export function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState("Copy");
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("Copied");
    } catch {
      setState("Select to copy");
    }
    setTimeout(() => setState("Copy"), 2000);
  }
  return (
    <button className="copy-button" onClick={copy} aria-label="Copy code">
      {state === "Copied" ? <Check size={14} /> : <Copy size={14} />}
      {state}
    </button>
  );
}
