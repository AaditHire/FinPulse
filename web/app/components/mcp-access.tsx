"use client";

import { useEffect, useState } from "react";

type KeyRecord = { id: string; name: string; token_prefix: string; scopes: string[]; expires_at: string; revoked_at?: string; last_used_at?: string };
const permissions = [
  ["market:read", "Prices, macro data and provider health"],
  ["research:read", "Search documents and run AI research"],
  ["portfolio:read", "Read holdings and portfolio analytics"],
  ["alerts:write", "Preview alerts (activation still requires approval)"],
] as const;

async function api(path: string, init?: RequestInit) {
  const response = await fetch(path, { cache: "no-store", ...init });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "The request failed. Please try again.");
  return payload;
}

export function McpAccess() {
  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [name, setName] = useState("My MCP client");
  const [days, setDays] = useState(90);
  const [scopes, setScopes] = useState<string[]>(["market:read", "research:read", "portfolio:read"]);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");
  const [endpoint, setEndpoint] = useState("/api/mcp");
  async function load() {
    const payload = await api("/api/mcp/tokens");
    if (!payload.configured) throw new Error("Connect Supabase and sign in before creating API keys.");
    setKeys(payload.tokens ?? []);
  }
  useEffect(() => {
    setEndpoint(window.location.origin + "/api/mcp");
    void load().catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  async function create() {
    setBusy(true); setError(""); setCopied("");
    try {
      const payload = await api("/api/mcp/tokens", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, scopes, expiresInDays: days }) });
      setToken(payload.token);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not generate the API key."); }
    finally { setBusy(false); }
  }
  async function revoke(id: string) {
    setBusy(true); setError("");
    try { await api("/api/mcp/tokens?id=" + encodeURIComponent(id), { method: "DELETE" }); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not revoke the API key."); }
    finally { setBusy(false); }
  }
  async function copy(value: string, label: string) {
    try { await navigator.clipboard.writeText(value); setCopied(label); }
    catch { setError("Clipboard unavailable. Select and copy the text manually."); }
  }
  const active = (key: KeyRecord) => !key.revoked_at && Date.parse(key.expires_at) > Date.now();
  const configuration = JSON.stringify({ mcpServers: { finpulse: { url: endpoint, headers: { Authorization: "Bearer YOUR_FINPULSE_API_KEY" } } } }, null, 2);
  return <>
    <div className="workspace-title"><div><p>MCP ACCESS</p><h2>Connect your AI tools to FinPulse</h2><span>Generate an API key here, then use it in a client that supports Streamable HTTP and bearer authentication.</span></div></div>
    {error ? <div className="terminal-notice error" role="alert">{error}</div> : null}
    <div className="terminal-columns access-layout">
      <article className="terminal-card"><div className="terminal-card-head"><span>Create API key</span><b>OWNER ACCESS</b></div>
        <form className="alert-form" onSubmit={e => { e.preventDefault(); void create(); }}>
          <label>Key name<input required minLength={2} maxLength={80} value={name} onChange={e => setName(e.target.value)} /></label>
          <label>Expires in<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option></select></label>
          <fieldset><legend>Permissions</legend>{permissions.map(([scope, description]) => <label key={scope} style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0" }}><input type="checkbox" style={{ width: "auto" }} checked={scopes.includes(scope)} onChange={e => setScopes(current => e.target.checked ? [...current, scope] : current.filter(s => s !== scope))} /><span>{description}</span></label>)}</fieldset>
          <button className="terminal-primary" disabled={busy || loading || !scopes.length || name.trim().length < 2 || Boolean(token)}>{busy ? "Working…" : "Generate API key"}</button>
        </form>
      </article>
      <article className="terminal-card"><div className="terminal-card-head"><span>Connect your client</span><b>STREAMABLE HTTP</b></div><div className="alert-form">
        <p>Use this server URL and set the Authorization header to Bearer followed by your generated key.</p>
        <code className="endpoint-code">{endpoint}</code><button onClick={() => void copy(endpoint, "URL")}>{copied === "URL" ? "Copied URL" : "Copy server URL"}</button>
        <p>Client configuration example (replace the placeholder with your key):</p>
        <pre style={{ overflowX: "auto", maxWidth: "100%", fontSize: 12 }}>{configuration}</pre>
        <button onClick={() => void copy(configuration, "config")}>{copied === "config" ? "Copied configuration" : "Copy configuration"}</button>
        <p>Clients that require OAuth-only connections cannot use this API-key connection.</p>
      </div></article>
    </div>
    {token ? <div className="token-reveal" role="status"><b>Your API key is ready. Copy it now; it is shown only once.</b><code style={{ overflowWrap: "anywhere" }}>{token}</code><button onClick={() => void copy(token, "key")}>{copied === "key" ? "Copied API key" : "Copy API key"}</button><button onClick={() => { setToken(""); setCopied(""); }}>Done — hide key</button></div> : null}
    <article className="terminal-card"><div className="terminal-card-head"><span>Your API keys</span><b>{keys.filter(active).length} ACTIVE</b></div>
      <div className="token-list">{keys.map(key => <div key={key.id} className={active(key) ? "" : "revoked"}><p><b>{key.name}</b><small>{key.token_prefix}… · expires {new Date(key.expires_at).toLocaleDateString()} · {key.last_used_at ? "last used " + new Date(key.last_used_at).toLocaleString() : "never used"}</small></p><span>{key.scopes.join(" · ")}</span>{active(key) ? <button disabled={busy} onClick={() => void revoke(key.id)}>Revoke</button> : <em>{key.revoked_at ? "Revoked" : "Expired"}</em>}</div>)}
        {!keys.length ? <div className="workspace-empty">{loading ? "Loading API keys…" : "No API keys yet. Create your first key above."}</div> : null}
      </div>
    </article>
  </>;
}
