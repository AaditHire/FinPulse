import { XMLParser } from "fast-xml-parser";
import "server-only";

import { createHash } from "node:crypto";
import type { DashboardPayload, MarketAsset, NewsItem } from "./types";

const CRYPTO: Record<string, { id: string; name: string }> = {
  BTC: { id: "bitcoin", name: "Bitcoin" },
  ETH: { id: "ethereum", name: "Ethereum" },
  SOL: { id: "solana", name: "Solana" },
  XRP: { id: "ripple", name: "XRP" },
  BNB: { id: "binancecoin", name: "BNB" },
  ADA: { id: "cardano", name: "Cardano" },
  DOGE: { id: "dogecoin", name: "Dogecoin" },
  AVAX: { id: "avalanche-2", name: "Avalanche" },
  LINK: { id: "chainlink", name: "Chainlink" },
  DOT: { id: "polkadot", name: "Polkadot" },
  LTC: { id: "litecoin", name: "Litecoin" },
  BCH: { id: "bitcoin-cash", name: "Bitcoin Cash" },
  SUI: { id: "sui", name: "Sui" },
};

const STOCK_NAMES: Record<string, string> = {
  AAPL: "Apple", MSFT: "Microsoft", NVDA: "NVIDIA", TSLA: "Tesla",
  AMZN: "Amazon", GOOGL: "Alphabet", META: "Meta", AMD: "AMD",
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export function sanitizeSymbols(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  return [...new Set(raw.map((item) => String(item).trim().toUpperCase()).filter((item) => /^[A-Z.]{1,8}$/.test(item)))].slice(0, 10);
}

type AssetRequest = { symbol: string; kind: "crypto" | "stock" };

export function parseAssetRequests(value: unknown): AssetRequest[] {
  const raw = Array.isArray(value) ? value : String(value ?? "").split(",");
  const requests = raw.flatMap((item) => {
    if (typeof item === "object" && item && "symbol" in item) {
      const candidate = item as { symbol: unknown; kind?: unknown };
      const symbol = String(candidate.symbol).trim().toUpperCase();
      if (!/^[A-Z.]{1,8}$/.test(symbol)) return [];
      return [{ symbol, kind: candidate.kind === "crypto" ? "crypto" as const : "stock" as const }];
    }
    const [kindPart, symbolPart] = String(item).includes(":") ? String(item).split(":", 2) : ["", String(item)];
    const symbol = symbolPart.trim().toUpperCase();
    if (!/^[A-Z.]{1,8}$/.test(symbol)) return [];
    return [{ symbol, kind: kindPart === "crypto" || (!kindPart && symbol in CRYPTO) ? "crypto" as const : "stock" as const }];
  });
  return [...new Map(requests.map((item) => [`${item.kind}:${item.symbol}`, item])).values()].slice(0, 12);
}

async function fetchWithTimeout(url: string, timeoutMs = 10_000): Promise<Response> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "FinPulse/2.0 (personal market dashboard)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`${response.status} from ${new URL(url).hostname}`);
  return response;
}

async function fetchCryptoAssets(symbols: string[]): Promise<MarketAsset[]> {
  if (!symbols.length) return [];
  try {
    const ids = symbols.map((symbol) => CRYPTO[symbol].id);
    const pricesUrl = new URL("https://api.coingecko.com/api/v3/simple/price");
    pricesUrl.searchParams.set("ids", ids.join(","));
    pricesUrl.searchParams.set("vs_currencies", "usd");
    pricesUrl.searchParams.set("include_24hr_change", "true");
    const prices = await (await fetchWithTimeout(pricesUrl.toString())).json() as Record<string, { usd: number; usd_24h_change?: number }>;
    return await Promise.all(symbols.map(async (symbol) => {
      const config = CRYPTO[symbol];
      const historyUrl = `https://api.coingecko.com/api/v3/coins/${config.id}/market_chart?vs_currency=usd&days=30&interval=daily`;
      const historyPayload = await (await fetchWithTimeout(historyUrl)).json() as { prices: Array<[number, number]> };
      return {
        symbol, name: config.name, kind: "crypto" as const,
        price: Number(prices[config.id]?.usd ?? historyPayload.prices.at(-1)?.[1] ?? 0),
        change24h: Number(prices[config.id]?.usd_24h_change ?? 0),
        history: historyPayload.prices.map(([timestamp, value]) => ({ date: new Date(timestamp).toISOString(), value: Number(value) })),
      };
    }));
  } catch {
    return Promise.all(symbols.map(async (symbol) => {
      const fallback = await fetchStockAsset(`${symbol}-USD`);
      return { ...fallback, symbol, name: CRYPTO[symbol].name, kind: "crypto" as const };
    }));
  }
}

