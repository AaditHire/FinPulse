import { NextRequest, NextResponse } from "next/server";
import { buildDashboardData } from "@/lib/market";
import { modelLabel, selectGroqModel } from "@/lib/groq";
import type { AgentAnalysis, Holding } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-groq-api-key")?.trim() || process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ code: "GROQ_NOT_CONFIGURED", error: "Add GROQ_API_KEY to web/.env.local and restart the dashboard." }, { status: 503 });
  }
  try {
    const body = await request.json() as { holdings?: Holding[] };
    const model = await selectGroqModel(apiKey);
    const holdings = (body.holdings ?? []).filter((item) => Number.isFinite(item.quantity) && item.quantity >= 0);
    const dashboard = await buildDashboardData(holdings);
    const context = {
      portfolio: dashboard.assets.map((asset) => ({
        symbol: asset.symbol,
        price: asset.price,
        change24h: Number(asset.change24h.toFixed(2)),
        quantity: holdings.find((item) => item.symbol === asset.symbol)?.quantity ?? 0,
      })),
      headlines: dashboard.news.slice(0, 18).map((item) => ({ ticker: item.ticker, source: item.source, title: item.title, publishedAt: item.publishedAt })),
      dataWarnings: dashboard.warnings,
    };
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are FinPulse, a cautious personal market-intelligence agent. Analyze only the supplied live prices and headlines. Identify portfolio-level risk, catalysts and actionable monitoring priorities, never trade instructions. Return valid JSON: {overview:string,riskLevel:'Low'|'Moderate'|'High',opportunity:string,confidence:number,actions:string[3],assetViews:[{symbol:string,outlook:'bullish'|'neutral'|'bearish',catalyst:string}]}. Confidence must be 0-100. Mention data limitations plainly.",
          },
          { role: "user", content: JSON.stringify(context) },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      const problem = await response.json().catch(() => null) as { error?: { message?: string } } | null;
      throw new Error(problem?.error?.message ? `Groq: ${problem.error.message}` : `Groq request failed (${response.status}).`);
    }
    const payload = await response.json() as { choices: Array<{ message: { content: string } }> };
    const parsed = JSON.parse(payload.choices[0].message.content) as Omit<AgentAnalysis, "analyzedAt" | "sourcesRead">;
    const analysis: AgentAnalysis = {
      ...parsed,
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      analyzedAt: new Date().toISOString(),
      sourcesRead: dashboard.news.length,
      model: modelLabel(model),
    };
    return NextResponse.json({ analysis, warnings: dashboard.warnings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent run failed" }, { status: 502 });
  }
}
