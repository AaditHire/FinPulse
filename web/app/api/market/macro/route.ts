import { z } from "zod";
import { authErrorResponse, requireOwner } from "@/lib/auth";
import { fetchBeaDataset, fetchBlsSeries, fetchEcbSeries, fetchFredSeries, fetchWorldBankSeries } from "@/lib/sources/macro";

const QuerySchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("fred"), series: z.string().min(1).max(80) }),
  z.object({ provider: z.literal("bls"), series: z.string().min(1).max(80) }),
  z.object({ provider: z.literal("worldbank"), series: z.string().min(1).max(80), country: z.string().max(8).default("WLD") }),
  z.object({ provider: z.literal("ecb"), flow: z.string().min(1).max(40), key: z.string().min(1).max(120) }),
  z.object({ provider: z.literal("bea"), dataset: z.string().min(1).max(80), table: z.string().min(1).max(80) }),
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
    await requireOwner();
    const url = new URL(request.url);
    const parsed = QuerySchema.parse(Object.fromEntries(url.searchParams));
    const result = parsed.provider === "fred" ? await fetchFredSeries(parsed.series)
      : parsed.provider === "bls" ? await fetchBlsWithFallback(parsed.series)
      : parsed.provider === "worldbank" ? await fetchWorldBankSeries(parsed.series, parsed.country)
      : parsed.provider === "ecb" ? await fetchEcbSeries(parsed.flow, parsed.key)
      : await fetchBeaDataset(parsed.dataset, parsed.table);
    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Invalid macro-series request", detail: error.issues }, { status: 400 });
    return authErrorResponse(error);
  }
}
