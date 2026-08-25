import { createHash } from "node:crypto";
import "server-only";

type Extractor = ((input: string | string[], options: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): unknown }>) & { dispose(): Promise<void> };

const MODEL_ID = process.env.EMBEDDING_MODEL ?? "onnx-community/all-MiniLM-L6-v2-ONNX";
let extractorPromise: Promise<Extractor> | null = null;

function hashEmbedding(text: string) {
  const vector = new Array<number>(384).fill(0);
  const terms = text.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [];
  for (const term of terms) {
    const digest = createHash("sha256").update(term).digest();
    const index = digest.readUInt16BE(0) % vector.length;
    vector[index] += digest[2] % 2 ? 1 : -1;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / norm);
}

async function getExtractor() {
  extractorPromise ??= import("@huggingface/transformers").then(async ({ env, pipeline }) => {
    env.allowRemoteModels = true;
    env.allowLocalModels = true;
    env.useFSCache = true;
    return await pipeline("feature-extraction", MODEL_ID, { dtype: "q8", device: "cpu" }) as unknown as Extractor;
  });
  return extractorPromise;
}

export async function embedTexts(texts: string[]) {
  if (!texts.length) return { vectors: [] as number[][], model: MODEL_ID, degraded: false };
  try {
    const extractor = await getExtractor();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    const raw = output.tolist();
    if (!Array.isArray(raw)) throw new Error("Embedding model returned an invalid tensor");
    const vectors = (Array.isArray(raw[0]) ? raw : [raw]) as number[][];
    if (vectors.some((vector) => vector.length !== 384)) throw new Error("Embedding model did not return 384 dimensions");
    return { vectors, model: MODEL_ID, degraded: false };
  } catch (error) {
    extractorPromise = null;
    return { vectors: texts.map(hashEmbedding), model: "finpulse-hash-384", degraded: true, error: error instanceof Error ? error.message : "Embedding model unavailable" };
  }
}

export async function disposeEmbeddingModel() {
  if (!extractorPromise) return;
  try { await (await extractorPromise).dispose(); } finally { extractorPromise = null; }
}
