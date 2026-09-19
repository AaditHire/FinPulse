import { buildAndSendResearchDigest } from "@/lib/digest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

function localClock(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export async function POST(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || supplied !== process.env.CRON_SECRET) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ownerId = process.env.SUPABASE_OWNER_ID; const apiKey = process.env.GROQ_API_KEY; const admin = createSupabaseAdminClient();
  if (!ownerId || !apiKey || !admin) return Response.json({ error: "Digest scheduler is not configured." }, { status: 503 });
  const { data: preference, error: preferenceError } = await admin.from("notification_preferences").select("recipient,delivery_time,timezone,digest_enabled,approved_at").eq("owner_id", ownerId).maybeSingle();
  if (preferenceError) return Response.json({ error: preferenceError.message }, { status: 502 });
  if (!preference?.digest_enabled || !preference.approved_at) return Response.json({ skipped: "Digest is disabled or not approved." });
  const clock = localClock(preference.timezone); const [hour, minute] = String(preference.delivery_time).split(":").map(Number); const target = hour * 60 + minute;
  if (clock.minutes < target || clock.minutes >= target + 30) return Response.json({ skipped: "Outside the approved delivery window." });
  const scheduledWindow = `${clock.date}T00:00:00.000Z`;
  const { data: delivery, error: insertError } = await admin.from("delivery_items").insert({ owner_id: ownerId, channel: "email-digest", content_hash: "daily-research-digest", scheduled_window: scheduledWindow, status: "processing", worker_id: "typescript-scheduler", lease_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(), metadata: { timezone: preference.timezone, deliveryTime: String(preference.delivery_time).slice(0, 5) } }).select("id").maybeSingle();
  if (insertError || !delivery) return Response.json({ skipped: "This delivery window was already claimed." });
  try {
    console.log("[api/internal/digest/run] claimed", { ownerId, deliveryId: delivery.id, scheduledWindow });
    const result = await buildAndSendResearchDigest({ ownerId, recipient: preference.recipient, apiKey });
    await admin.from("delivery_items").update({ status: "sent", sent_at: new Date().toISOString(), lease_expires_at: null }).eq("id", delivery.id);
    console.log("[api/internal/digest/run] sent", { ownerId, deliveryId: delivery.id, runId: result.runId, citations: result.citations });
    return Response.json({ sent: true, ...result });
  } catch (error) {
    console.error("[api/internal/digest/run] failed", { ownerId, deliveryId: delivery.id, error: error instanceof Error ? error.message : "Digest failed" });
    await admin.from("delivery_items").update({ status: "failed", error_message: error instanceof Error ? error.message : "Digest failed", lease_expires_at: null }).eq("id", delivery.id);
    return Response.json({ error: error instanceof Error ? error.message : "Digest failed" }, { status: 502 });
  }
}
