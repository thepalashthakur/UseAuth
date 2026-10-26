import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
import { isConfigured } from "@/lib/config";
export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = params.next?.startsWith("/oauth/consent?authorization_id=") && !params.next.includes("//") ? params.next : undefined;
  return (
    <AuthLayout>
      <AuthForm
        mode="sign-in"
        configured={isConfigured()}
        confirmationError={params.error === "confirmation"}
        next={next}
      />
    </AuthLayout>
  );
}
