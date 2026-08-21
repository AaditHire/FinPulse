"use client";

import {
  Activity, AlertCircle, Bell, Bot, ChartNoAxesCombined, Check, ChevronRight,
  CircleGauge, Clock3, ExternalLink, LayoutDashboard, LoaderCircle, Mail, Newspaper, Plus,
  RefreshCw, Save, Search, Send, Settings2, Sparkles, Trash2, WalletCards, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { AgentAnalysis, DashboardPayload, Holding, MarketAsset, NewsItem } from "@/lib/types";

const DEFAULT_HOLDINGS: Holding[] = [
  { symbol: "BTC", quantity: 0.08, kind: "crypto" },
  { symbol: "ETH", quantity: 1.5, kind: "crypto" },
  { symbol: "AAPL", quantity: 12, kind: "stock" },
  { symbol: "MSFT", quantity: 6, kind: "stock" },
];

const CRYPTO_SYMBOLS = ["BTC", "ETH", "SOL", "XRP", "BNB", "ADA", "DOGE", "AVAX", "LINK", "DOT", "LTC", "BCH", "SUI"];

type IntegrationState = { marketData: boolean; newsFeeds: boolean; groq: boolean; email: boolean };
type FeedFilter = "all" | "crypto" | "stock";

function money(value: number, compact = false) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: compact && value >= 1000 ? 0 : 2,
    notation: compact && value >= 1_000_000 ? "compact" : "standard",
  }).format(value);
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function relativeTime(value: string) {
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function portfolioHistory(assets: MarketAsset[], holdings: Holding[]) {
  const usable = assets.filter((asset) => asset.history.length > 1);
  const length = Math.max(0, ...usable.map((asset) => asset.history.length));
  if (!length) return [];
  return Array.from({ length }, (_, index) => {
    let date = new Date().toISOString();
    const value = usable.reduce((total, asset) => {
      const pointIndex = Math.min(asset.history.length - 1, Math.round(index * (asset.history.length - 1) / Math.max(1, length - 1)));
      const point = asset.history[pointIndex];
      if (asset.history.length === length) date = point.date;
      const quantity = holdings.find((holding) => holding.symbol === asset.symbol)?.quantity ?? 0;
      return total + point.value * quantity;
    }, 0);
    return { day: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }), value };
  });
}

