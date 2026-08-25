import { buildDashboardData } from "@/lib/market";
import { sendAlertEmail } from "@/lib/email";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || supplied !== process.env.CRON_SECRET) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ownerId = process.env.SUPABASE_OWNER_ID;
  const admin = createSupabaseAdminClient();
  if (!ownerId || !admin) return Response.json({ error: "Alert evaluator is not configured." }, { status: 503 });
  const { data: rules, error } = await admin.from("alert_rules").select("id,name,rule_type,configuration,assets(symbol,kind)").eq("owner_id", ownerId).eq("status", "active").not("approved_at", "is", null);
  if (error) return Response.json({ error: error.message }, { status: 502 });
  const symbols = (rules ?? []).flatMap((rule) => {
    const asset = Array.isArray(rule.assets) ? rule.assets[0] : rule.assets;
    const config = rule.configuration as Record<string, unknown>;
    const symbol = asset?.symbol ?? (typeof config.symbol === "string" ? config.symbol.toUpperCase() : "");
    const kind = asset?.kind ?? (config.kind === "stock" ? "stock" : "crypto");
    return symbol ? [`${kind}:${symbol}`] : [];
  });
  const dashboard = symbols.length ? await buildDashboardData(symbols.join(",")) : null;
  const [providerHealth, recentNews] = await Promise.all([
    admin.from("provider_health").select("provider,status,error_message").eq("owner_id", ownerId),
    admin.from("news_items").select("title,summary,url,published_at").eq("owner_id", ownerId).gte("published_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(100),
  ]);
  const triggered: string[] = [];
  for (const rule of rules ?? []) {
    const config = rule.configuration as Record<string, unknown>;
    const asset = Array.isArray(rule.assets) ? rule.assets[0] : rule.assets;
    const symbol = asset?.symbol ?? (typeof config.symbol === "string" ? config.symbol.toUpperCase() : "");
    const quote = symbol ? dashboard?.assets.find((item) => item.symbol === symbol) : undefined;
    const threshold = Number(config.threshold);
    const matches = rule.rule_type === "price_above" ? Boolean(quote && quote.price > threshold)
      : rule.rule_type === "price_below" ? Boolean(quote && quote.price < threshold)
      : rule.rule_type === "change_percent" ? Boolean(quote && Math.abs(quote.change24h) >= threshold)
      : rule.rule_type === "provider_health" ? Boolean(providerHealth.data?.some((provider) => provider.status === String(config.status ?? "offline") && (!config.provider || provider.provider === config.provider)))
      : rule.rule_type === "keyword" ? Boolean(recentNews.data?.some((item) => `${item.title} ${item.summary ?? ""}`.toLowerCase().includes(String(config.keyword ?? "").toLowerCase())))
      : false;
    if (!matches) continue;
    const message = quote ? `${rule.name}: ${quote.symbol} is ${quote.price.toLocaleString("en-US", { style: "currency", currency: "USD" })} (${quote.change24h.toFixed(2)}%). Source: ${quote.provenance.provider}, ${quote.provenance.exchangeCoverage}.` : rule.rule_type === "keyword" ? `${rule.name}: the keyword condition matched a recent indexed news item.` : `${rule.name}: provider health condition matched.`;
    const dedupeKey = new Date().toISOString().slice(0, 13);
    const { data: event, error: insertError } = await admin.from("alert_events").insert({ owner_id: ownerId, alert_rule_id: rule.id, observed_value: quote ?? { providerHealth: dashboard?.providerHealth }, message, dedupe_key: dedupeKey }).select("id").maybeSingle();
    if (insertError || !event) continue;
    try {
      await sendAlertEmail(`FinPulse alert: ${rule.name}`, `${message}\n\nResearch only. No order was created or recommended.`);
      await admin.from("alert_events").update({ delivered_at: new Date().toISOString() }).eq("id", event.id);
    } catch (mailError) {
      await admin.from("alert_events").update({ delivery_error: mailError instanceof Error ? mailError.message : "Delivery failed" }).eq("id", event.id);
    }
    triggered.push(rule.name);
  }
  return Response.json({ evaluated: rules?.length ?? 0, triggered });
}
