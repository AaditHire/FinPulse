import "server-only";

import { runResearchAgent } from "@/lib/agents/runtime";
import { sendAlertEmail } from "@/lib/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Holding } from "@/lib/types";

const DIGEST_QUERY = "Create today's concise, cited research digest for my portfolio. Cover material price moves, catalysts, cross-asset risks, and evidence limitations. Do not provide trades or executable recommendations.";

export async function buildAndSendResearchDigest(input: { ownerId: string; recipient: string; apiKey: string }) {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Supabase is required for digest delivery.");

  const { data: rows, error } = await admin
    .from("portfolio_holdings")
    .select("quantity,assets!inner(symbol,kind)")
    .eq("owner_id", input.ownerId);
  if (error) throw error;

  const holdings: Holding[] = (rows ?? []).map((row) => {
    const asset = Array.isArray(row.assets) ? row.assets[0] : row.assets;
    return { symbol: asset.symbol, kind: asset.kind, quantity: Number(row.quantity) };
  });
  const answer = await runResearchAgent({ ownerId: input.ownerId, query: DIGEST_QUERY, holdings, apiKey: input.apiKey, workload: "scheduled" });
  const citations = answer.citations.map((citation, index) => `[${index + 1}] ${citation.title} — ${citation.sourceUrl ?? "source unavailable"}`).join("\n");
  const body = `${answer.answer}\n\n${citations}\n\nLimitation: ${answer.limitation ?? "Provider coverage is shown in FinPulse."}\n\nResearch only. No order was created, simulated, or recommended.`;

  await sendAlertEmail("FinPulse daily research digest", body, input.recipient);
  return { runId: answer.runId, status: answer.status, citations: answer.citations.length };
}
