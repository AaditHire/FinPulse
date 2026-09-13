"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Check, ChevronRight, CircleAlert, Database, LoaderCircle, Plus, RefreshCw, Search,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DashboardPayload, FinancialPeriod, Holding, MarketExplorerAsset, MarketExplorerPayload, NewsItem } from "@/lib/types";

const MARKET_SYMBOLS = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "AMD"];
const RANGE_OPTIONS = [
  ["5D", "5d"], ["1M", "1mo"], ["3M", "3mo"], ["6M", "6mo"], ["1Y", "1y"], ["5Y", "5y"],
] as const;

type ExplorerRange = (typeof RANGE_OPTIONS)[number][1];
type DetailTab = "overview" | "financials" | "news";

function currency(value: number | null | undefined, code = "USD", compact = false) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: code, maximumFractionDigits: compact ? 1 : 2,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

function compactNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(value);
}

function signedPercent(value: number) { return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`; }

function percentage(value: number, low: number | null, high: number | null) {
  if (low == null || high == null || high <= low) return 50;
  return Math.max(0, Math.min(100, (value - low) / (high - low) * 100));
}

export function MarketExplorer({ holdings, onAdd }: { holdings: Holding[]; onAdd: (asset: MarketExplorerAsset) => void }) {
  const [assets, setAssets] = useState<MarketExplorerAsset[]>([]);
  const [selected, setSelected] = useState<MarketExplorerAsset | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [query, setQuery] = useState("");
  const [range, setRange] = useState<ExplorerRange>("1mo");
  const [tab, setTab] = useState<DetailTab>("overview");
  const [financialMode, setFinancialMode] = useState<"quarterly" | "yearly">("quarterly");
  const [busy, setBusy] = useState(true);
  const [detailBusy, setDetailBusy] = useState(false);
  const [error, setError] = useState("");
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  const loadList = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/market/explorer?symbols=${MARKET_SYMBOLS.join(",")}`, { cache: "no-store" });
      const payload = await response.json() as MarketExplorerPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load market data.");
      setAssets(payload.assets);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load market data."); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void loadList(); }, [loadList]);

  const openAsset = useCallback(async (asset: MarketExplorerAsset) => {
    setSelected(asset); setRange("1mo"); setTab("overview"); setDetailBusy(true); setError(""); setNews([]);
    try {
      const [detailResponse, newsResponse] = await Promise.all([
        fetch(`/api/market/explorer?symbols=${asset.symbol}&range=1mo&financials=1`, { cache: "no-store" }),
        fetch(`/api/dashboard?assets=stock:${asset.symbol}`, { cache: "no-store" }),
      ]);
      const detailPayload = await detailResponse.json() as MarketExplorerPayload & { error?: string };
      const newsPayload = await newsResponse.json() as DashboardPayload & { error?: string };
      if (!detailResponse.ok || !detailPayload.assets[0]) throw new Error(detailPayload.error ?? `Could not load ${asset.symbol}.`);
      setSelected(detailPayload.assets[0]);
      if (newsResponse.ok) setNews(newsPayload.news ?? []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : `Could not load ${asset.symbol}.`); }
    finally { setDetailBusy(false); }
  }, []);

  useEffect(() => {
    if (busy || deepLinkHandled || !assets.length) return;
    setDeepLinkHandled(true);
    const requestedSymbol = new URLSearchParams(window.location.search).get("symbol")?.trim().toUpperCase();
    const requestedAsset = requestedSymbol ? assets.find((asset) => asset.symbol === requestedSymbol) : null;
    if (requestedAsset) void openAsset(requestedAsset);
  }, [assets, busy, deepLinkHandled, openAsset]);

  async function changeRange(nextRange: ExplorerRange) {
    if (!selected || nextRange === range) return;
    setRange(nextRange); setDetailBusy(true); setError("");
    try {
      const response = await fetch(`/api/market/explorer?symbols=${selected.symbol}&range=${nextRange}`, { cache: "no-store" });
      const payload = await response.json() as MarketExplorerPayload & { error?: string };
      if (!response.ok || !payload.assets[0]) throw new Error(payload.error ?? "Could not change chart range.");
      setSelected((current) => current ? { ...payload.assets[0], financials: current.financials } : payload.assets[0]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not change chart range."); }
    finally { setDetailBusy(false); }
  }

  const visibleAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? assets.filter((asset) => `${asset.symbol} ${asset.name}`.toLowerCase().includes(needle)) : assets;
  }, [assets, query]);
  const holdingSymbols = useMemo(() => new Set(holdings.map((holding) => holding.symbol)), [holdings]);

  if (selected) return <MarketDetail
    asset={selected} news={news} range={range} tab={tab} financialMode={financialMode}
    busy={detailBusy} error={error} inPortfolio={holdingSymbols.has(selected.symbol)}
    onBack={() => { setSelected(null); setError(""); }} onRange={changeRange} onTab={setTab}
    onFinancialMode={setFinancialMode} onAdd={() => onAdd(selected)}
  />;

  return <section className="market-workspace" aria-label="Market explorer">
    <header className="market-hero">
      <div><p>MARKET EXPLORER</p><h2>Discover stocks</h2><span>Live best-effort quotes, clean comparisons, and one-click portfolio tracking.</span></div>
      <label className="market-search"><Search size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search companies" aria-label="Search companies"/></label>
    </header>
    <div className="market-results-head"><p>Search results <b>{visibleAssets.length} stocks</b></p><button onClick={() => void loadList()} disabled={busy}><RefreshCw className={busy ? "spin" : ""} size={15}/>Refresh</button></div>
    {error ? <div className="market-error"><CircleAlert size={16}/>{error}</div> : null}
    <div className="market-table" aria-busy={busy}>
      <div className="market-table-head"><span>Company</span><span>Trend</span><span>Market price</span><span>Previous close</span><span>52W range</span><span aria-hidden="true"/></div>
      {visibleAssets.map((asset) => <MarketRow
        key={asset.symbol} asset={asset} inPortfolio={holdingSymbols.has(asset.symbol)}
        onOpen={() => void openAsset(asset)} onAdd={() => onAdd(asset)}
      />)}
      {busy && !assets.length ? <div className="market-empty"><LoaderCircle className="spin" size={22}/>Loading live stocks…</div> : null}
      {!busy && !visibleAssets.length ? <div className="market-empty">No companies match “{query}”.</div> : null}
    </div>
    <p className="market-disclaimer">Quotes are delayed or best-effort depending on the provider. FinPulse is research-only and does not place orders.</p>
  </section>;
}

