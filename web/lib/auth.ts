import { createHash } from "node:crypto";
import "server-only";

import { ownerEmails, isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthPrincipal = {
  ownerId: string;
  email?: string;
  scopes: Set<string>;
  kind: "session" | "pat" | "local";
};

const LOCAL_OWNER_ID = "00000000-0000-0000-0000-000000000000";

export class AuthError extends Error {
  constructor(message: string, public status = 401) { super(message); }
}

function assertOwnerEmail(email: string | undefined) {
  const allowlist = ownerEmails();
  if (!email || !allowlist.size || !allowlist.has(email.toLowerCase())) {
    throw new AuthError("This FinPulse deployment is owner-only.", 403);
  }
}

export async function requireOwner(): Promise<AuthPrincipal> {
  if (!isSupabaseConfigured()) {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_LOCAL_MODE !== "true") throw new AuthError("Supabase authentication is required in production.", 503);
    return { ownerId: LOCAL_OWNER_ID, scopes: new Set(["market:read", "research:read", "portfolio:read", "alerts:write"]), kind: "local" };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase!.auth.getUser();
  if (error || !data.user) throw new AuthError("Sign in to continue.");
  assertOwnerEmail(data.user.email);
  return {
    ownerId: data.user.id,
    email: data.user.email,
    scopes: new Set(["market:read", "research:read", "portfolio:read", "alerts:write"]),
    kind: "session",
  };
}

export async function authenticateRequest(request: Request, requiredScopes: string[] = []): Promise<AuthPrincipal> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer fp_")) {
    const principal = await requireOwner();
    for (const scope of requiredScopes) if (!principal.scopes.has(scope)) throw new AuthError(`Missing scope: ${scope}`, 403);
    return principal;
  }

  const token = authorization.slice("Bearer ".length).trim();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const admin = createSupabaseAdminClient();
  if (!admin) throw new AuthError("Personal access tokens require Supabase.", 503);
  const { data, error } = await admin.from("mcp_tokens").select("id,owner_id,scopes,expires_at,revoked_at").eq("token_hash", tokenHash).maybeSingle();
  if (error || !data || data.revoked_at || (data.expires_at && Date.parse(data.expires_at) <= Date.now())) {
    throw new AuthError("Invalid or expired FinPulse token.");
  }
  const scopes = new Set<string>(data.scopes ?? []);
  for (const scope of requiredScopes) if (!scopes.has(scope)) throw new AuthError(`Missing scope: ${scope}`, 403);
  void admin.from("mcp_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { ownerId: data.owner_id, scopes, kind: "pat" };
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: error instanceof Error ? error.message : "Authorization failed" }, { status: 500 });
}
