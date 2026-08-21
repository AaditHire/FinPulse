export type AssetKind = "crypto" | "stock";

export type HistoryPoint = {
  date: string;
  value: number;
};

export type MarketAsset = {
  symbol: string;
  name: string;
  kind: AssetKind;
  price: number;
  change24h: number;
  history: HistoryPoint[];
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
