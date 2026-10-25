import { isConfigured } from "@/lib/config";
import { recoveryConfigured } from "@/lib/recovery-grant";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    {
      service: "useauth",
      version: "1.0.0",
      status:
        isConfigured() && recoveryConfigured()
          ? "configured"
          : "setup_required",
      checks: {
        supabase_configured: isConfigured(),
        recovery_configured: recoveryConfigured(),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
