import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
import { isConfigured } from "@/lib/config";
export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";
export default async function SignUp({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const candidate = (await searchParams).next;
  const next = candidate?.startsWith("/oauth/consent?authorization_id=") && !candidate.includes("//") ? candidate : undefined;
  return (
    <AuthLayout>
      <AuthForm mode="sign-up" configured={isConfigured()} next={next} />
    </AuthLayout>
  );
}