async function fetchStockAsset(symbol: string): Promise<MarketAsset> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d&includePrePost=false`;
  const payload = await (await fetchWithTimeout(url)).json() as {
    chart: { result: Array<{ timestamp: number[]; meta: { regularMarketPrice?: number; chartPreviousClose?: number; shortName?: string }; indicators: { quote: Array<{ close: Array<number | null> }> } }> | null; error: unknown };
  };
  const result = payload.chart.result?.[0];
  if (!result) throw new Error(`No quote data for ${symbol}`);
  const history = result.timestamp.flatMap((timestamp, index) => {
    const value = result.indicators.quote[0]?.close[index];
    return value == null ? [] : [{ date: new Date(timestamp * 1000).toISOString(), value: Number(value) }];
  });
  const price = Number(result.meta.regularMarketPrice ?? history.at(-1)?.value ?? 0);
  const previous = Number(result.meta.chartPreviousClose ?? history.at(-2)?.value ?? price);
  return {
    symbol,
    name: result.meta.shortName || STOCK_NAMES[symbol] || symbol,
    kind: "stock",
    price,
    change24h: previous ? ((price - previous) / previous) * 100 : 0,
    history,
  };
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "#text" in value) return String((value as { "#text": unknown })["#text"]);
  return String(value ?? "");
}

function feedItems(xml: string): Array<Record<string, unknown>> {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const rss = parsed.rss as { channel?: { item?: unknown } } | undefined;
  const atom = parsed.feed as { entry?: unknown } | undefined;
  const raw = rss?.channel?.item ?? atom?.entry ?? [];
  const items: unknown[] = Array.isArray(raw) ? raw : [raw];
  return items.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}

async function fetchFeed(url: string, source: string, ticker: string, category: "crypto" | "stock"): Promise<NewsItem[]> {
  const xml = await (await fetchWithTimeout(url)).text();
  return feedItems(xml).flatMap((item) => {
    const title = textValue(item.title).trim();
    const rawLink = item.link;
    const link = typeof rawLink === "object" && rawLink ? String((rawLink as Record<string, unknown>)["@_href"] ?? "") : textValue(rawLink);
    if (!title || !link) return [];
    const published = textValue(item.pubDate ?? item.published ?? item.updated);
    return [{
      id: createHash("sha256").update(`${ticker}:${link}:${title}`).digest("hex").slice(0, 20),
      title,
      url: link,
      source,
      publishedAt: Number.isNaN(Date.parse(published)) ? new Date().toISOString() : new Date(published).toISOString(),
      ticker,
      category,
    }];
  });
}

async function fetchNews(requests: AssetRequest[]): Promise<{ news: NewsItem[]; warnings: string[] }> {
  const cryptoSymbols = requests.filter((item) => item.kind === "crypto").map((item) => item.symbol);
  const stockSymbols = requests.filter((item) => item.kind === "stock").map((item) => item.symbol);
  const tasks: Array<{ label: string; promise: Promise<NewsItem[]> }> = [];
  if (cryptoSymbols.length) {
    tasks.push(
      { label: "CoinDesk", promise: fetchFeed("https://www.coindesk.com/arc/outboundfeeds/rss/", "CoinDesk", "CRYPTO", "crypto") },
      { label: "Cointelegraph", promise: fetchFeed("https://cointelegraph.com/rss", "Cointelegraph", "CRYPTO", "crypto") },
    );
  }
  for (const symbol of stockSymbols) {
    const query = encodeURIComponent(`${symbol} stock`);
    tasks.push({ label: `Google News ${symbol}`, promise: fetchFeed(`https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`, "Google News", symbol, "stock") });
  }
  const settled = await Promise.allSettled(tasks.map((task) => task.promise));
  const warnings: string[] = [];
  const combined = settled.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value;
    warnings.push(`${tasks[index].label} unavailable`);
    return [];
  });
  const expanded = combined.map((item) => {
    if (item.ticker !== "CRYPTO") return item;
    const title = item.title.toLowerCase();
    const match = cryptoSymbols.find((symbol) => symbol === "BTC" ? /bitcoin|\bbtc\b/.test(title) : /ethereum|ether|\beth\b/.test(title));
    return { ...item, ticker: match ?? cryptoSymbols[0] };
  });
  const seen = new Set<string>();
  return {
    warnings,
    news: expanded.filter((item) => {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 90);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).slice(0, 30),
  };
}

export async function buildDashboardData(input: unknown): Promise<DashboardPayload> {
  const parsed = parseAssetRequests(input);
  const requested = parsed.length ? parsed : input == null ? [
    { symbol: "BTC", kind: "crypto" as const }, { symbol: "ETH", kind: "crypto" as const },
    { symbol: "AAPL", kind: "stock" as const }, { symbol: "MSFT", kind: "stock" as const },
  ] : [];
  const unsupportedCrypto = requested.filter((item) => item.kind === "crypto" && !(item.symbol in CRYPTO)).map((item) => item.symbol);
  const cryptoSymbols = requested.filter((item) => item.kind === "crypto" && item.symbol in CRYPTO).map((item) => item.symbol);
  const stockSymbols = requested.filter((item) => item.kind === "stock").map((item) => item.symbol);
  const warnings: string[] = [];
  const assets: MarketAsset[] = [];

  unsupportedCrypto.forEach((symbol) => warnings.push(`${symbol} crypto is not in the supported CoinGecko list`));

  const [cryptoResult, ...stockResults] = await Promise.allSettled([
    fetchCryptoAssets(cryptoSymbols),
    ...stockSymbols.map((symbol) => fetchStockAsset(symbol)),
  ]);
  if (cryptoResult.status === "fulfilled") assets.push(...cryptoResult.value);
  else if (cryptoSymbols.length) warnings.push("CoinGecko unavailable");
  stockResults.forEach((result, index) => {
    if (result.status === "fulfilled") assets.push(result.value);
    else warnings.push(`${stockSymbols[index]} quote unavailable`);
  });
  const newsResult = await fetchNews(requested);
  warnings.push(...newsResult.warnings);
  return { assets, news: newsResult.news, generatedAt: new Date().toISOString(), warnings };
}
