export type AssetKind = "crypto" | "stock";

export type HistoryPoint = {
  date: string;
  value: number;
};

export type DataProvenance = {
  provider: string;
  sourceUrl: string;
  asOf: string;
  receivedAt: string;
  freshness: "live" | "delayed" | "best-effort";
  exchangeCoverage: string;
  isDelayed: boolean;
  disclaimer: string;
};

export type MarketAsset = {
  symbol: string;
  name: string;
  kind: AssetKind;
  price: number;
  change24h: number;
  history: HistoryPoint[];
  provenance: DataProvenance;
};

export type NewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  ticker: string;
  category: AssetKind;
};

export type DashboardPayload = {
  assets: MarketAsset[];
  news: NewsItem[];
  generatedAt: string;
  warnings: string[];
  providerHealth: ProviderHealth[];
};

export type ProviderHealth = {
  provider: string;
  status: "healthy" | "degraded" | "offline" | "unconfigured";
  latencyMs?: number;
  checkedAt: string;
  message?: string;
};

export type Citation = {
  chunkId: string;
  documentId: string;
  title: string;
  sourceUrl?: string;
  publisher?: string;
  publishedAt?: string;
  heading?: string;
  excerpt: string;
  score: number;
};

export type ResearchAnswer = {
  runId: string;
  query: string;
  answer: string;
  citations: Citation[];
  status: "completed" | "evidence_only";
  specialist: "market" | "filings" | "macro" | "portfolio" | "research";
  model?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  limitation?: string;
};

export type Holding = {
  symbol: string;
  quantity: number;
  kind: AssetKind;
};

export type AgentAnalysis = {
  overview: string;
  riskLevel: "Low" | "Moderate" | "High";
  opportunity: string;
  confidence: number;
  actions: string[];
  assetViews: Array<{
    symbol: string;
    outlook: "bullish" | "neutral" | "bearish";
    catalyst: string;
  }>;
  analyzedAt: string;
  sourcesRead: number;
  model?: string;
};
