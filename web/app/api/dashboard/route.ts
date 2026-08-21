import { NextRequest, NextResponse } from "next/server";
import { buildDashboardData } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const assets = request.nextUrl.searchParams.has("assets") ? request.nextUrl.searchParams.get("assets") ?? "" : null;
    return NextResponse.json(await buildDashboardData(assets));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Market data failed" }, { status: 502 });
  }
}
