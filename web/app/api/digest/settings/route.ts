import { NextResponse } from "next/server";
import { readDigestSettings, writeDigestSettings, type DigestSettings } from "@/lib/digest-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const timezones = new Set(["Asia/Kolkata", "UTC", "America/Los_Angeles", "America/New_York", "Europe/London"]);

export async function GET() {
  return NextResponse.json({ settings: await readDigestSettings() });
}

export async function POST(request: Request) {
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
  return NextResponse.json({ settings, saved: true });
}
