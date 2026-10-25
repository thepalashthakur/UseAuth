import { AuthLayout } from "@/components/auth-layout";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { isConfigured } from "@/lib/config";
import { cookieClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { recoveryReturnUrl } from "@/lib/auth-contract";

export const metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string }>;
}) {
  if (isConfigured()) {
    const client = await cookieClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) redirect("/forgot-password?error=invalid");
  }
  return (
    <AuthLayout>
      <PasswordRecoveryForm
        mode="reset"
        configured={isConfigured()}
        returnTo={recoveryReturnUrl(
          (await searchParams).return_to,
          process.env.AUTH_ALLOWED_ORIGINS,
        )}
      />
    </AuthLayout>
  );
}
