import "server-only";
import { assertAllowedProviderUrl } from "@/lib/providers/registry";

const SEC_BASE = "https://data.sec.gov";

function secHeaders() {
  return { "User-Agent": process.env.SEC_USER_AGENT ?? "FinPulse research terminal admin@example.com", Accept: "application/json" };
}

async function secJson<T>(url: string): Promise<T> {
  assertAllowedProviderUrl(url);
  const response = await fetch(url, { headers: secHeaders(), cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`SEC returned ${response.status}`);
  return response.json() as Promise<T>;
}

export async function resolveSecCompany(symbol: string) {
  const companies = await secJson<Record<string, { cik_str: number; ticker: string; title: string }>>("https://www.sec.gov/files/company_tickers.json");
  const company = Object.values(companies).find((item) => item.ticker.toUpperCase() === symbol.toUpperCase());
  if (!company) throw new Error(`SEC company not found for ${symbol}`);
  return { cik: String(company.cik_str).padStart(10, "0"), name: company.title, symbol: company.ticker.toUpperCase() };
}

export async function fetchSecFilings(symbol: string) {
  const company = await resolveSecCompany(symbol);
  const payload = await secJson<{ filings?: { recent?: { accessionNumber?: string[]; filingDate?: string[]; reportDate?: string[]; form?: string[]; primaryDocument?: string[]; primaryDocDescription?: string[] } } }>(`${SEC_BASE}/submissions/CIK${company.cik}.json`);
  const recent = payload.filings?.recent;
  const filings = (recent?.form ?? []).flatMap((form, index) => {
    if (!new Set(["10-K", "10-Q", "8-K"]).has(form)) return [];
    const accession = recent!.accessionNumber?.[index];
    const primary = recent!.primaryDocument?.[index];
    if (!accession || !primary) return [];
    const accessionPath = accession.replace(/-/g, "");
    return [{
      form, accession, filedAt: recent!.filingDate?.[index], reportDate: recent!.reportDate?.[index],
      title: recent!.primaryDocDescription?.[index] || `${company.name} ${form}`,
      url: `https://www.sec.gov/Archives/edgar/data/${Number(company.cik)}/${accessionPath}/${primary}`,
    }];
  }).slice(0, 32);
  return { company, filings, sourceUrl: `${SEC_BASE}/submissions/CIK${company.cik}.json`, fetchedAt: new Date().toISOString() };
}

export async function fetchSecFilingText(url: string) {
  const parsed = new URL(url);
  assertAllowedProviderUrl(parsed);
  if (parsed.hostname !== "www.sec.gov" || !parsed.pathname.startsWith("/Archives/edgar/data/")) throw new Error("Only SEC filing archive URLs are allowed.");
  const response = await fetch(url, { headers: { ...secHeaders(), Accept: "text/html" }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`SEC filing returned ${response.status}`);
  return response.text();
}
