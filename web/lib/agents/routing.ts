import type { ResearchAnswer } from "@/lib/types";

export type Specialist = ResearchAnswer["specialist"];

export function selectSpecialist(query: string): Specialist {
  const normalized = query.toLowerCase();
  if (/10-[kq]|8-k|filing|sec|earnings|guidance/.test(normalized)) return "filings";
  if (/inflation|gdp|unemployment|rate|yield|fed|ecb|macro|cpi/.test(normalized)) return "macro";
  if (/portfolio|holding|allocation|exposure|risk|drawdown/.test(normalized)) return "portfolio";
  if (/price|quote|chart|market|stock|crypto|bitcoin|ethereum/.test(normalized)) return "market";
  return "research";
}
