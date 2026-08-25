import "server-only";

export type ProviderSpec = { id: string; label: string; hosts: string[]; rateLimit: string; cacheTtlSeconds: number; fallback: string; coverage: string };

export const PROVIDERS: ProviderSpec[] = [
  { id: "coingecko", label: "CoinGecko", hosts: ["api.coingecko.com"], rateLimit: "configuration-driven public API", cacheTtlSeconds: 60, fallback: "Yahoo crypto chart", coverage: "aggregated crypto markets" },
  { id: "yahoo", label: "Yahoo Finance", hosts: ["query1.finance.yahoo.com"], rateLimit: "best effort / unofficial", cacheTtlSeconds: 60, fallback: "none", coverage: "unofficial consolidated-style chart" },
  { id: "alpaca", label: "Alpaca Basic", hosts: ["data.alpaca.markets"], rateLimit: "account plan", cacheTtlSeconds: 5, fallback: "Yahoo Finance", coverage: "live IEX single-exchange" },
  { id: "sec", label: "SEC EDGAR", hosts: ["www.sec.gov", "data.sec.gov"], rateLimit: "10 requests/second maximum", cacheTtlSeconds: 3600, fallback: "none; authoritative filings source", coverage: "US issuer submissions and archives" },
  { id: "fred", label: "FRED", hosts: ["api.stlouisfed.org"], rateLimit: "API-key policy", cacheTtlSeconds: 21600, fallback: "official alternate series", coverage: "US macro series" },
  { id: "bls", label: "BLS", hosts: ["api.bls.gov"], rateLimit: "public API policy", cacheTtlSeconds: 21600, fallback: "FRED series", coverage: "US labor and price statistics" },
  { id: "bea", label: "BEA", hosts: ["apps.bea.gov"], rateLimit: "API-key policy", cacheTtlSeconds: 86400, fallback: "World Bank/FRED", coverage: "US national accounts" },
  { id: "ecb", label: "ECB", hosts: ["data-api.ecb.europa.eu"], rateLimit: "public data API policy", cacheTtlSeconds: 21600, fallback: "none", coverage: "ECB dataflows" },
  { id: "worldbank", label: "World Bank", hosts: ["api.worldbank.org"], rateLimit: "public API policy", cacheTtlSeconds: 86400, fallback: "none", coverage: "global development indicators" },
  { id: "rss", label: "RSS and issuer feeds", hosts: ["www.coindesk.com", "cointelegraph.com", "news.google.com"], rateLimit: "one request/feed/refresh", cacheTtlSeconds: 300, fallback: "remaining healthy feeds", coverage: "public news and company IR feeds" },
];

const ALLOWED_HOSTS = new Set(PROVIDERS.flatMap((provider) => provider.hosts));

export function assertAllowedProviderUrl(value: string | URL) {
  const url = value instanceof URL ? value : new URL(value);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)) throw new Error(`Outbound provider host is not allowlisted: ${url.hostname}`);
  return url;
}
