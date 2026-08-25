import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireOwner, authErrorResponse } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const principal = await requireOwner();
    return Response.json({ configured: isSupabaseConfigured(), authenticated: true, email: principal.email, kind: principal.kind });
  } catch (error) {
    if (!isSupabaseConfigured()) return Response.json({ configured: false, authenticated: true, kind: "local" });
    return authErrorResponse(error);
  }
}
