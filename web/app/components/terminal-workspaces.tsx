"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BellRing, BookOpenText, Check, ChevronRight, CircleGauge,
  Clipboard, Database, ExternalLink, FileSearch, KeyRound, LineChart, LoaderCircle, Plus,
  Search, ShieldCheck, Upload, X,
} from "lucide-react";
import { sortObservationsNewestFirst } from "@/lib/macro/observations";
import type { Citation, Holding, ResearchAnswer } from "@/lib/types";

export type WorkspaceName = "monitor" | "research" | "macro" | "alerts" | "health" | "access";

type Props = {
  workspace: Exclude<WorkspaceName, "monitor">;
  holdings: Holding[];
  groqKey: string;
  navigate: (workspace: WorkspaceName) => void;
};

type AlertRecord = { id: string; name: string; rule_type: string; status: string; requires_approval: boolean; configuration: Record<string, unknown>; created_at: string };
type TokenRecord = { id: string; name: string; token_prefix: string; scopes: string[]; expires_at: string; revoked_at?: string | null };

function ErrorNotice({ message }: { message: string }) {
  return message ? <div className="terminal-notice error"><AlertTriangle size={16}/><span>{message}</span></div> : null;
}

export function TerminalWorkspace({ workspace, holdings, groqKey, navigate }: Props) {
  return (
    <section className="terminal-workspace" aria-label={`${workspace} workspace`}>
      <div className="terminal-breadcrumb"><button onClick={() => navigate("monitor")}>FinPulse</button><ChevronRight size={13}/><span>{workspace}</span></div>
      {workspace === "research" ? <ResearchWorkspace holdings={holdings} groqKey={groqKey}/> : null}
      {workspace === "macro" ? <MacroWorkspace/> : null}
      {workspace === "alerts" ? <AlertsWorkspace/> : null}
      {workspace === "health" ? <HealthWorkspace/> : null}
      {workspace === "access" ? <AccessWorkspace/> : null}
    </section>
  );
}

