import { NextRequest, NextResponse } from "next/server";
import { runResearchAgent } from "@/lib/agents/runtime";
import { requireOwner, authErrorResponse } from "@/lib/auth";
import type { AgentAnalysis, Holding } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-groq-api-key")?.trim() || process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ code: "GROQ_NOT_CONFIGURED", error: "Add GROQ_API_KEY to web/.env.local and restart the dashboard." }, { status: 503 });
  }
  try {
    const principal = await requireOwner();
    const body = await request.json() as { holdings?: Holding[] };
    const holdings = (body.holdings ?? []).filter((item) => Number.isFinite(item.quantity) && item.quantity >= 0);
    const result = await runResearchAgent({ ownerId: principal.ownerId, query: "Summarize current portfolio risk, catalysts and monitoring priorities. Do not recommend trades.", holdings, apiKey });
    const analysis: AgentAnalysis = {
      overview: result.answer,
      riskLevel: result.status === "evidence_only" ? "Moderate" : "Low",
      opportunity: result.citations[0]?.title ?? "Continue monitoring verified catalysts.",
      confidence: result.confidence,
      actions: ["Review cited evidence", "Monitor provider freshness", "Re-run after material market updates"],
      assetViews: holdings.map((holding) => ({ symbol: holding.symbol, outlook: "neutral" as const, catalyst: "See cited research evidence and live data coverage." })),
      analyzedAt: new Date().toISOString(),
      sourcesRead: result.citations.length,
      model: result.model,
    };
    return NextResponse.json({ analysis, citations: result.citations, warnings: result.limitation ? [result.limitation] : [] });
  } catch (error) {
    return authErrorResponse(error);
  }
}