function MarketRow({ asset, inPortfolio, onOpen, onAdd }: { asset: MarketExplorerAsset; inPortfolio: boolean; onOpen: () => void; onAdd: () => void }) {
  const code = asset.stats.currency;
  return <div className="market-row">
    <button className="market-row-open" onClick={onOpen} aria-label={`Open ${asset.name} details`}>
      <span className="market-company"><i>{asset.symbol.slice(0, 1)}</i><span><b>{asset.name}</b><small>{asset.symbol} · {asset.stats.exchange}</small></span></span>
      <span className="market-spark"><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 132, height: 42 }}><AreaChart data={asset.history.slice(-20)}><Area isAnimationActive={false} type="monotone" dataKey="value" stroke={asset.change24h >= 0 ? "#00a96d" : "#e4583e"} strokeWidth={2} fill="transparent"/></AreaChart></ResponsiveContainer></span>
      <span className="market-price"><b>{currency(asset.price, code)}</b><small className={asset.change24h >= 0 ? "positive" : "negative"}>{signedPercent(asset.change24h)}</small></span>
      <span>{currency(asset.stats.previousClose, code)}</span>
      <span>{currency(asset.stats.fiftyTwoWeekLow, code, true)} – {currency(asset.stats.fiftyTwoWeekHigh, code, true)}</span>
    </button>
    <button className={`market-add ${inPortfolio ? "added" : ""}`} onClick={onAdd} disabled={inPortfolio} aria-label={inPortfolio ? `${asset.symbol} is in portfolio` : `Add ${asset.symbol} to portfolio`}>{inPortfolio ? <Check size={17}/> : <Plus size={18}/>}</button>
  </div>;
}

