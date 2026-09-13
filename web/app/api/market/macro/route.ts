import { z } from "zod";
import { fetchBlsSeries, fetchFredSeries, fetchWorldBankSeries } from "@/lib/sources/macro";

const QuerySchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("fred"), series: z.enum(["UNRATE", "FEDFUNDS"]) }),
  z.object({ provider: z.literal("bls"), series: z.literal("CUUR0000SA0") }),
  z.object({ provider: z.literal("worldbank"), series: z.literal("NY.GDP.MKTP.CD"), country: z.literal("WLD").default("WLD") }),
]);

const BLS_FRED_FALLBACKS: Record<string, string> = {
  CUUR0000SA0: "CPIAUCNS",
};

async function fetchBlsWithFallback(series: string) {
  try {
    return await fetchBlsSeries(series);
  } catch (error) {
    const fallbackSeries = BLS_FRED_FALLBACKS[series];
    if (!fallbackSeries || !process.env.FRED_API_KEY) throw error;
    const fallback = await fetchFredSeries(fallbackSeries);
    return { ...fallback, series, label: "US CPI", warning: `BLS was unavailable; showing the equivalent FRED ${fallbackSeries} series.` };
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = QuerySchema.parse(Object.fromEntries(url.searchParams));
    const result = parsed.provider === "fred" ? await fetchFredSeries(parsed.series)
      : parsed.provider === "bls" ? await fetchBlsWithFallback(parsed.series)
      : await fetchWorldBankSeries(parsed.series, parsed.country);
    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid macro-series request", detail: error.issues }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Macro provider failed" }, { status: 502 });
  }
}
