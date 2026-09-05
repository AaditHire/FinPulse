import { authErrorResponse, requireOwner } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const principal = await requireOwner();
    if (!isSupabaseConfigured()) return Response.json({ configured: false, database: null, providers: [], quotas: [], keepalive: null });
    const supabase = await createSupabaseServerClient();
    const [database, providers, policies, windows, keepalive] = await Promise.all([
      supabase!.rpc("database_size_report", { p_owner_id: principal.ownerId }),
      supabase!.from("provider_health").select("provider,status,latency_ms,last_success_at,last_error_at,error_message,checked_at").eq("owner_id", principal.ownerId).order("provider"),
      supabase!.from("llm_model_policies").select("provider,model_id,role,rpm,rpd,tpm,tpd,enabled").eq("owner_id", principal.ownerId),
      supabase!.from("llm_quota_windows").select("provider,model_id,workload,limit_type,window_start,used").eq("owner_id", principal.ownerId).gte("window_start", new Date(Date.now() - 86_400_000).toISOString()),
      supabase!.from("keepalive_events").select("source,checked_at").eq("owner_id", principal.ownerId).order("checked_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const failed = [database, providers, policies, windows, keepalive].find(result => result.error);
    if (failed?.error) throw failed.error;
    return Response.json({ configured: true, database: database.data, providers: providers.data ?? [], policies: policies.data ?? [], quotas: windows.data ?? [], keepalive: keepalive.data ?? null });
  } catch (error) { return authErrorResponse(error); }
}
