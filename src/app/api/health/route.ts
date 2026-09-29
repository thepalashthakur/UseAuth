import { isConfigured } from "@/lib/config";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    {
      service: "useauth",
      version: "1.0.0",
      status: isConfigured() ? "configured" : "setup_required",
      checks: { supabase_configured: isConfigured() },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
