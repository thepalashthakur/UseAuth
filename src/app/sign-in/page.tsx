import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
import { isConfigured } from "@/lib/config";
export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  return (
    <AuthLayout>
      <AuthForm
        mode="sign-in"
        configured={isConfigured()}
        confirmationError={(await searchParams).error === "confirmation"}
      />
    </AuthLayout>
  );
}