function ResearchWorkspace({ holdings, groqKey }: Pick<Props, "holdings" | "groqKey">) {
  const [query, setQuery] = useState("What are the most important current risks and catalysts across my portfolio?");
  const [answer, setAnswer] = useState<ResearchAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");

  async function runResearch() {
    setBusy(true); setError(""); setAnswer(null);
    try {
      const response = await fetch("/api/agents/run", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(groqKey ? { "X-Groq-Api-Key": groqKey } : {}) },
        body: JSON.stringify({ query, holdings }),
      });
      const payload = await response.json() as ResearchAnswer & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Research run failed");
      setAnswer(payload);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Research run failed"); }
    finally { setBusy(false); }
  }

  async function uploadDocument(file: File) {
    setUploading(true); setUploadMessage(""); setError("");
    try {
      const body = new FormData(); body.set("file", file);
      const response = await fetch("/api/research/documents", { method: "POST", body });
      const payload = await response.json() as { title?: string; chunks?: number; degraded?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Document ingestion failed");
      setUploadMessage(`${payload.title ?? file.name} indexed in ${payload.chunks ?? 0} passages${payload.degraded ? " with degraded local embeddings" : ""}.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Document ingestion failed"); }
    finally { setUploading(false); }
  }

  return <>
    <div className="workspace-title"><div className="workspace-icon"><FileSearch size={22}/></div><div><p>RAG RESEARCH DESK</p><h2>Evidence before inference</h2><span>Hybrid full-text + vector retrieval · 3,000-token evidence ceiling · every claim cited</span></div></div>
    <div className="terminal-columns research-layout">
      <article className="terminal-card research-console">
        <div className="terminal-card-head"><span>Research query</span><b>⌘ ↵ TO RUN</b></div>
        <textarea value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void runResearch(); }} maxLength={1200}/>
        <div className="research-controls">
          <label className="terminal-upload">{uploading ? <LoaderCircle className="spin" size={15}/> : <Upload size={15}/>} Add source<input type="file" accept=".pdf,.txt,.md,.html,text/plain,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadDocument(file); }}/></label>
          <span>{holdings.length} assets in context</span>
          <button onClick={() => void runResearch()} disabled={busy || query.trim().length < 3}>{busy ? <LoaderCircle className="spin" size={16}/> : <Search size={16}/>} {busy ? "Retrieving evidence" : "Run cited research"}</button>
        </div>
        {uploadMessage ? <div className="terminal-notice"><Check size={15}/><span>{uploadMessage}</span></div> : null}
        <ErrorNotice message={error}/>
      </article>
      <aside className="terminal-card research-policy">
        <div className="terminal-card-head"><span>Run policy</span><b>ENFORCED</b></div>
        <PolicyRow label="Model responses" value="≤ 2"/>
        <PolicyRow label="Tool calls" value="≤ 4"/>
        <PolicyRow label="Input / output" value="5.8K / 1.2K"/>
        <PolicyRow label="Timeout" value="60 SEC"/>
        <div className="policy-boundary"><ShieldCheck size={17}/><p><b>Research only</b><span>No orders, simulations, or executable trade recommendations.</span></p></div>
      </aside>
    </div>
    {answer ? <article className="terminal-card answer-card">
      <div className="terminal-card-head"><span>Research output</span><b>{answer.status === "evidence_only" ? "EVIDENCE-ONLY" : answer.model ?? "SYNTHESIZED"}</b></div>
      <h3>FinPulse research brief</h3>
      <p className="answer-copy">{answer.answer}</p>
      {answer.limitation ? <div className="limitations"><b>Limitation</b><span>{answer.limitation}</span></div> : null}
      <div className="citation-grid">{answer.citations?.map((citation, index) => <CitationCard citation={citation} index={index + 1} key={`${citation.sourceUrl}-${index}`}/>)}</div>
    </article> : null}
  </>;
}

function CitationCard({ citation, index }: { citation: Citation; index: number }) {
  return <a className="citation-card" href={citation.sourceUrl || "#"} target="_blank" rel="noreferrer"><b>[{index}] {citation.publisher || "Source"}</b><span>{citation.title}</span><p>{citation.excerpt}</p></a>;
}

function PolicyRow({ label, value }: { label: string; value: string }) { return <div className="policy-row"><span>{label}</span><b>{value}</b></div>; }

const MACRO_PRESETS = [
  { label: "US CPI", provider: "bls", params: "series=CUUR0000SA0" },
  { label: "US Unemployment", provider: "fred", params: "series=UNRATE" },
  { label: "Fed Funds", provider: "fred", params: "series=FEDFUNDS" },
  { label: "World GDP", provider: "worldbank", params: "series=NY.GDP.MKTP.CD&country=WLD" },
] as const;

function MacroWorkspace() {
  const [preset, setPreset] = useState<(typeof MACRO_PRESETS)[number]>(MACRO_PRESETS[0]);
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (choice: (typeof MACRO_PRESETS)[number]) => {
    setBusy(true); setError(""); setData(null); setPreset(choice);
    try {
      const response = await fetch(`/api/market/macro?provider=${choice.provider}&${choice.params}`, { cache: "no-store" });
      const payload = await response.json() as Record<string, unknown> & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Macro provider failed");
      setData(payload);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Macro provider failed"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void load(MACRO_PRESETS[0]); }, [load]);
  const rows = useMemo(() => flattenMacroRows(data), [data]);
  const fetchedAt = typeof data?.fetchedAt === "string" ? new Date(data.fetchedAt) : null;
  const provider = typeof data?.provider === "string" ? data.provider : preset.provider.toUpperCase();
  const warning = typeof data?.warning === "string" ? data.warning : "";
  return <>
    <div className="workspace-title"><div className="workspace-icon"><LineChart size={22}/></div><div><p>MACRO DATA DESK</p><h2>Global economic pulse</h2><span>Official releases with provider, observation date, and retrieval provenance</span></div></div>
    <div className="macro-tabs">{MACRO_PRESETS.map((item) => <button className={preset.label === item.label ? "active" : ""} onClick={() => void load(item)} key={item.label}>{item.label}</button>)}</div>
    {error.includes("FRED_API_KEY") ? <FredKeyNotice/> : <ErrorNotice message={error}/>} 
    {warning ? <div className="terminal-notice macro-warning"><AlertTriangle size={16}/><span>{warning}</span></div> : null}
    <article className="terminal-card macro-card"><div className="terminal-card-head"><span>{preset.label}</span><b>{busy ? "REFRESHING" : error ? "CONFIGURATION REQUIRED" : `${provider} · LATEST FIRST`}</b></div>
      {busy ? <div className="workspace-loading"><LoaderCircle className="spin"/><span>Contacting official data source…</span></div> : rows.length ? <>
        <div className="macro-latest"><div><span>Latest observation</span><b>{rows[0].value}</b></div><div><span>Observation date</span><b>{rows[0].date}</b></div><div><span>Retrieved</span><b>{fetchedAt && !Number.isNaN(fetchedAt.valueOf()) ? fetchedAt.toLocaleString() : "Just now"}</b></div></div>
        <div className="macro-table"><div><b>Observation (newest first)</b><b>Value</b></div>{rows.slice(0, 16).map((row, index) => <div key={`${row.date}-${index}`}><span>{row.date}</span><strong>{row.value}</strong></div>)}</div>
      </> : <div className="workspace-empty"><span>{error ? "No stale data is shown while this provider is unavailable." : "No observations returned by this provider."}</span></div>}
    </article>
  </>;
}

function flattenMacroRows(data: Record<string, unknown> | null): Array<{ date: string; value: string }> {
  if (!data) return [];
  const candidates = [data.observations, data.data, data.values, data.series].find(Array.isArray) as Array<Record<string, unknown>> | undefined;
  return sortObservationsNewestFirst((candidates ?? []).map((row) => ({ date: String(row.date ?? row.period ?? row.year ?? row.time ?? "—"), value: String(row.value ?? row.observation_value ?? row.Value ?? "—") })));
}

function FredKeyNotice() {
  return <div className="terminal-notice error macro-key-notice"><KeyRound size={16}/><div><b>FRED API key required</b><span>Add <code>FRED_API_KEY=your_key</code> to <code>web/.env.local</code>, then restart the development server. Keep it server-side—do not prefix it with <code>NEXT_PUBLIC_</code>.</span></div><a href="https://fred.stlouisfed.org/docs/api/api_key.html" target="_blank" rel="noreferrer">Get a free key <ExternalLink size={12}/></a></div>;
}

function AlertsWorkspace() {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [name, setName] = useState("BTC above threshold");
  const [threshold, setThreshold] = useState("100000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try { const response = await fetch("/api/alerts", { cache: "no-store" }); const payload = await response.json() as { alerts?: AlertRecord[]; error?: string }; if (!response.ok) throw new Error(payload.error); setAlerts(payload.alerts ?? []); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Alerts unavailable"); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function createAlert() {
    setBusy(true); setError("");
    try { const response = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, ruleType: "price_above", configuration: { symbol: "BTC", kind: "crypto", threshold: Number(threshold) } }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Alert creation failed"); }
    finally { setBusy(false); }
  }
  async function act(id: string, action: "approve" | "pause" | "resume") { await fetch("/api/alerts", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) }); await load(); }
  return <>
    <div className="workspace-title"><div className="workspace-icon"><BellRing size={22}/></div><div><p>ALERT CONTROL</p><h2>Approval-gated monitoring</h2><span>Draft first · explicit approval required · delivery deduplicated by window</span></div></div>
    <div className="terminal-columns alert-layout"><article className="terminal-card"><div className="terminal-card-head"><span>New alert draft</span><b>REQUIRES APPROVAL</b></div><div className="alert-form"><label>Name<input value={name} onChange={(event) => setName(event.target.value)}/></label><label>BTC price above<input type="number" value={threshold} onChange={(event) => setThreshold(event.target.value)}/></label><button onClick={() => void createAlert()} disabled={busy}>{busy ? <LoaderCircle className="spin" size={15}/> : <Plus size={15}/>} Create draft</button></div><ErrorNotice message={error}/></article>
      <aside className="terminal-card research-policy"><div className="terminal-card-head"><span>Safety boundary</span><b>HUMAN-IN-THE-LOOP</b></div><div className="policy-boundary"><ShieldCheck size={18}/><p><b>Nothing activates silently</b><span>Creating or changing alerts, schedules, and notification preferences always requires owner approval.</span></p></div></aside></div>
    <article className="terminal-card"><div className="terminal-card-head"><span>Alert registry</span><b>{alerts.length} RULES</b></div><div className="alert-list">{alerts.map((alert) => <div key={alert.id}><span className={`alert-state ${alert.status}`}>{alert.status}</span><p><b>{alert.name}</b><small>{alert.rule_type.replaceAll("_", " ")} · {new Date(alert.created_at).toLocaleDateString()}</small></p>{alert.status === "draft" ? <button onClick={() => void act(alert.id, "approve")}>Approve</button> : alert.status === "active" ? <button onClick={() => void act(alert.id, "pause")}>Pause</button> : <button onClick={() => void act(alert.id, "resume")}>Resume</button>}</div>)}{!alerts.length ? <div className="workspace-empty">No alert rules yet.</div> : null}</div></article>
  </>;
}

function HealthWorkspace() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => { try { const response = await fetch("/api/data-health", { cache: "no-store" }); const payload = await response.json() as Record<string, unknown> & { error?: string }; if (!response.ok) throw new Error(payload.error); setHealth(payload); } catch (caught) { setError(caught instanceof Error ? caught.message : "Health telemetry unavailable"); } }, []);
  useEffect(() => { void load(); }, [load]);
  const database = health?.database as Array<Record<string, unknown>> | Record<string, unknown> | undefined;
  const db = Array.isArray(database) ? database[0] : database;
  const providers = (health?.providers ?? []) as Array<Record<string, unknown>>;
  const loading = health === null && !error;
  const used = Number(db?.databaseBytes ?? 0); const limit = 500 * 1024 * 1024; const percent = Math.min(100, used / limit * 100);
  return <>
    <div className="workspace-title"><div className="workspace-icon"><Database size={22}/></div><div><p>DATA HEALTH</p><h2>Capacity, provenance, and uptime</h2><span>Daily measured relation size · provider health · independent keep-alive</span></div></div>
    <ErrorNotice message={error}/>
    <div className="health-grid"><article className="terminal-card capacity-card"><div className="terminal-card-head"><span>Supabase database</span><b>{loading ? "MEASURING" : health?.configured === false ? "LOCAL MODE" : `${percent.toFixed(1)}% USED`}</b></div><div className="capacity-gauge"><span style={{ width: `${percent}%` }}/></div><div className="capacity-labels"><b>{loading ? "Loading…" : formatBytes(used)}</b><span>of 500 MB</span></div><div className="thresholds"><span>60% WARN</span><span>70% PRUNE</span><span>80% REJECT</span></div></article>
      <article className="terminal-card"><div className="terminal-card-head"><span>Keep-alive</span><b>{loading ? "CHECKING" : health?.keepalive ? "OBSERVED" : "NO EVENT"}</b></div><div className="health-hero"><CircleGauge size={27}/><p><b>{loading ? "Loading telemetry" : health?.keepalive ? "Database reachable" : "Awaiting daily check"}</b><span>{loading ? "Contacting the authenticated health endpoint…" : health?.keepalive ? JSON.stringify(health.keepalive) : "The dedicated workflow is independent from ingestion."}</span></p></div></article></div>
    <article className="terminal-card"><div className="terminal-card-head"><span>Provider registry</span><b>{loading ? "LOADING" : `${providers.length} CHECKS`}</b></div><div className="provider-table"><div><b>Provider</b><b>Status</b><b>Latency</b><b>Last success</b></div>{providers.map((provider) => <div key={String(provider.provider)}><strong>{String(provider.provider)}</strong><span className={`provider-status ${String(provider.status)}`}>{String(provider.status)}</span><span>{provider.latency_ms == null ? "—" : `${provider.latency_ms} ms`}</span><span>{provider.last_success_at ? new Date(String(provider.last_success_at)).toLocaleString() : "—"}</span></div>)}{!providers.length ? <div className="workspace-empty">{loading ? "Loading provider health…" : "Provider checks appear after authenticated ingestion runs."}</div> : null}</div></article>
  </>;
}

function formatBytes(bytes: number) { if (!bytes) return "0 MB"; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }

function AccessWorkspace() {
  const [tokens, setTokens] = useState<TokenRecord[]>([]); const [revealed, setRevealed] = useState(""); const [error, setError] = useState(""); const [copied, setCopied] = useState(false);
  const load = useCallback(async () => { try { const response = await fetch("/api/mcp/tokens", { cache: "no-store" }); const payload = await response.json() as { tokens?: TokenRecord[]; error?: string }; if (!response.ok) throw new Error(payload.error); setTokens(payload.tokens ?? []); } catch (caught) { setError(caught instanceof Error ? caught.message : "Access tokens unavailable"); } }, []);
  useEffect(() => { void load(); }, [load]);
  async function createToken() { setError(""); const response = await fetch("/api/mcp/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Terminal client", scopes: ["market:read", "research:read", "portfolio:read"], expiresInDays: 90 }) }); const payload = await response.json() as { token?: string; error?: string }; if (!response.ok || !payload.token) { setError(payload.error ?? "Token creation failed"); return; } setRevealed(payload.token); await load(); }
  async function revoke(id: string) { await fetch(`/api/mcp/tokens?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); }
  return <>
    <div className="workspace-title"><div className="workspace-icon"><KeyRound size={22}/></div><div><p>MCP ACCESS</p><h2>Scoped terminal connections</h2><span>One Streamable HTTP endpoint · hashed personal tokens · least-privilege scopes</span></div></div>
    <div className="terminal-columns access-layout"><article className="terminal-card"><div className="terminal-card-head"><span>Endpoint</span><b>STREAMABLE HTTP</b></div><code className="endpoint-code">{typeof window === "undefined" ? "/api/mcp" : `${window.location.origin}/api/mcp`}</code><div className="scope-chips"><span>market:read</span><span>research:read</span><span>portfolio:read</span><span>alerts:write</span></div><button className="terminal-primary" onClick={() => void createToken()}><Plus size={15}/> Create 90-day read token</button><ErrorNotice message={error}/></article>
      <aside className="terminal-card"><div className="terminal-card-head"><span>Protocol boundary</span><b>RESEARCH ONLY</b></div><div className="policy-boundary"><ShieldCheck size={18}/><p><b>Scoped tools only</b><span>market_*, research_*, portfolio_* and approval-gated alerts. No order or brokerage tools exist.</span></p></div></aside></div>
    {revealed ? <div className="token-reveal"><button aria-label="Dismiss token" onClick={() => setRevealed("")}><X size={14}/></button><b>Copy this token now. It will not be shown again.</b><code>{revealed}</code><button onClick={() => { void navigator.clipboard.writeText(revealed); setCopied(true); }}>{copied ? <Check size={14}/> : <Clipboard size={14}/>} {copied ? "Copied" : "Copy"}</button></div> : null}
    <article className="terminal-card"><div className="terminal-card-head"><span>Personal access tokens</span><b>{tokens.filter((token) => !token.revoked_at).length} ACTIVE</b></div><div className="token-list">{tokens.map((token) => <div className={token.revoked_at ? "revoked" : ""} key={token.id}><KeyRound size={16}/><p><b>{token.name}</b><small>{token.token_prefix}… · expires {new Date(token.expires_at).toLocaleDateString()}</small></p><span>{token.scopes.join(" · ")}</span>{!token.revoked_at ? <button onClick={() => void revoke(token.id)}>Revoke</button> : <em>Revoked</em>}</div>)}{!tokens.length ? <div className="workspace-empty">No external client tokens.</div> : null}</div></article>
  </>;
}

export function CommandPalette({ open, close, navigate }: { open: boolean; close: () => void; navigate: (workspace: WorkspaceName) => void }) {
  const [query, setQuery] = useState("");
  const commands = [
    ["Monitor", "Portfolio, quotes, graphs, news and digest", "monitor"], ["Research", "Cited RAG and LLM agent", "research"],
    ["Macro", "Official economic series", "macro"], ["Alerts", "Approval-gated monitoring", "alerts"],
    ["Data Health", "Providers, quota and storage", "health"], ["MCP Access", "Scoped client tokens", "access"],
  ] as const;
  if (!open) return null;
  const visible = commands.filter(([name, detail]) => `${name} ${detail}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="command-backdrop" role="presentation" onMouseDown={close}><section className="command-palette" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}><label><Search size={17}/><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Jump to a FinPulse workspace…"/><kbd>ESC</kbd></label><div>{visible.map(([name, detail, target]) => <button key={target} onClick={() => { navigate(target); close(); }}><BookOpenText size={17}/><p><b>{name}</b><span>{detail}</span></p><ChevronRight size={15}/></button>)}</div></section></div>;
}
