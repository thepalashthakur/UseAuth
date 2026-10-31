import { AuthLayout } from "@/components/auth-layout";
import { PasswordRecoveryForm } from "@/components/password-recovery-form";
import { isConfigured } from "@/lib/config";
import { cookieClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { recoveryReturnUrl } from "@/lib/auth-contract";
import { cookies } from "next/headers";
import { recoveryCookie, validRecoveryGrant } from "@/lib/recovery-grant";
import { readAppReturn, registeredAppOrigin } from "@/lib/app-return";

export const metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default async function ResetPassword({
  searchParams,
}: {
  searchParams: Promise<{ return_to?: string; context?: string }>;
}) {
  const params = await searchParams;
  let signedReturn: string | null = null;
  if (isConfigured()) {
    const client = await cookieClient();
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) redirect("/forgot-password?error=invalid");
    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData.session;
    const store = await cookies();
    if (
      !session ||
      session.user.id !== data.user.id ||
      !validRecoveryGrant(
        store.get(recoveryCookie)?.value,
        session.access_token,
        data.user.id,
      )
    )
      redirect("/forgot-password?error=invalid");
    const context = data.user.email
      ? readAppReturn(params.context, data.user.email, "recovery")
      : null;
    const origin = context ? await registeredAppOrigin(client, context.appId) : null;
    if (origin === context?.origin) signedReturn = origin;
  }
  return (
    <AuthLayout>
      <PasswordRecoveryForm
        mode="reset"
        configured={isConfigured()}
        returnTo={signedReturn ?? recoveryReturnUrl(
          params.return_to,
          process.env.AUTH_ALLOWED_ORIGINS,
        )}
      />
    </AuthLayout>
  );
}
