import { createHash } from "node:crypto";
import { z } from "zod";
import { buildDashboardData } from "@/lib/market";
import { ingestDocument } from "@/lib/rag/service";
import { fetchBlsSeries, fetchFredSeries, fetchWorldBankSeries } from "@/lib/sources/macro";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

const Schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("market"), assets: z.array(z.object({ symbol: z.string().regex(/^[A-Z.]{1,8}$/), kind: z.enum(["stock", "crypto"]) })).min(1).max(30) }),
  z.object({ kind: z.literal("macro"), provider: z.enum(["fred", "bls", "worldbank"]), series: z.string().min(1).max(80), country: z.string().max(8).optional() }),
]);

export async function POST(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.INTERNAL_API_SECRET || supplied !== process.env.INTERNAL_API_SECRET) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ownerId = process.env.SUPABASE_OWNER_ID;
  const admin = createSupabaseAdminClient();
  if (!ownerId || !admin) return Response.json({ error: "Supabase ingestion is not configured." }, { status: 503 });
  try {
    const body = Schema.parse(await request.json());
    if (body.kind === "macro") {
      const series = body.provider === "fred" ? await fetchFredSeries(body.series) : body.provider === "bls" ? await fetchBlsSeries(body.series) : await fetchWorldBankSeries(body.series, body.country);
      const text = `${series.label}\n\n${series.observations.map((item) => `${item.date}: ${item.value ?? "not available"}`).join("\n")}`;
      return Response.json({ kind: "macro", result: await ingestDocument({ ownerId, title: `${series.label} (${series.provider})`, text, sourceType: "macro", sourceUrl: series.sourceUrl, publisher: series.provider, publishedAt: series.fetchedAt, metadata: { provider: series.provider, series: series.series, fetchedAt: series.fetchedAt } }) });
    }

    const dashboard = await buildDashboardData(body.assets.map((item) => `${item.kind}:${item.symbol}`).join(","));
    const assetRows = dashboard.assets.map((asset) => ({ owner_id: ownerId, symbol: asset.symbol, name: asset.name, kind: asset.kind }));
    if (assetRows.length) {
      const { error } = await admin.from("assets").upsert(assetRows, { onConflict: "owner_id,kind,symbol" });
      if (error) throw error;
    }
    const { data: storedAssets, error: assetError } = await admin.from("assets").select("id,symbol,kind").eq("owner_id", ownerId);
    if (assetError) throw assetError;
    const assetIds = new Map((storedAssets ?? []).map((asset) => [`${asset.kind}:${asset.symbol}`, asset.id]));
    const quoteRows = dashboard.assets.map((asset) => ({ owner_id: ownerId, asset_id: assetIds.get(`${asset.kind}:${asset.symbol}`), provider: asset.provenance.provider, price: asset.price, change_percent: asset.change24h, exchange_coverage: asset.provenance.exchangeCoverage, as_of: asset.provenance.asOf, received_at: asset.provenance.receivedAt, is_delayed: asset.provenance.isDelayed, raw: { sourceUrl: asset.provenance.sourceUrl, freshness: asset.provenance.freshness, disclaimer: asset.provenance.disclaimer } }));
    const barRows = dashboard.assets.flatMap((asset) => asset.history.map((point) => ({ owner_id: ownerId, asset_id: assetIds.get(`${asset.kind}:${asset.symbol}`), provider: asset.provenance.provider, interval: "1d", bucket_at: point.date, close: point.value })));
    const newsRows = dashboard.news.map((item) => ({ owner_id: ownerId, asset_id: assetIds.get(`${item.category}:${item.ticker}`) ?? null, content_hash: createHash("sha256").update(item.url).digest("hex"), title: item.title, url: item.url, publisher: item.source, published_at: item.publishedAt }));
    const [quotes, bars, news, providers] = await Promise.all([
      quoteRows.length ? admin.from("market_quotes").upsert(quoteRows, { onConflict: "owner_id,asset_id,provider" }) : Promise.resolve({ error: null }),
      barRows.length ? admin.from("market_bars").upsert(barRows, { onConflict: "owner_id,asset_id,provider,interval,bucket_at", ignoreDuplicates: true }) : Promise.resolve({ error: null }),
      newsRows.length ? admin.from("news_items").upsert(newsRows, { onConflict: "owner_id,content_hash", ignoreDuplicates: true }) : Promise.resolve({ error: null }),
      Promise.all(dashboard.providerHealth.map((provider) => admin.from("provider_health").upsert({ owner_id: ownerId, provider: provider.provider, status: provider.status, latency_ms: provider.latencyMs, last_success_at: provider.status === "healthy" ? provider.checkedAt : null, last_error_at: provider.status === "offline" ? provider.checkedAt : null, error_message: provider.message, checked_at: provider.checkedAt }, { onConflict: "owner_id,provider" }))),
    ]);
    const error = quotes.error ?? bars.error ?? news.error ?? providers.find((result) => result.error)?.error;
    if (error) throw error;
    const indexed = [];
    for (const item of dashboard.news.slice(0, 12)) {
      indexed.push(await ingestDocument({ ownerId, title: item.title, text: `${item.title}\n\nPublisher: ${item.source}. Published: ${item.publishedAt}.`, sourceType: "news", sourceUrl: item.url, publisher: item.source, publishedAt: item.publishedAt, assetId: assetIds.get(`${item.category}:${item.ticker}`), metadata: { symbol: item.ticker } }));
    }
    await admin.rpc("prune_expired_data", { p_owner_id: ownerId });
    return Response.json({ kind: "market", assets: dashboard.assets.length, quotes: quoteRows.length, bars: barRows.length, news: newsRows.length, indexedNews: indexed.length, warnings: dashboard.warnings });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid ingestion request" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Ingestion failed" }, { status: 502 });
  }
}
