import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "UseAuth — Authentication, simplified",
    template: "%s | UseAuth",
  },
  description:
    "A plug-and-play email and password authentication service. Built with Next.js and Supabase, ready for Vercel.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