function MarketDetail({ asset, news, range, tab, financialMode, busy, error, inPortfolio, onBack, onRange, onTab, onFinancialMode, onAdd }: {
  asset: MarketExplorerAsset; news: NewsItem[]; range: ExplorerRange; tab: DetailTab; financialMode: "quarterly" | "yearly";
  busy: boolean; error: string; inPortfolio: boolean; onBack: () => void; onRange: (range: ExplorerRange) => Promise<void>;
  onTab: (tab: DetailTab) => void; onFinancialMode: (mode: "quarterly" | "yearly") => void; onAdd: () => void;
}) {
  const change = asset.change24h;
  const chartData = asset.history.map((point) => ({ date: new Date(point.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: range === "5y" ? "2-digit" : undefined }), value: point.value }));
  const financials = useMemo(() => financialMode === "quarterly" ? asset.financials ?? [] : yearlyFinancials(asset.financials ?? []), [asset.financials, financialMode]);
  return <section className="market-workspace market-detail" aria-label={`${asset.name} details`}>
    <button className="market-back" onClick={onBack}><ArrowLeft size={16}/>All stocks</button>
    <header className="security-head">
      <div className="security-identity"><i>{asset.symbol.slice(0, 1)}</i><div><p>{asset.symbol} · {asset.stats.exchange}</p><h2>{asset.name}</h2><span>{asset.provenance.provider} · {asset.provenance.freshness} data</span></div></div>
      <div className="security-quote"><strong>{currency(asset.price, asset.stats.currency)}</strong><span className={change >= 0 ? "positive" : "negative"}>{signedPercent(change)} today</span></div>
      <button className={`security-add ${inPortfolio ? "added" : ""}`} onClick={onAdd} disabled={inPortfolio}>{inPortfolio ? <><Check size={16}/>In portfolio</> : <><Plus size={16}/>Add to portfolio</>}</button>
    </header>
    {error ? <div className="market-error"><CircleAlert size={16}/>{error}</div> : null}
    <article className="security-chart-card">
      <div className="security-chart" aria-busy={busy}>{busy ? <div className="chart-loading"><LoaderCircle className="spin" size={22}/>Updating chart…</div> : <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 960, height: 350 }}><AreaChart data={chartData} margin={{ top: 12, right: 10, bottom: 0, left: 0 }}><defs><linearGradient id="marketDetailFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={change >= 0 ? "#00a96d" : "#e4583e"} stopOpacity=".17"/><stop offset="100%" stopColor={change >= 0 ? "#00a96d" : "#e4583e"} stopOpacity="0"/></linearGradient></defs><CartesianGrid vertical={false} stroke="#e2e7ef" strokeDasharray="4 4"/><XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={45} tick={{ fill: "#7b8495", fontSize: 10 }} dy={10}/><YAxis hide domain={["dataMin", "dataMax"]}/><Tooltip formatter={(value) => [currency(Number(value), asset.stats.currency), asset.symbol]} contentStyle={{ border: "1px solid #d9e0eb", borderRadius: 10, boxShadow: "0 12px 34px rgba(20,35,60,.12)" }}/><Area isAnimationActive={false} type="monotone" dataKey="value" stroke={change >= 0 ? "#00a96d" : "#e4583e"} strokeWidth={2.7} fill="url(#marketDetailFill)"/></AreaChart></ResponsiveContainer>}</div>
      <div className="detail-ranges">{RANGE_OPTIONS.map(([label, value]) => <button key={value} className={range === value ? "active" : ""} onClick={() => void onRange(value)} disabled={busy}>{label}</button>)}</div>
    </article>
    <nav className="detail-tabs" aria-label="Security details">{(["overview", "financials", "news"] as const).map((value) => <button key={value} className={tab === value ? "active" : ""} onClick={() => onTab(value)}>{value === "financials" ? "Financial performance" : value[0].toUpperCase() + value.slice(1)}</button>)}</nav>
    {tab === "overview" ? <Overview asset={asset}/> : null}
    {tab === "financials" ? <Financials asset={asset} data={financials} mode={financialMode} onMode={onFinancialMode}/> : null}
    {tab === "news" ? <SecurityNews news={news} symbol={asset.symbol}/> : null}
  </section>;
}

function Overview({ asset }: { asset: MarketExplorerAsset }) {
  const { stats } = asset;
  const dayPosition = percentage(asset.price, stats.dayLow, stats.dayHigh);
  const yearPosition = percentage(asset.price, stats.fiftyTwoWeekLow, stats.fiftyTwoWeekHigh);
  return <div className="detail-section-stack">
    <section className="detail-section"><div className="detail-section-title"><h3>Market depth</h3><span>Provider coverage</span></div><div className="depth-unavailable"><Database size={24}/><div><b>Exchange order book is not available</b><span>{asset.provenance.provider} supplies consolidated price history, not live bid/ask depth. FinPulse keeps this state explicit rather than showing simulated orders.</span></div></div></section>
    <section className="detail-section"><div className="detail-section-title"><h3>Performance</h3><span>As of {new Date(asset.provenance.asOf).toLocaleString()}</span></div><RangeMetric label="Today" low={stats.dayLow} high={stats.dayHigh} position={dayPosition} currencyCode={stats.currency}/><RangeMetric label="52 week" low={stats.fiftyTwoWeekLow} high={stats.fiftyTwoWeekHigh} position={yearPosition} currencyCode={stats.currency}/><div className="performance-grid"><Metric label="Open price" value={currency(stats.open, stats.currency)}/><Metric label="Previous close" value={currency(stats.previousClose, stats.currency)}/><Metric label="Live volume" value={compactNumber(stats.volume)}/><Metric label="Exchange" value={stats.exchange}/><Metric label="Coverage" value={asset.provenance.isDelayed ? "Delayed / best effort" : "Live"}/></div></section>
  </div>;
}

