import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const expected = process.env.KEEPALIVE_SECRET;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || supplied !== expected) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ownerId = process.env.SUPABASE_OWNER_ID;
  const admin = createSupabaseAdminClient();
  if (!ownerId || !admin) return Response.json({ error: "Supabase keep-alive is not configured" }, { status: 503 });
  const started = Date.now();
  const insert = await admin.from("keepalive_events").insert({ owner_id: ownerId, source: "github-actions" }).select("checked_at").single();
  if (insert.error) return Response.json({ error: insert.error.message }, { status: 502 });
  const [size, providers] = await Promise.all([
    admin.rpc("database_size_report", { p_owner_id: ownerId }),
    admin.from("provider_health").select("provider,status,checked_at").eq("owner_id", ownerId).limit(20),
  ]);
  if (size.error || providers.error) return Response.json({ error: size.error?.message ?? providers.error?.message }, { status: 502 });
  const report = size.data as { databaseBytes?: number; utilizationPercent?: number; relations?: Record<string, number> };
  const utilization = Number(report.utilizationPercent ?? 0);
  const action = utilization >= 80 ? "reject" : utilization >= 70 ? "prune" : utilization >= 60 ? "warn" : "ok";
  const snapshot = await admin.from("database_size_snapshots").insert({ owner_id: ownerId, database_bytes: Number(report.databaseBytes ?? 0), relation_bytes: report.relations ?? {}, utilization_percent: utilization, action });
  if (snapshot.error) return Response.json({ error: snapshot.error.message }, { status: 502 });
  if (utilization >= 70) await admin.rpc("prune_expired_data", { p_owner_id: ownerId });
  return Response.json({ ok: true, checkedAt: insert.data.checked_at, latencyMs: Date.now() - started, database: size.data, providers: providers.data });
}
