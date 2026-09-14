import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runResearchAgent } from "@/lib/agents/runtime";
import { ANONYMOUS_OWNER_ID, anonymousRateLimit } from "@/lib/anonymous-access";
import type { AgentAnalysis, Holding } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const Schema = z.object({
  holdings: z.array(z.object({ symbol: z.string().regex(/^[A-Z0-9.=-]{1,16}$/), quantity: z.number().finite().min(0), kind: z.enum(["stock", "crypto"]) })).max(30).default([]),
});

function plainTextBrief(value: string) {
  return value
    .replace(/\*\*/g, "")
    .replace(/\s+-\s+/g, "\n• ")
    .replace(/\s+(\d+\.)\s+/g, "\n$1 ")
    .trim();
}

export async function POST(request: NextRequest) {
  const limited = anonymousRateLimit(request);
  if (limited) return limited;
  const apiKey = request.headers.get("x-groq-api-key")?.trim() || process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ code: "GROQ_NOT_CONFIGURED", error: "Add GROQ_API_KEY to web/.env.local and restart the dashboard." }, { status: 503 });
  }
  try {
    const body = Schema.parse(await request.json());
    const holdings: Holding[] = body.holdings;
    const result = await runResearchAgent({ ownerId: ANONYMOUS_OWNER_ID, query: "Summarize current portfolio risk, catalysts and monitoring priorities. Do not recommend trades.", holdings, apiKey, includePrivateResearch: false });
    const analysis: AgentAnalysis = {
      overview: plainTextBrief(result.answer),
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
    if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid portfolio" }, { status: 400 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Agent analysis failed" }, { status: 502 });
  }
}
