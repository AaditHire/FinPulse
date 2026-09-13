import { NextRequest, NextResponse } from "next/server";
import { buildMarketExplorerData, type ExplorerRange } from "@/lib/market";

export const dynamic = "force-dynamic";

const RANGES = new Set<ExplorerRange>(["5d", "1mo", "3mo", "6mo", "1y", "5y"]);

export async function GET(request: NextRequest) {
  try {
    const symbols = request.nextUrl.searchParams.get("symbols") ?? "";
    const requestedRange = request.nextUrl.searchParams.get("range") as ExplorerRange | null;
    const range = requestedRange && RANGES.has(requestedRange) ? requestedRange : "1mo";
    const includeFinancials = request.nextUrl.searchParams.get("financials") === "1";
    return NextResponse.json(await buildMarketExplorerData(symbols, range, includeFinancials));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Market explorer failed" }, { status: 502 });
  }
}
