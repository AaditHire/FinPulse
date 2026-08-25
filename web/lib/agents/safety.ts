const EXECUTION_PATTERNS = [
  /\b(?:buy|sell|short|long)\s+(?:now|today|at|above|below|\$?\d)/i,
  /\b(?:entry|exit)\s+(?:price|point|level)/i,
  /\b(?:stop[- ]loss|take[- ]profit|position size|order type)\b/i,
  /\b(?:place|execute|submit)\s+(?:an?\s+)?order\b/i,
];

export function enforceResearchOnlyAnswer(answer: string, evidenceCount: number) {
  if (EXECUTION_PATTERNS.some((pattern) => pattern.test(answer))) throw new Error("Research-only guardrail rejected executable trading guidance.");
  const references = [...answer.matchAll(/\[(\d+)]/g)].map((match) => Number(match[1]));
  if (!references.length) throw new Error("Citation guardrail rejected an uncited synthesis.");
  if (references.some((reference) => reference < 1 || reference > evidenceCount)) throw new Error("Citation guardrail rejected an unknown evidence reference.");
  return references;
}
