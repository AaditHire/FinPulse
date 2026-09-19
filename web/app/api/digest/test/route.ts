import { NextResponse } from "next/server";
import { requireOwner, authErrorResponse } from "@/lib/auth";
import { buildAndSendResearchDigest } from "@/lib/digest";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  try {
    const principal = await requireOwner();
    const apiKey = process.env.GROQ_API_KEY;
    const admin = createSupabaseAdminClient();
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !apiKey || !admin) {
      return NextResponse.json({ error: "Email, Groq, and Supabase server credentials must be connected first." }, { status: 400 });
    }
    const { data: preference, error } = await admin
      .from("notification_preferences")
      .select("recipient")
      .eq("owner_id", principal.ownerId)
      .maybeSingle();
    if (error) throw error;
    const recipient = preference?.recipient ?? process.env.EMAIL_TO;
    if (!recipient) return NextResponse.json({ error: "Save a recipient email address first." }, { status: 400 });

    console.log("[api/digest/test] building digest", { ownerId: principal.ownerId });
    const result = await buildAndSendResearchDigest({ ownerId: principal.ownerId, recipient, apiKey });
    console.log("[api/digest/test] sent", { ownerId: principal.ownerId, runId: result.runId, citations: result.citations });
    return NextResponse.json({ sent: true, articleCount: result.citations });
  } catch (error) {
    console.error("[api/digest/test] failed", { error: error instanceof Error ? error.message : "Test digest failed" });
    const authResponse = authErrorResponse(error);
    if (authResponse.status !== 500) return authResponse;
    const message = error instanceof Error ? error.message : "Test digest failed.";
    return NextResponse.json({ error: message.replace(/gsk_[A-Za-z0-9_-]+/g, "[hidden]") }, { status: 502 });
  }
}