export default function Dashboard() {
  const [holdings, setHoldings] = useState<Holding[]>(DEFAULT_HOLDINGS);
  const [holdingsReady, setHoldingsReady] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [integrations, setIntegrations] = useState<IntegrationState>({ marketData: true, newsFeeds: true, groq: false, email: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [portfolioOpen, setPortfolioOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftSymbol, setDraftSymbol] = useState("");
  const [draftQuantity, setDraftQuantity] = useState("1");
  const [draftKind, setDraftKind] = useState<"stock" | "crypto">("stock");
  const [addError, setAddError] = useState("");
  const [addingHolding, setAddingHolding] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState("PORTFOLIO");
  const [groqKey, setGroqKey] = useState("");
  const [analysis, setAnalysis] = useState<AgentAnalysis | null>(null);
  const [agentPhase, setAgentPhase] = useState("");
  const [agentError, setAgentError] = useState("");
  const [greeting, setGreeting] = useState("Welcome back, Aadit.");

  const symbolsKey = holdings.map((item) => `${item.kind}:${item.symbol}`).sort().join(",");

  useEffect(() => {
    const stored = window.localStorage.getItem("finpulse-holdings");
    if (stored) try {
      const parsed = JSON.parse(stored) as Array<Partial<Holding>>;
      const restored = parsed.flatMap((item) => {
        const symbol = String(item.symbol ?? "").trim().toUpperCase();
        const quantity = Number(item.quantity);
        if (!/^[A-Z.]{1,8}$/.test(symbol) || !Number.isFinite(quantity) || quantity < 0) return [];
        return [{ symbol, quantity, kind: item.kind === "crypto" || (!item.kind && CRYPTO_SYMBOLS.includes(symbol)) ? "crypto" as const : "stock" as const }];
      });
      setHoldings(restored);
    } catch { /* Keep safe defaults. */ }
    const sessionKey = window.sessionStorage.getItem("finpulse-groq-key") ?? "";
    if (sessionKey) { setGroqKey(sessionKey); setIntegrations((current) => ({ ...current, groq: true })); }
    setHoldingsReady(true);
    const hour = new Date().getHours();
    setGreeting(`${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, Aadit.`);
  }, []);

  useEffect(() => {
    if (holdingsReady) window.localStorage.setItem("finpulse-holdings", JSON.stringify(holdings));
  }, [holdings, holdingsReady]);

  useEffect(() => {
    if (selectedSymbol !== "PORTFOLIO" && !holdings.some((item) => item.symbol === selectedSymbol)) setSelectedSymbol("PORTFOLIO");
  }, [holdings, selectedSymbol]);

  const loadDashboard = useCallback(async () => {
    if (!holdingsReady) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/dashboard?assets=${encodeURIComponent(symbolsKey)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Live market tools could not complete this refresh.");
      setDashboard(await response.json() as DashboardPayload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dashboard refresh failed");
    } finally { setLoading(false); }
  }, [holdingsReady, symbolsKey]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  useEffect(() => {
    void fetch("/api/health", { cache: "no-store" }).then((response) => response.json()).then((value: { integrations: IntegrationState }) => setIntegrations((current) => ({ ...value.integrations, groq: value.integrations.groq || current.groq }))).catch(() => undefined);
  }, []);

  const assets = dashboard?.assets ?? [];
  const selectedAsset = selectedSymbol === "PORTFOLIO" ? null : assets.find((asset) => asset.symbol === selectedSymbol) ?? null;
  const series = useMemo(() => selectedAsset
    ? selectedAsset.history.map((point) => ({ day: new Date(point.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }), value: point.value }))
    : portfolioHistory(assets, holdings), [assets, holdings, selectedAsset]);
  const portfolioValue = assets.reduce((total, asset) => total + asset.price * (holdings.find((item) => item.symbol === asset.symbol)?.quantity ?? 0), 0);
  const previousValue = assets.reduce((total, asset) => {
    const quantity = holdings.find((item) => item.symbol === asset.symbol)?.quantity ?? 0;
    const previousPrice = asset.change24h === -100 ? asset.price : asset.price / (1 + asset.change24h / 100);
    return total + previousPrice * quantity;
  }, 0);
  const dailyMove = portfolioValue - previousValue;
  const dailyPercent = previousValue ? dailyMove / previousValue * 100 : 0;
  const cryptoValue = assets.filter((asset) => asset.kind === "crypto").reduce((sum, asset) => sum + asset.price * (holdings.find((item) => item.symbol === asset.symbol)?.quantity ?? 0), 0);
  const cryptoShare = portfolioValue ? Math.round(cryptoValue / portfolioValue * 100) : 0;

  const visibleNews = (dashboard?.news ?? []).filter((item) => {
    const matchesType = feedFilter === "all" || item.category === feedFilter;
    const query = search.trim().toLowerCase();
    return matchesType && (!query || `${item.title} ${item.ticker} ${item.source}`.toLowerCase().includes(query));
  });

  async function addHolding() {
    const symbol = draftSymbol.trim().toUpperCase();
    const quantity = Number(draftQuantity);
    setAddError("");
    if (!/^[A-Z.]{1,8}$/.test(symbol) || !Number.isFinite(quantity) || quantity < 0) { setAddError("Enter a valid symbol and quantity."); return; }
    if (draftKind === "crypto" && !CRYPTO_SYMBOLS.includes(symbol)) { setAddError(`Choose a supported crypto: ${CRYPTO_SYMBOLS.join(", ")}.`); return; }
    setAddingHolding(true);
    try {
      const response = await fetch(`/api/dashboard?assets=${encodeURIComponent(`${draftKind}:${symbol}`)}`, { cache: "no-store" });
      const payload = await response.json() as DashboardPayload & { error?: string };
      if (!response.ok || !payload.assets?.some((asset) => asset.symbol === symbol)) throw new Error(payload.error ?? payload.warnings?.[0] ?? `No live quote found for ${symbol}.`);
    } catch (caught) {
      setAddError(caught instanceof Error ? caught.message : `Could not validate ${symbol}.`);
      setAddingHolding(false);
      return;
    }
    setHoldings((current) => current.some((item) => item.symbol === symbol)
      ? current.map((item) => item.symbol === symbol ? { symbol, quantity, kind: draftKind } : item)
      : [...current, { symbol, quantity, kind: draftKind }]);
    setSelectedSymbol(symbol);
    setDraftSymbol(""); setDraftQuantity("1");
    setAddingHolding(false);
  }

  async function connectGroq(candidate: string): Promise<string> {
    const apiKey = candidate.trim();
    if (!apiKey) return "Paste your Groq API key.";
    try {
      const response = await fetch("/api/integrations/groq", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey }) });
      const payload = await response.json() as { connected?: boolean; error?: string };
      if (!response.ok || !payload.connected) return payload.error ?? "Groq could not verify this key.";
      window.sessionStorage.setItem("finpulse-groq-key", apiKey);
      setGroqKey(apiKey); setIntegrations((current) => ({ ...current, groq: true })); setAgentError("");
      return "";
    } catch { return "Could not reach Groq. Please try again."; }
  }

  function disconnectGroq() {
    window.sessionStorage.removeItem("finpulse-groq-key");
    setGroqKey(""); setIntegrations((current) => ({ ...current, groq: false })); setAnalysis(null);
  }

  async function runAgent() {
    if (!integrations.groq) { setSettingsOpen(true); return; }
    setAgentError(""); setAgentPhase("Gathering live prices");
    const timerOne = window.setTimeout(() => setAgentPhase("Reading portfolio news"), 700);
    const timerTwo = window.setTimeout(() => setAgentPhase("Reasoning across catalysts"), 1700);
    try {
      const response = await fetch("/api/agent/run", {
        method: "POST", headers: { "Content-Type": "application/json", ...(groqKey ? { "X-Groq-Api-Key": groqKey } : {}) }, body: JSON.stringify({ holdings }),
      });
      const payload = await response.json() as { analysis?: AgentAnalysis; error?: string };
      if (!response.ok || !payload.analysis) throw new Error(payload.error ?? "Agent analysis failed");
      setAnalysis(payload.analysis);
    } catch (caught) {
      setAgentError(caught instanceof Error ? caught.message : "Agent analysis failed");
    } finally {
      window.clearTimeout(timerOne); window.clearTimeout(timerTwo); setAgentPhase("");
    }
  }

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="logo-mark" title="FinPulse"><ChartNoAxesCombined size={23} strokeWidth={2.3} /></div>
        <nav aria-label="Dashboard navigation">
          <button className="nav-icon active" aria-label="Overview" onClick={() => scrollTo("overview")}><LayoutDashboard size={19} /></button>
          <button className="nav-icon" aria-label="Portfolio" onClick={() => setPortfolioOpen(true)}><WalletCards size={19} /></button>
          <button className="nav-icon" aria-label="AI analyst" onClick={() => scrollTo("agent")}><Bot size={19} /></button>
          <button className="nav-icon" aria-label="News" onClick={() => scrollTo("news")}><Newspaper size={19} /></button>
          <button className="nav-icon" aria-label="Digest schedule" onClick={() => scrollTo("delivery")}><Mail size={19} /></button>
          <span className="nav-rule" />
          <button className="nav-icon" aria-label="Refresh activity" onClick={() => void loadDashboard()}><Activity size={19} /></button>
          <button className="nav-icon" aria-label="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={19} /></button>
        </nav>
        <div className="user-avatar">AH</div>
      </aside>

      <section className="workspace" id="overview">
        <header className="topbar">
          <div><p className="kicker">PERSONAL MARKET INTELLIGENCE</p><h1>{greeting}</h1></div>
          <div className="top-actions">
            <label className="search-box"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search portfolio and news" placeholder="Search your intelligence" /></label>
            <button className="icon-button" aria-label="Integration status" onClick={() => setSettingsOpen(true)}><Bell size={18} />{dashboard?.warnings.length ? <span /> : null}</button>
            <button className="primary-button" onClick={() => void runAgent()} disabled={Boolean(agentPhase)}>{agentPhase ? <LoaderCircle className="spin" size={16}/> : <Sparkles size={16}/>} {agentPhase || "Run AI analysis"}</button>
          </div>
        </header>

        <div className="status-row">
          <span className={error ? "live-pill offline" : "live-pill"}><i /> {error ? "Data connection interrupted" : loading ? "Refreshing market tools" : "Market data live"}</span>
          <span>{dashboard ? `Updated ${relativeTime(dashboard.generatedAt)} ago` : "Connecting…"}</span>
          {dashboard?.warnings.length ? <button className="warning-button" onClick={() => setSettingsOpen(true)}><AlertCircle size={13}/>{dashboard.warnings.length} source warning{dashboard.warnings.length > 1 ? "s" : ""}</button> : null}
          <button onClick={() => void loadDashboard()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={13} /> Refresh</button>
        </div>

        {error ? <div className="error-banner"><AlertCircle size={17}/><span>{error}</span><button onClick={() => void loadDashboard()}>Try again</button></div> : null}

        <section className="dashboard-grid">
          <article className="portfolio-panel glass-card">
            <div className="panel-heading">
              <div><p>{selectedAsset ? `${selectedAsset.symbol} · ${selectedAsset.name}` : "PORTFOLIO VALUE"}</p><h2>{loading && !dashboard ? "—" : money(selectedAsset?.price ?? portfolioValue)}</h2></div>
              <span className={`gain-badge ${(selectedAsset?.change24h ?? dailyPercent) < 0 ? "loss" : ""}`}>{selectedAsset ? signedPercent(selectedAsset.change24h) : <>{dailyMove >= 0 ? "+" : ""}{money(dailyMove)} <small>{signedPercent(dailyPercent)}</small></>}</span>
            </div>
            <div className="chart-switcher" aria-label="Choose graph"><button className={selectedSymbol === "PORTFOLIO" ? "active" : ""} onClick={() => setSelectedSymbol("PORTFOLIO")}>Portfolio</button>{assets.map((asset) => <button key={asset.symbol} className={selectedSymbol === asset.symbol ? "active" : ""} onClick={() => setSelectedSymbol(asset.symbol)}>{asset.symbol}</button>)}</div>
            <div className="range-tabs"><span>{selectedAsset ? `${selectedAsset.symbol} price history` : "Portfolio performance"}</span><button className="active">1M</button></div>
            <div className="main-chart">
              {series.length ? <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 720, height: 245 }}>
                <AreaChart data={series} margin={{ top: 12, right: 4, left: 0, bottom: 0 }}>
                  <defs><linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6842d7" stopOpacity={0.3}/><stop offset="100%" stopColor="#6842d7" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="rgba(70,48,120,.1)" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} minTickGap={35} tick={{ fill: "#746e82", fontSize: 10 }} dy={10} />
                  <YAxis hide domain={["dataMin - 100", "dataMax + 100"]} />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #ded9eb", borderRadius: 12, boxShadow: "0 12px 32px rgba(70,50,105,.12)", color: "#201a2c" }} labelStyle={{ color: "#746e82" }} formatter={(value) => [money(Number(value)), selectedAsset?.symbol ?? "Portfolio"]} />
                  <Area isAnimationActive={false} type="monotone" dataKey="value" stroke="#633bd1" strokeWidth={2.5} fill="url(#portfolioFill)" />
                </AreaChart>
              </ResponsiveContainer> : <EmptyChart loading={loading} />}
            </div>
            <div className="portfolio-footer"><span><i className="violet-dot" />Crypto <b>{cryptoShare}%</b></span><span><i className="coral-dot" />Stocks <b>{100 - cryptoShare}%</b></span><button onClick={() => setPortfolioOpen(true)}><Plus size={15}/> Manage assets</button></div>
          </article>

          <aside className="snapshot-panel glass-card">
            <div className="section-title"><div><p>YOUR HOLDINGS</p><h3>Market snapshot</h3></div><button aria-label="Manage portfolio" onClick={() => setPortfolioOpen(true)}><Plus size={17}/></button></div>
            <div className="asset-list">
               {assets.map((asset, index) => <AssetRow key={asset.symbol} asset={asset} tone={["violet", "peach", "blue", "lime"][index % 4]} selected={selectedSymbol === asset.symbol} onSelect={() => setSelectedSymbol(asset.symbol)} />)}
              {!assets.length ? <div className="list-empty">{loading ? "Loading live quotes…" : "No quote data available."}</div> : null}
            </div>
            <button className="text-button" onClick={() => setPortfolioOpen(true)}>Manage portfolio <ChevronRight size={14}/></button>
          </aside>

          <article className="ai-panel glass-card" id="agent">
            <div className="ai-orb">{agentPhase ? <LoaderCircle className="spin" size={21}/> : <Bot size={21}/>}</div>
            <div className="ai-content">
              <div className="section-title"><div><p>FINPULSE AGENT · GROQ {analysis?.model ?? "AUTO MODEL"}</p><h3>{agentPhase || "Portfolio intelligence brief"}</h3></div><span className={integrations.groq ? "agent-status" : "agent-status offline"}><i/> {integrations.groq ? "READY" : "KEY NEEDED"}</span></div>
              {analysis ? <>
                <p className="ai-summary">{analysis.overview}</p>
                <div className="insight-row"><span><CircleGauge size={15}/> Risk <b>{analysis.riskLevel}</b></span><span><Sparkles size={15}/> Opportunity <b>{analysis.opportunity}</b></span><span><Check size={15}/> Confidence <b>{analysis.confidence}%</b></span></div>
                <div className="agent-actions">{analysis.actions?.map((action, index) => <span key={action}><b>0{index + 1}</b>{action}</span>)}</div>
              </> : <>
                <p className="ai-summary">{integrations.groq ? "Run the agent to gather fresh prices, read the latest portfolio headlines, and reason across risks and catalysts. Every conclusion is grounded in the live sources shown below." : "The market and news tools are live. Connect a free Groq key in Integrations to activate multi-step portfolio reasoning; the key is kept only for this browser tab."}</p>
                <div className="agent-flow"><span><Check size={13}/> Fetch prices</span><i/><span><Check size={13}/> Read news</span><i/><span className={integrations.groq ? "" : "pending"}><Sparkles size={13}/> Reason with Groq</span></div>
              </>}
              {agentError ? <p className="agent-error"><AlertCircle size={13}/>{agentError}</p> : null}
            </div>
            <button className="agent-button" onClick={() => void runAgent()} disabled={Boolean(agentPhase)}>{integrations.groq ? "Run agent" : "Connect Groq"} <ChevronRight size={16}/></button>
          </article>

          <DigestSchedulePanel emailConnected={integrations.email} />

          <article className="news-panel glass-card" id="news">
            <div className="section-title"><div><p>LIVE RSS INTELLIGENCE · {visibleNews.length} STORIES</p><h3>Portfolio news</h3></div><div className="feed-tabs"><button className={feedFilter === "all" ? "active" : ""} onClick={() => setFeedFilter("all")}>All</button><button className={feedFilter === "crypto" ? "active" : ""} onClick={() => setFeedFilter("crypto")}>Crypto</button><button className={feedFilter === "stock" ? "active" : ""} onClick={() => setFeedFilter("stock")}>Stocks</button></div></div>
            <div className="news-list">{visibleNews.slice(0, 9).map((item) => <NewsCard item={item} key={item.id} />)}</div>
            {!visibleNews.length ? <div className="list-empty">{loading ? "Reading portfolio feeds…" : "No stories match this view."}</div> : null}
          </article>
        </section>
      </section>

      {portfolioOpen ? <PortfolioModal holdings={holdings} setHoldings={setHoldings} symbol={draftSymbol} quantity={draftQuantity} kind={draftKind} setKind={setDraftKind} setSymbol={setDraftSymbol} setQuantity={setDraftQuantity} add={addHolding} addError={addError} adding={addingHolding} close={() => setPortfolioOpen(false)} /> : null}
      {settingsOpen ? <SettingsModal integrations={integrations} warnings={dashboard?.warnings ?? []} connectGroq={connectGroq} disconnectGroq={disconnectGroq} hasSessionKey={Boolean(groqKey)} close={() => setSettingsOpen(false)} /> : null}
    </main>
  );
}

