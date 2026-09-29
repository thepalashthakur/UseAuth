import Link from "next/link";
import { Shell } from "@/components/shell";
export default function NotFound() {
  return (
    <Shell>
      <div className="empty-state">
        <span className="eyebrow">404</span>
        <h1>This page isn’t here.</h1>
        <p>Let’s get you back to your workspace.</p>
        <Link className="button primary" href="/">
          Back to overview
        </Link>
      </div>
    </Shell>
  );
}
