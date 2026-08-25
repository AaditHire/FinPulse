import { requireOwner, authErrorResponse } from "@/lib/auth";
import { PROVIDERS } from "@/lib/providers/registry";

export async function GET() {
  try { await requireOwner(); return Response.json({ providers: PROVIDERS }); }
  catch (error) { return authErrorResponse(error); }
}
