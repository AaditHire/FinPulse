import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import "server-only";

import type { AuthPrincipal } from "@/lib/auth";
import { runResearchAgent } from "@/lib/agents/runtime";
import { buildDashboardData } from "@/lib/market";
import { searchDocuments } from "@/lib/rag/service";
import { fetchBlsSeries, fetchFredSeries, fetchWorldBankSeries } from "@/lib/sources/macro";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }], structuredContent: value as Record<string, unknown> };
}

export function createFinPulseMcpServer(principal: AuthPrincipal) {
  const server = new McpServer({ name: "finpulse", version: "3.0.0" });

  if (principal.scopes.has("market:read")) {
    server.registerTool("market_get_quote", { description: "Get current research-only quotes with provider, freshness and exchange coverage.", inputSchema: z.object({ assets: z.array(z.object({ symbol: z.string(), kind: z.enum(["stock", "crypto"]) })).min(1).max(30) }) }, async ({ assets }) => {
      const payload = await buildDashboardData(assets.map((asset) => `${asset.kind}:${asset.symbol}`).join(","));
      return textResult({ assets: payload.assets, generatedAt: payload.generatedAt, warnings: payload.warnings });
    });
    server.registerTool("market_get_macro", { description: "Read a public macroeconomic series from FRED, BLS, or World Bank.", inputSchema: z.object({ provider: z.enum(["fred", "bls", "worldbank"]), series: z.string(), country: z.string().optional() }) }, async ({ provider, series, country }) => {
      const result = provider === "fred" ? await fetchFredSeries(series) : provider === "bls" ? await fetchBlsSeries(series) : await fetchWorldBankSeries(series, country);
      return textResult(result);
    });
    server.registerTool("market_provider_health", { description: "Inspect latest provider and database health.", inputSchema: z.object({}) }, async () => {
      const admin = createSupabaseAdminClient();
      if (!admin) return textResult({ configured: false, message: "Supabase is not configured." });
      const { data, error } = await admin.from("provider_health").select("provider,status,latency_ms,last_success_at,last_error_at,error_message,checked_at").eq("owner_id", principal.ownerId).order("provider");
      if (error) throw error;
      return textResult({ providers: data });
    });
  }

  if (principal.scopes.has("research:read")) {
    server.registerTool("research_search", { description: "Hybrid full-text and semantic search over the private FinPulse corpus. Returns exact evidence passages.", inputSchema: z.object({ query: z.string().min(2).max(600), count: z.number().int().min(1).max(6).default(6) }) }, async ({ query, count }) => textResult({ citations: await searchDocuments(principal.ownerId, query, count) }));
    server.registerTool("research_run", { description: "Run one bounded, cited, research-only FinPulse synthesis. Never places or recommends orders.", inputSchema: z.object({ query: z.string().min(3).max(1200), holdings: z.array(z.object({ symbol: z.string(), quantity: z.number().min(0), kind: z.enum(["stock", "crypto"]) })).max(30).default([]) }) }, async ({ query, holdings }) => {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) return textResult({ status: "evidence_only", query, citations: await searchDocuments(principal.ownerId, query, 6), limitation: "GROQ_API_KEY is not configured." });
      return textResult(await runResearchAgent({ ownerId: principal.ownerId, query, holdings, apiKey }));
    });
  }

  if (principal.scopes.has("portfolio:read")) {
    server.registerTool("portfolio_get_holdings", { description: "Read the authenticated owner's holdings. Research-only; no brokerage positions.", inputSchema: z.object({}) }, async () => {
      const admin = createSupabaseAdminClient();
      if (!admin) return textResult({ configured: false, holdings: [] });
      const { data, error } = await admin.from("portfolio_holdings").select("quantity,cost_basis,assets!inner(symbol,name,kind)").eq("owner_id", principal.ownerId);
      if (error) throw error;
      return textResult({ holdings: data });
    });
    server.registerTool("portfolio_risk", { description: "Calculate deterministic allocation concentration and daily portfolio movement from supplied holdings.", inputSchema: z.object({ holdings: z.array(z.object({ symbol: z.string(), quantity: z.number().min(0), kind: z.enum(["stock", "crypto"]) })).min(1).max(30) }) }, async ({ holdings }) => {
      const dashboard = await buildDashboardData(holdings.map((item) => `${item.kind}:${item.symbol}`).join(","));
      const values = dashboard.assets.map((asset) => ({ symbol: asset.symbol, value: asset.price * (holdings.find((holding) => holding.symbol === asset.symbol)?.quantity ?? 0), change24h: asset.change24h }));
      const total = values.reduce((sum, item) => sum + item.value, 0);
      return textResult({ total, concentration: values.map((item) => ({ ...item, weight: total ? item.value / total : 0 })), limitation: "Market-data coverage is provider-specific; this is research analytics, not investment advice." });
    });
  }

  if (principal.scopes.has("alerts:write")) {
    server.registerTool("alerts_preview", { description: "Validate and preview an alert rule. This tool never activates or sends the alert; UI approval is required.", inputSchema: z.object({ name: z.string().min(2).max(120), ruleType: z.enum(["price_above", "price_below", "change_percent", "keyword", "provider_health"]), configuration: z.record(z.string(), z.unknown()) }) }, async (rule) => textResult({ valid: true, status: "draft", requiresApproval: true, preview: rule }));
  }

  return server;
}