function RangeMetric({ label, low, high, position, currencyCode }: { label: string; low: number | null; high: number | null; position: number; currencyCode: string }) {
  return <div className="range-metric"><div><span>{label} low</span><b>{currency(low, currencyCode)}</b></div><div className="range-meter"><span style={{ left: `${position}%` }}/></div><div><span>{label} high</span><b>{currency(high, currencyCode)}</b></div></div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><b>{value}</b></div>; }

function yearlyFinancials(periods: FinancialPeriod[]): FinancialPeriod[] {
  const years = new Map<string, FinancialPeriod>();
  for (const period of periods) {
    const year = period.date.slice(0, 4);
    const current = years.get(year) ?? { date: year, revenue: 0, profit: 0, currency: period.currency };
    current.revenue = (current.revenue ?? 0) + (period.revenue ?? 0);
    current.profit = (current.profit ?? 0) + (period.profit ?? 0);
    years.set(year, current);
  }
  return [...years.values()];
}

function growth(values: Array<number | null>) {
  const usable = values.filter((value): value is number => value != null && value > 0);
  if (usable.length < 2) return null;
  return (usable.at(-1)! / usable[0] - 1) * 100;
}

function Financials({ asset, data, mode, onMode }: { asset: MarketExplorerAsset; data: FinancialPeriod[]; mode: "quarterly" | "yearly"; onMode: (mode: "quarterly" | "yearly") => void }) {
  const revenueGrowth = growth(data.map((period) => period.revenue));
  const profitGrowth = growth(data.map((period) => period.profit));
  const latest = data.at(-1);
  const chartData = data.map((period) => ({ label: new Date(period.date.length === 4 ? `${period.date}-12-31` : period.date).toLocaleDateString("en-US", { month: period.date.length === 4 ? undefined : "short", year: "2-digit" }), revenue: period.revenue, profit: period.profit }));
  return <section className="detail-section financial-section"><div className="detail-section-title"><h3>Financial performance</h3><span>{asset.symbol} · {latest?.currency ?? asset.stats.currency}</span></div><div className="financial-toolbar"><div><button className={mode === "quarterly" ? "active" : ""} onClick={() => onMode("quarterly")}>Quarterly</button><button className={mode === "yearly" ? "active" : ""} onClick={() => onMode("yearly")}>Yearly</button></div>{latest ? <span>Latest period · {latest.date}</span> : null}</div>{data.length ? <><div className="financial-legend"><span><i className="revenue"/>Revenue <b>{currency(latest?.revenue, latest?.currency, true)}</b></span><span><i className="profit"/>Profit <b>{currency(latest?.profit, latest?.currency, true)}</b></span></div><div className="financial-chart"><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 960, height: 310 }}><BarChart data={chartData} barGap={6}><CartesianGrid vertical={false} stroke="#e2e7ef" strokeDasharray="4 4"/><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "#69758a", fontSize: 10 }} dy={9}/><YAxis hide/><Tooltip formatter={(value) => currency(Number(value), latest?.currency, true)} contentStyle={{ border: "1px solid #d9e0eb", borderRadius: 10 }}/><Bar dataKey="revenue" fill="#8a98ad" radius={[5,5,0,0]}/><Bar dataKey="profit" fill="#31b889" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></div><div className="growth-grid"><Metric label={`${mode === "quarterly" ? "Period" : "Annual"} revenue growth`} value={revenueGrowth == null ? "—" : signedPercent(revenueGrowth)}/><Metric label={`${mode === "quarterly" ? "Period" : "Annual"} profit growth`} value={profitGrowth == null ? "—" : signedPercent(profitGrowth)}/></div></> : <div className="market-empty">Financial history is unavailable from the current public source.</div>}</section>;
}

function SecurityNews({ news, symbol }: { news: NewsItem[]; symbol: string }) {
  return <section className="detail-section"><div className="detail-section-title"><h3>Latest news</h3><span>{news.length} stories for {symbol}</span></div><div className="security-news">{news.slice(0, 10).map((item) => <a href={item.url} target="_blank" rel="noreferrer" key={item.id}><span>{item.source}</span><b>{item.title}</b><small>{new Date(item.publishedAt).toLocaleString()}</small><ChevronRight size={17}/></a>)}{!news.length ? <div className="market-empty">No current stories were returned for {symbol}.</div> : null}</div></section>;
}
