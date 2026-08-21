import "server-only";

const MODELS_URL = "https://api.groq.com/openai/v1/models";
const PREFERRED_MODELS = [
  "openai/gpt-oss-120b",
  "qwen/qwen3.6-27b",
  "openai/gpt-oss-20b",
] as const;

type ModelsPayload = { data?: Array<{ id?: string; active?: boolean }> };

export async function selectGroqModel(apiKey: string): Promise<string> {
  const response = await fetch(MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    if (response.status === 401) throw new Error("Groq rejected this key.");
    throw new Error(`Groq model discovery failed (${response.status}).`);
  }
  const payload = await response.json() as ModelsPayload;
  const available = new Set((payload.data ?? []).filter((model) => model.active !== false).map((model) => model.id).filter((id): id is string => Boolean(id)));
  const configuredModel = process.env.GROQ_MODEL?.trim();
  const preference = [...new Set([configuredModel, ...PREFERRED_MODELS].filter((model): model is string => Boolean(model)))];
  const selected = preference.find((model) => available.has(model));
  if (!selected) throw new Error("This Groq project does not currently allow a supported text model.");
  return selected;
}

export function modelLabel(model: string): string {
  if (model === "openai/gpt-oss-120b") return "GPT-OSS 120B";
  if (model === "openai/gpt-oss-20b") return "GPT-OSS 20B";
  if (model === "qwen/qwen3.6-27b") return "QWEN 3.6 27B";
  return model;
}
