import "server-only";
import { sortObservationsNewestFirst } from "@/lib/macro/observations";
import { assertAllowedProviderUrl } from "@/lib/providers/registry";

export type MacroObservation = { date: string; value: number | null };
export type MacroSeries = { provider: string; series: string; label: string; unit?: string; observations: MacroObservation[]; sourceUrl: string; fetchedAt: string; warning?: string };

async function checkedFetch(url: string, init?: RequestInit) {
  assertAllowedProviderUrl(url);
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return response;
}

export async function fetchFredSeries(series: string): Promise<MacroSeries> {
  const key = process.env.FRED_API_KEY;
  if (!key) throw new Error("FRED_API_KEY is not configured");
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", series);
  url.searchParams.set("api_key", key);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  url.searchParams.set("limit", "180");
  const payload = await (await checkedFetch(url.toString())).json() as { observations?: Array<{ date: string; value: string }> };
  const observations = sortObservationsNewestFirst((payload.observations ?? []).map((item) => ({ date: item.date, value: item.value === "." ? null : Number(item.value) })));
  return { provider: "FRED", series, label: series, observations, sourceUrl: `https://fred.stlouisfed.org/series/${encodeURIComponent(series)}`, fetchedAt: new Date().toISOString() };
}

export async function fetchBlsSeries(series: string): Promise<MacroSeries> {
  const endYear = new Date().getUTCFullYear();
  const registrationKey = process.env.BLS_API_KEY;
  const response = await checkedFetch("https://api.bls.gov/publicAPI/v2/timeseries/data/", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seriesid: [series], startyear: String(endYear - 9), endyear: String(endYear), ...(registrationKey ? { registrationkey: registrationKey } : {}) }),
  });
  const payload = await response.json() as { status?: string; message?: string[]; Results?: { series?: Array<{ data?: Array<{ year: string; period: string; value: string }> }> } };
  if (payload.status && payload.status !== "REQUEST_SUCCEEDED") {
    const providerMessage = payload.message?.join(" ") || "BLS did not process the request";
    const keyHint = registrationKey ? "" : " Add BLS_API_KEY to raise the anonymous request allowance.";
    throw new Error(`${providerMessage}${keyHint}`);
  }
  const observations = sortObservationsNewestFirst((payload.Results?.series?.[0]?.data ?? []).flatMap((item) => item.period === "M13" ? [] : [{ date: `${item.year}-${item.period.replace("M", "").padStart(2, "0")}-01`, value: Number(item.value) }]));
  if (!observations.length) throw new Error("BLS returned no observations for this series");
  return { provider: "BLS", series, label: series, observations, sourceUrl: "https://api.bls.gov/publicAPI/v2/timeseries/data/", fetchedAt: new Date().toISOString() };
}

export async function fetchWorldBankSeries(series: string, country = "WLD"): Promise<MacroSeries> {
  const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(series)}?format=json&per_page=100`;
  const payload = await (await checkedFetch(url)).json() as [unknown, Array<{ date: string; value: number | null; indicator?: { value?: string } }>];
  const rows = payload[1] ?? [];
  const observations = sortObservationsNewestFirst(rows.map((item) => ({ date: `${item.date}-01-01`, value: item.value })));
  return { provider: "World Bank", series, label: rows[0]?.indicator?.value ?? series, observations, sourceUrl: url, fetchedAt: new Date().toISOString() };
}

export async function fetchEcbSeries(flow: string, key: string): Promise<MacroSeries> {
  const url = `https://data-api.ecb.europa.eu/service/data/${encodeURIComponent(flow)}/${encodeURIComponent(key)}?format=csvdata&startPeriod=${new Date().getUTCFullYear() - 10}`;
  const csv = await (await checkedFetch(url, { headers: { Accept: "text/csv" } })).text();
  const lines = csv.trim().split(/\r?\n/);
  const headers = lines[0]?.split(",") ?? [];
  const periodIndex = headers.indexOf("TIME_PERIOD");
  const valueIndex = headers.indexOf("OBS_VALUE");
  const observations = sortObservationsNewestFirst(lines.slice(1).flatMap((line) => {
    const cells = line.split(",");
    const value = Number(cells[valueIndex]);
    return periodIndex < 0 || valueIndex < 0 || !Number.isFinite(value) ? [] : [{ date: cells[periodIndex], value }];
  }));
  return { provider: "ECB", series: `${flow}/${key}`, label: `${flow} ${key}`, observations, sourceUrl: url, fetchedAt: new Date().toISOString() };
}

export async function fetchBeaDataset(dataset: string, table: string): Promise<MacroSeries> {
  const key = process.env.BEA_API_KEY;
  if (!key) throw new Error("BEA_API_KEY is not configured");
  const url = new URL("https://apps.bea.gov/api/data");
  Object.entries({ UserID: key, method: "GetData", datasetname: dataset, TableName: table, Frequency: "A", Year: "X", ResultFormat: "JSON" }).forEach(([name, value]) => url.searchParams.set(name, value));
  const payload = await (await checkedFetch(url.toString())).json() as { BEAAPI?: { Results?: { Data?: Array<{ TimePeriod: string; DataValue: string; LineDescription?: string }> } } };
  const rows = payload.BEAAPI?.Results?.Data ?? [];
  const observations = sortObservationsNewestFirst(rows.map((row) => ({ date: `${row.TimePeriod}-01-01`, value: Number(row.DataValue.replace(/,/g, "")) })).filter((row) => Number.isFinite(row.value)));
  return { provider: "BEA", series: `${dataset}/${table}`, label: rows[0]?.LineDescription ?? table, observations, sourceUrl: "https://apps.bea.gov/api/data", fetchedAt: new Date().toISOString() };
}
