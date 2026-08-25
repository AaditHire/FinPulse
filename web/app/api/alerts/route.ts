import { z } from "zod";
import { authErrorResponse, requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const AlertSchema = z.object({
  name: z.string().trim().min(2).max(120),
  assetId: z.string().uuid().optional(),
  ruleType: z.enum(["price_above", "price_below", "change_percent", "keyword", "provider_health"]),
  configuration: z.record(z.string(), z.unknown()),
});

export async function GET() {
  try {
    const principal = await requireOwner();
    const admin = createSupabaseAdminClient();
    if (!admin) return Response.json({ configured: false, alerts: [], events: [] });
    const [alerts, events] = await Promise.all([
      admin.from("alert_rules").select("id,name,rule_type,configuration,status,requires_approval,approved_at,created_at,updated_at,assets(symbol,name,kind)").eq("owner_id", principal.ownerId).order("updated_at", { ascending: false }),
      admin.from("alert_events").select("id,message,triggered_at,acknowledged_at,delivered_at,delivery_error,alert_rules(name)").eq("owner_id", principal.ownerId).order("triggered_at", { ascending: false }).limit(20),
    ]);
    if (alerts.error || events.error) throw alerts.error ?? events.error;
    return Response.json({ configured: true, alerts: alerts.data, events: events.data });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const principal = await requireOwner();
    const body = AlertSchema.parse(await request.json());
    if (["price_above", "price_below", "change_percent"].includes(body.ruleType) && !Number.isFinite(Number(body.configuration.threshold))) return Response.json({ error: "A finite threshold is required." }, { status: 400 });
    if (body.ruleType === "keyword" && typeof body.configuration.keyword !== "string") return Response.json({ error: "A keyword is required." }, { status: 400 });
    const admin = createSupabaseAdminClient();
    if (!admin) return Response.json({ error: "Supabase is required for alerts." }, { status: 503 });
    const { data, error } = await admin.from("alert_rules").insert({ owner_id: principal.ownerId, asset_id: body.assetId, name: body.name, rule_type: body.ruleType, configuration: body.configuration, status: "draft", requires_approval: true }).select().single();
    if (error) throw error;
    return Response.json({ alert: data, requiresApproval: true }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid alert" }, { status: 400 });
    return authErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const principal = await requireOwner();
    const body = z.object({ id: z.string().uuid(), action: z.enum(["approve", "pause", "resume", "archive", "acknowledge"]) }).parse(await request.json());
    const admin = createSupabaseAdminClient();
    if (!admin) return Response.json({ error: "Supabase is required." }, { status: 503 });
    if (body.action === "acknowledge") {
      const { error } = await admin.from("alert_events").update({ acknowledged_at: new Date().toISOString() }).eq("id", body.id).eq("owner_id", principal.ownerId);
      if (error) throw error;
    } else {
      const status = body.action === "approve" || body.action === "resume" ? "active" : body.action === "pause" ? "paused" : "archived";
      const values: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (body.action === "approve") values.approved_at = new Date().toISOString();
      const { error } = await admin.from("alert_rules").update(values).eq("id", body.id).eq("owner_id", principal.ownerId);
      if (error) throw error;
    }
    return Response.json({ updated: true });
  } catch (error) { return authErrorResponse(error); }
}
