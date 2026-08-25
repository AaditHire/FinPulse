import { randomUUID } from "node:crypto";
import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Workload = "interactive" | "scheduled";
type LocalWindow = { minute: string; day: string; rpm: number; rpd: number; tpm: number; tpd: number };
const localWindows = new Map<string, LocalWindow>();
const localReservations = new Map<string, { key: string; estimatedTokens: number }>();

const DEFAULT_LIMITS = { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000, maxInput: 5800, maxOutput: 1200 };

function reserveLocal(modelId: string, workload: Workload, estimatedTokens: number) {
  const now = new Date();
  const minute = now.toISOString().slice(0, 16);
  const day = now.toISOString().slice(0, 10);
  const key = `${modelId}:${workload}`;
  const current = localWindows.get(key) ?? { minute, day, rpm: 0, rpd: 0, tpm: 0, tpd: 0 };
  if (current.minute !== minute) { current.minute = minute; current.rpm = 0; current.tpm = 0; }
  if (current.day !== day) { current.day = day; current.rpd = 0; current.tpd = 0; }
  const dailyAllocation = workload === "interactive" ? 0.6 : 0.2;
  const minuteUsage = [...localWindows.entries()].filter(([windowKey, window]) => windowKey.startsWith(`${modelId}:`) && window.minute === minute).reduce((usage, [, window]) => ({ rpm: usage.rpm + window.rpm, tpm: usage.tpm + window.tpm }), { rpm: 0, tpm: 0 });
  // Workload partitions protect the daily budget. Applying them to the model's
  // one-minute limits would reject an otherwise valid 7k-token request against
  // an 8k TPM model before it was ever sent.
  if (minuteUsage.rpm + 1 > DEFAULT_LIMITS.rpm || current.rpd + 1 > DEFAULT_LIMITS.rpd * dailyAllocation || minuteUsage.tpm + estimatedTokens > DEFAULT_LIMITS.tpm || current.tpd + estimatedTokens > DEFAULT_LIMITS.tpd * dailyAllocation) {
    throw new Error(`Groq ${modelId} ${workload} quota is reserved or exhausted.`);
  }
  current.rpm += 1; current.rpd += 1; current.tpm += estimatedTokens; current.tpd += estimatedTokens;
  localWindows.set(key, current);
  const eventId = `local:${randomUUID()}`;
  localReservations.set(eventId, { key, estimatedTokens });
  return eventId;
}

export async function reserveModelQuota(input: { ownerId: string; modelId: string; role: "router" | "synthesis" | "fallback"; workload: Workload; estimatedTokens: number; runId?: string }) {
  const admin = createSupabaseAdminClient();
  if (!admin || input.ownerId.startsWith("00000000-")) return reserveLocal(input.modelId, input.workload, input.estimatedTokens);
  const { error: policyError } = await admin.from("llm_model_policies").upsert({
    owner_id: input.ownerId, provider: "groq", model_id: input.modelId, role: input.role,
    rpm: DEFAULT_LIMITS.rpm, rpd: DEFAULT_LIMITS.rpd, tpm: DEFAULT_LIMITS.tpm, tpd: DEFAULT_LIMITS.tpd,
    max_input_tokens: DEFAULT_LIMITS.maxInput, max_output_tokens: DEFAULT_LIMITS.maxOutput, enabled: true,
  }, { onConflict: "owner_id,provider,model_id", ignoreDuplicates: true });
  if (policyError) throw policyError;
  const { data, error } = await admin.rpc("reserve_llm_quota", {
    p_owner_id: input.ownerId, p_provider: "groq", p_model_id: input.modelId,
    p_workload: input.workload, p_estimated_tokens: input.estimatedTokens, p_run_id: input.runId ?? null,
  });
  if (error) throw new Error(error.message.includes("quota exceeded") ? `Groq ${input.modelId} quota is reserved or exhausted.` : error.message);
  return String(data);
}

export async function reconcileModelQuota(input: { ownerId: string; eventId: string; inputTokens: number; outputTokens: number; status: "completed" | "failed" | "released"; metadata?: Record<string, unknown> }) {
  if (input.eventId.startsWith("local:")) {
    const reservation = localReservations.get(input.eventId);
    if (!reservation) return;
    const window = localWindows.get(reservation.key);
    const actual = Math.max(0, input.inputTokens + input.outputTokens);
    const difference = Math.max(0, reservation.estimatedTokens - actual);
    if (window) { window.tpm = Math.max(0, window.tpm - difference); window.tpd = Math.max(0, window.tpd - difference); }
    localReservations.delete(input.eventId);
    return;
  }
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  await admin.rpc("reconcile_llm_quota", {
    p_owner_id: input.ownerId, p_event_id: input.eventId, p_input_tokens: input.inputTokens,
    p_output_tokens: input.outputTokens, p_status: input.status, p_metadata: input.metadata ?? {},
  });
}