type DigestSettings = { recipient: string; deliveryTime: string; timezone: string; enabled: boolean };

function DigestSchedulePanel({ emailConnected }: { emailConnected: boolean }) {
  const [settings, setSettings] = useState<DigestSettings>({ recipient: "", deliveryTime: "08:00", timezone: "Asia/Kolkata", enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/digest/settings", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { settings?: DigestSettings; error?: string };
        if (!response.ok || !payload.settings) throw new Error(payload.error ?? "Could not load digest settings.");
        setSettings(payload.settings);
      })
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : "Could not load digest settings."))
      .finally(() => setLoading(false));
  }, []);

  async function saveSettings() {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/digest/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const payload = await response.json() as { settings?: DigestSettings; error?: string };
      if (!response.ok || !payload.settings) throw new Error(payload.error ?? "Could not save the schedule.");
      setSettings(payload.settings);
      setMessage("Schedule saved. The Python digest will use this recipient.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save the schedule."); }
    finally { setSaving(false); }
  }

  async function sendTest() {
    setTesting(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/digest/test", { method: "POST" });
      const payload = await response.json() as { sent?: boolean; articleCount?: number; error?: string };
      if (!response.ok || !payload.sent) throw new Error(payload.error ?? "Test email failed.");
      setMessage(`Test digest sent with ${payload.articleCount ?? 0} ranked articles.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Test email failed."); }
    finally { setTesting(false); }
  }

  return <article className="delivery-panel glass-card" id="delivery">
    <div className="delivery-intro">
      <span className="delivery-icon"><Mail size={20}/></span>
      <div><p>EMAIL AUTOMATION</p><h3>Digest schedule</h3><span>Choose when FinPulse should deliver your AI-ranked market brief.</span></div>
      <span className={`automation-badge ${settings.enabled ? "" : "paused"}`}><i/>{settings.enabled ? "ACTIVE" : "PAUSED"}</span>
    </div>
    <div className="schedule-form" aria-busy={loading}>
      <label className="email-field">Recipient email<input type="email" value={settings.recipient} onChange={(event) => setSettings((current) => ({ ...current, recipient: event.target.value }))} placeholder="you@gmail.com" disabled={loading}/></label>
      <label>Daily delivery time<div className="input-with-icon"><Clock3 size={16}/><input type="time" value={settings.deliveryTime} onChange={(event) => setSettings((current) => ({ ...current, deliveryTime: event.target.value }))} disabled={loading}/></div></label>
      <label>Timezone<select value={settings.timezone} onChange={(event) => setSettings((current) => ({ ...current, timezone: event.target.value }))} disabled={loading}><option value="Asia/Kolkata">India · IST</option><option value="UTC">UTC</option><option value="America/Los_Angeles">Pacific · PT</option><option value="America/New_York">Eastern · ET</option><option value="Europe/London">London · GMT/BST</option></select></label>
      <div className="automation-control"><div><b>Automation active</b><span>{settings.enabled ? `Daily at ${settings.deliveryTime}` : "Daily emails are paused"}</span></div><button type="button" role="switch" aria-checked={settings.enabled} className={`toggle ${settings.enabled ? "on" : ""}`} onClick={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))}><span/></button></div>
      <div className="schedule-actions"><button className="test-email-button" onClick={() => void sendTest()} disabled={testing || saving || !emailConnected}>{testing ? <LoaderCircle className="spin" size={16}/> : <Send size={16}/>} {testing ? "Building & sending…" : "Send test email"}</button><button className="save-schedule-button" onClick={() => void saveSettings()} disabled={saving || testing}>{saving ? <LoaderCircle className="spin" size={16}/> : <Save size={16}/>} {saving ? "Saving…" : "Save configuration"}</button></div>
      {!emailConnected ? <p className="schedule-hint"><AlertCircle size={14}/> Connect Gmail SMTP in the server environment before sending a test.</p> : null}
      {message ? <p className="schedule-success"><Check size={14}/>{message}</p> : null}
      {error ? <p className="form-error"><AlertCircle size={14}/>{error}</p> : null}
    </div>
  </article>;
}

function AssetRow({ asset, tone, selected, onSelect }: { asset: MarketAsset; tone: string; selected: boolean; onSelect: () => void }) {
  return <button className={`asset-row ${selected ? "selected" : ""}`} onClick={onSelect} aria-label={`Show ${asset.symbol} graph`}>
    <span className={`asset-icon ${tone}`}>{asset.symbol.slice(0, 1)}</span>
    <span className="asset-name"><b>{asset.symbol}</b><small>{asset.name}</small></span>
    <span className="mini-chart"><ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 78, height: 28 }}><AreaChart data={asset.history.slice(-12)}><Area isAnimationActive={false} type="monotone" dataKey="value" stroke={asset.change24h >= 0 ? "#159965" : "#d94d59"} strokeWidth={1.6} fill="transparent" /></AreaChart></ResponsiveContainer></span>
    <span className="asset-price"><b>{money(asset.price)}</b><small className={asset.change24h >= 0 ? "positive" : "negative"}>{signedPercent(asset.change24h)}</small></span>
  </button>;
}

function NewsCard({ item }: { item: NewsItem }) {
  return <a href={item.url} target="_blank" rel="noreferrer" className="news-item">
    <span className="ticker-tag">{item.ticker}</span><div><h4>{item.title}</h4><p>{item.source} · {relativeTime(item.publishedAt)} ago</p></div><ExternalLink size={15}/>
  </a>;
}

function EmptyChart({ loading }: { loading: boolean }) {
  return <div className="empty-chart">{loading ? <LoaderCircle className="spin" size={22}/> : <ChartNoAxesCombined size={24}/>}<span>{loading ? "Building your live portfolio graph…" : "Add assets with available price history."}</span></div>;
}

function PortfolioModal({ holdings, setHoldings, symbol, quantity, kind, setKind, setSymbol, setQuantity, add, addError, adding, close }: {
  holdings: Holding[]; setHoldings: React.Dispatch<React.SetStateAction<Holding[]>>; symbol: string; quantity: string;
  kind: "stock" | "crypto"; setKind: (value: "stock" | "crypto") => void; setSymbol: (value: string) => void; setQuantity: (value: string) => void;
  add: () => Promise<void>; addError: string; adding: boolean; close: () => void;
}) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="portfolio-title">
      <div className="modal-head"><div><p>PERSONAL SETTINGS</p><h2 id="portfolio-title">Manage portfolio</h2></div><button aria-label="Close" onClick={close}><X size={18}/></button></div>
      <p className="modal-copy">Your holdings stay in this browser. Symbols are sent only to the live market and news tools.</p>
      <div className="add-row asset-add-row"><label>Asset type<select value={kind} onChange={(event) => { setKind(event.target.value as "stock" | "crypto"); setSymbol(""); }}><option value="stock">Stock</option><option value="crypto">Crypto</option></select></label><label>Symbol<input value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase())} placeholder={kind === "crypto" ? "SOL" : "NVDA"} list={kind === "crypto" ? "crypto-symbols" : undefined} maxLength={8}/>{kind === "crypto" ? <datalist id="crypto-symbols">{CRYPTO_SYMBOLS.map((item) => <option value={item} key={item}/>)}</datalist> : null}</label><label>Quantity<input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="0" step="any"/></label><button onClick={() => void add()} disabled={adding}>{adding ? <LoaderCircle className="spin" size={16}/> : <Plus size={16}/>} {adding ? "Checking" : "Add"}</button></div>
      {addError ? <p className="form-error"><AlertCircle size={13}/>{addError}</p> : null}
      <div className="holding-list">{holdings.map((holding) => <div key={holding.symbol}><span className="holding-symbol">{holding.symbol.slice(0,1)}</span><span className="holding-name"><b>{holding.symbol}</b><small>{holding.kind}</small></span><label>Quantity<input value={holding.quantity} onChange={(event) => setHoldings((current) => current.map((item) => item.symbol === holding.symbol ? { ...item, quantity: Math.max(0, Number(event.target.value)) } : item))} type="number" min="0" step="any"/></label><button aria-label={`Remove ${holding.symbol}`} onClick={() => setHoldings((current) => current.filter((item) => item.symbol !== holding.symbol))}><Trash2 size={16}/></button></div>)}</div>
      <button className="modal-done" onClick={close}>Done</button>
    </section>
  </div>;
}

function SettingsModal({ integrations, warnings, connectGroq, disconnectGroq, hasSessionKey, close }: {
  integrations: IntegrationState; warnings: string[]; connectGroq: (key: string) => Promise<string>;
  disconnectGroq: () => void; hasSessionKey: boolean; close: () => void;
}) {
  const [candidateKey, setCandidateKey] = useState("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [verifying, setVerifying] = useState(false);
  async function submitKey() {
    setKeyError(""); setVerifying(true);
    const result = await connectGroq(candidateKey);
    setVerifying(false);
    if (result) setKeyError(result); else setCandidateKey("");
  }
  const rows = [
    { name: "Market prices", ready: integrations.marketData, detail: "CoinGecko + Yahoo Finance" },
    { name: "Portfolio news", ready: integrations.newsFeeds, detail: "CoinDesk + Cointelegraph + Google News" },
    { name: "AI reasoning", ready: integrations.groq, detail: "GROQ_API_KEY · automatic production model" },
    { name: "Email delivery", ready: integrations.email, detail: "SMTP_USER + SMTP_PASS + EMAIL_TO" },
  ];
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="modal-card integrations-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="modal-head"><div><p>SERVER CONNECTIONS</p><h2 id="settings-title">Integrations</h2></div><button aria-label="Close" onClick={close}><X size={18}/></button></div>
      <p className="modal-copy">Your Groq key is verified by the server and kept only for this browser tab. It is cleared when the tab closes and is never committed with the project.</p>
      <div className="integration-list">{rows.map((row) => <div key={row.name}><span className={row.ready ? "integration-icon ready" : "integration-icon"}>{row.ready ? <Check size={16}/> : <AlertCircle size={16}/>}</span><span><b>{row.name}</b><small>{row.detail}</small></span><em className={row.ready ? "ready" : ""}>{row.ready ? "CONNECTED" : "SETUP NEEDED"}</em></div>)}</div>
      {!integrations.groq ? <div className="groq-connect"><label>Groq API key<div><input type={keyVisible ? "text" : "password"} value={candidateKey} onChange={(event) => setCandidateKey(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submitKey(); }} autoComplete="off" spellCheck={false} placeholder="gsk_…"/><button type="button" onClick={() => setKeyVisible((value) => !value)}>{keyVisible ? "Hide" : "Show"}</button></div></label><button className="connect-button" onClick={() => void submitKey()} disabled={verifying}>{verifying ? <LoaderCircle className="spin" size={15}/> : <Sparkles size={15}/>} {verifying ? "Verifying with Groq" : "Verify & connect"}</button>{keyError ? <p className="form-error"><AlertCircle size={13}/>{keyError}</p> : null}<small>Create a free key at console.groq.com. FinPulse does not store it permanently.</small></div> : <div className="connected-note"><span><Check size={15}/> Groq is ready for AI analysis.</span>{hasSessionKey ? <button onClick={disconnectGroq}>Disconnect this key</button> : <small>Connected through the server environment.</small>}</div>}
      {warnings.length ? <div className="source-warnings"><b>Current source warnings</b>{warnings.map((warning) => <span key={warning}>{warning}</span>)}</div> : null}
      <button className="modal-done" onClick={close}>Close</button>
    </section>
  </div>;
}
