import { NextResponse } from "next/server";
import { readDigestSettings, writeDigestSettings, type DigestSettings } from "@/lib/digest-settings";
import { requireOwner, authErrorResponse } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const timezones = new Set(["Asia/Kolkata", "UTC", "America/Los_Angeles", "America/New_York", "Europe/London"]);

export async function GET() {
  try {
    const principal = await requireOwner();
    const admin = createSupabaseAdminClient();
    if (admin && !principal.ownerId.startsWith("00000000-")) {
      const { data } = await admin.from("notification_preferences").select("recipient,delivery_time,timezone,digest_enabled").eq("owner_id", principal.ownerId).maybeSingle();
      if (data) return NextResponse.json({ settings: { recipient: data.recipient, deliveryTime: String(data.delivery_time).slice(0, 5), timezone: data.timezone, enabled: data.digest_enabled } });
    }
    return NextResponse.json({ settings: await readDigestSettings() });
  } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
  const principal = await requireOwner();
  const candidate = await request.json() as Partial<DigestSettings>;
  const recipient = String(candidate.recipient ?? "").trim().toLowerCase();
  const deliveryTime = String(candidate.deliveryTime ?? "");
  const timezone = String(candidate.timezone ?? "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    return NextResponse.json({ error: "Enter a valid recipient email address." }, { status: 400 });
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(deliveryTime)) {
    return NextResponse.json({ error: "Choose a valid delivery time." }, { status: 400 });
  }
  if (!timezones.has(timezone)) {
    return NextResponse.json({ error: "Choose a supported timezone." }, { status: 400 });
  }
  const settings: DigestSettings = { recipient, deliveryTime, timezone, enabled: Boolean(candidate.enabled) };
  await writeDigestSettings(settings);
  const admin = createSupabaseAdminClient();
  if (admin && !principal.ownerId.startsWith("00000000-")) {
    const existing = await admin.from("notification_preferences").select("digest_enabled,recipient,delivery_time,timezone").eq("owner_id", principal.ownerId).maybeSingle();
    const changed = !existing.data || existing.data.digest_enabled !== settings.enabled || existing.data.recipient !== settings.recipient || String(existing.data.delivery_time).slice(0, 5) !== settings.deliveryTime || existing.data.timezone !== settings.timezone;
    const { error } = await admin.from("notification_preferences").upsert({ owner_id: principal.ownerId, recipient, delivery_time: deliveryTime, timezone, digest_enabled: settings.enabled, approved_at: changed ? new Date().toISOString() : undefined, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  }
  return NextResponse.json({ settings, saved: true });
  } catch (error) { return authErrorResponse(error); }
}
