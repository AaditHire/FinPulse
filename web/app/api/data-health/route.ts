import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!isSupabaseConfigured()) return Response.json({ configured: false, database: null, providers: [], quotas: [], keepalive: null });
    const ownerId = process.env.SUPABASE_OWNER_ID;
    const supabase = createSupabaseAdminClient();
    if (!ownerId || !supabase) return Response.json({ error: "Public health telemetry is not configured" }, { status: 503 });
    const [database, providers, keepalive] = await Promise.all([
      supabase.rpc("database_size_report", { p_owner_id: ownerId }),
      supabase.from("provider_health").select("provider,status,latency_ms,last_success_at,checked_at").eq("owner_id", ownerId).order("provider"),
      supabase.from("keepalive_events").select("checked_at").eq("owner_id", ownerId).order("checked_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const failed = [database, providers, keepalive].find(result => result.error);
    if (failed?.error) throw failed.error;
    const report = Array.isArray(database.data) ? database.data[0] : database.data;
    return Response.json({
      configured: true,
      database: report ? { databaseBytes: Number(report.databaseBytes ?? 0), utilizationPercent: Number(report.utilizationPercent ?? 0) } : null,
      providers: providers.data ?? [],
      keepalive: keepalive.data ?? null,
    });
  } catch {
    return Response.json({ error: "Health telemetry is temporarily unavailable" }, { status: 502 });
  }
}
