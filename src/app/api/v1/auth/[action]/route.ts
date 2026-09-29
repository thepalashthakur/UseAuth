import { handleAuth } from "@/lib/auth-handler";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action: string }> };
async function handler(request: Request, context: Context) {
  return handleAuth(request, (await context.params).action, "token");
}
export { handler as GET, handler as POST, handler as OPTIONS };
