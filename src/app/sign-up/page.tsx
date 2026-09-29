import { AuthForm } from "@/components/auth-form";
import { AuthLayout } from "@/components/auth-layout";
import { isConfigured } from "@/lib/config";
export const metadata = { title: "Create account" };
export const dynamic = "force-dynamic";
export default function SignUp() {
  return (
    <AuthLayout>
      <AuthForm mode="sign-up" configured={isConfigured()} />
    </AuthLayout>
  );
}
