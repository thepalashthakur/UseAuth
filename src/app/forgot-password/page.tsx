import { AuthLayout } from "@/components/auth-layout";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { isConfigured } from "@/lib/config";
import { recoveryReturnUrl } from "@/lib/auth-contract";

export const metadata = { title: "Forgot password" };
export const dynamic = "force-dynamic";

export default async function ForgotPassword({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; return_to?: string; app_id?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthLayout>
      <PasswordRecoveryForm
        mode="forgot"
        configured={isConfigured()}
        invalidLink={params.error === "invalid"}
        appId={params.app_id && /^[a-z][a-z0-9_-]{2,63}$/.test(params.app_id) ? params.app_id : null}
        returnTo={recoveryReturnUrl(
          params.return_to,
          process.env.AUTH_ALLOWED_ORIGINS,
        )}
      />
    </AuthLayout>
  );
}
