import { runResearchAgent } from "@/lib/agents/runtime";
import { sendAlertEmail } from "@/lib/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Holding } from "@/lib/types";

export const maxDuration = 60;

function localClock(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

export async function POST(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || supplied !== process.env.CRON_SECRET) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (process.env.ENABLE_TS_DIGEST_SCHEDULER !== "true") return Response.json({ error: "TypeScript digest is disabled until the controlled Phase 5 cutover." }, { status: 409 });
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
    const { data: rows, error } = await admin.from("portfolio_holdings").select("quantity,assets!inner(symbol,kind)").eq("owner_id", ownerId); if (error) throw error;
    const holdings: Holding[] = (rows ?? []).map((row) => { const asset = Array.isArray(row.assets) ? row.assets[0] : row.assets; return { symbol: asset.symbol, kind: asset.kind, quantity: Number(row.quantity) }; });
    const answer = await runResearchAgent({ ownerId, query: "Create today's concise, cited research digest for my portfolio. Cover material price moves, catalysts, cross-asset risks, and evidence limitations. Do not provide trades or executable recommendations.", holdings, apiKey, workload: "scheduled" });
    const citations = answer.citations.map((citation, index) => `[${index + 1}] ${citation.title} — ${citation.sourceUrl ?? "source unavailable"}`).join("\n");
    await sendAlertEmail("FinPulse daily research digest", `${answer.answer}\n\n${citations}\n\nLimitation: ${answer.limitation ?? "Provider coverage is shown in FinPulse."}\n\nResearch only. No order was created, simulated, or recommended.`, preference.recipient);
    await admin.from("delivery_items").update({ status: "sent", sent_at: new Date().toISOString(), lease_expires_at: null }).eq("id", delivery.id);
    return Response.json({ sent: true, runId: answer.runId, status: answer.status, citations: answer.citations.length });
  } catch (error) {
    await admin.from("delivery_items").update({ status: "failed", error_message: error instanceof Error ? error.message : "Digest failed", lease_expires_at: null }).eq("id", delivery.id);
    return Response.json({ error: error instanceof Error ? error.message : "Digest failed" }, { status: 502 });
  }
}
