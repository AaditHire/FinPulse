import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { authErrorResponse, requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const CreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  scopes: z.array(z.enum(["market:read", "research:read", "portfolio:read", "alerts:write"])).min(1),
  expiresInDays: z.number().int().min(1).max(365).default(90),
});

export async function GET() {
  try {
    const principal = await requireOwner();
    const admin = createSupabaseAdminClient();
    if (!admin) return Response.json({ configured: false, tokens: [] });
    const { data, error } = await admin.from("mcp_tokens").select("id,name,token_prefix,scopes,last_used_at,expires_at,revoked_at,created_at").eq("owner_id", principal.ownerId).order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ configured: true, tokens: data });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const principal = await requireOwner();
    const body = CreateSchema.parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) return Response.json({ error: "Supabase is required for personal access tokens." }, { status: 503 });
    const token = `fp_${randomBytes(32).toString("base64url")}`;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString();
    const { data, error } = await admin.from("mcp_tokens").insert({ owner_id: principal.ownerId, name: body.name, token_prefix: token.slice(0, 11), token_hash: tokenHash, scopes: body.scopes, expires_at: expiresAt }).select("id,name,token_prefix,scopes,expires_at,created_at").single();
    if (error) throw error;
    return Response.json({ token, record: data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid token request" }, { status: 400 });
    return authErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const principal = await requireOwner();
    const id = z.string().uuid().parse(new URL(request.url).searchParams.get("id"));
    const admin = createSupabaseAdminClient();
    if (!admin) return Response.json({ error: "Supabase is required." }, { status: 503 });
    const { error } = await admin.from("mcp_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("owner_id", principal.ownerId);
    if (error) throw error;
    return Response.json({ revoked: true });
  } catch (error) { return authErrorResponse(error); }
}
