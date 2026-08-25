import type { Specialist } from "./routing";

export type SpecialistConfig = {
  name: string;
  toolGroups: Array<"market" | "research" | "macro" | "portfolio">;
  instruction: string;
  evaluationScore: number;
};

export const SPECIALISTS: Record<Specialist, SpecialistConfig> = {
  market: { name: "Market data specialist", toolGroups: ["market", "research"], instruction: "Prioritize quote provenance, exchange coverage, freshness, price history, and conflicting market sources.", evaluationScore: 0 },
  filings: { name: "Filings and news specialist", toolGroups: ["research"], instruction: "Prioritize exact filing/news passages, filing dates, issuer language, and period-to-period distinctions.", evaluationScore: 0 },
  macro: { name: "Macro specialist", toolGroups: ["macro", "research"], instruction: "Prioritize official series, observation versus release dates, revisions, units, and cross-region comparability.", evaluationScore: 0 },
  portfolio: { name: "Portfolio analytics specialist", toolGroups: ["portfolio", "market", "research"], instruction: "Use deterministic exposure and contribution arithmetic; never infer suitability or recommend allocation changes.", evaluationScore: 0 },
  research: { name: "General research specialist", toolGroups: ["research", "market"], instruction: "Compare retrieved evidence, expose disagreements and missing context, and avoid unsupported causal claims.", evaluationScore: 0 },
};

export function secondSpecialistEligible(singleScore: number, delegatedScore: number) {
  return process.env.ENABLE_SECOND_SPECIALIST === "true" && delegatedScore - singleScore >= 5;
}
