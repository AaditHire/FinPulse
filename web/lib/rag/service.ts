import { createHash, randomUUID } from "node:crypto";
import "server-only";

import type { Citation } from "@/lib/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { chunkDocument } from "./chunk";
import { embedTexts } from "./embeddings";

export type IngestDocumentInput = {
  ownerId: string;
  title: string;
  text: string;
  sourceType: "filing" | "news" | "macro" | "upload" | "web";
  sourceUrl?: string;
  publisher?: string;
  publishedAt?: string;
  assetId?: string;
  storagePath?: string;
  metadata?: Record<string, unknown>;
};

async function enforceDatabaseCapacity(ownerId: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Supabase service role is required for ingestion.");
  const { data, error } = await admin.rpc("database_size_report", { p_owner_id: ownerId });
  if (error) throw error;
  const report = data as { utilizationPercent?: number } | null;
  const utilization = Number(report?.utilizationPercent ?? 0);
  if (utilization >= 70) await admin.rpc("prune_expired_data", { p_owner_id: ownerId });
  if (utilization >= 80) throw new Error("Database capacity is above 80%; nonessential ingestion is paused until data is pruned or capacity is upgraded.");
}

export async function ingestDocument(input: IngestDocumentInput) {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Supabase service role is required for ingestion.");
  await enforceDatabaseCapacity(input.ownerId);
  const chunks = chunkDocument(input.text);
  if (!chunks.length) throw new Error("No indexable text was found.");
  const contentHash = createHash("sha256").update(`${input.sourceUrl ?? "upload"}\n${input.text}`).digest("hex");
  const { data: existing } = await admin.from("documents").select("id").eq("owner_id", input.ownerId).eq("content_hash", contentHash).maybeSingle();
  if (existing) return { documentId: existing.id, chunks: 0, duplicate: true, embeddingModel: null, embeddingDegraded: false };
  const documentId = randomUUID();
  const embedding = await embedTexts(chunks.map((chunk) => `${chunk.heading ?? input.title}\n${chunk.content}`));
  const { error: documentError } = await admin.from("documents").insert({
    id: documentId, owner_id: input.ownerId, asset_id: input.assetId, source_type: input.sourceType,
    title: input.title, source_url: input.sourceUrl, publisher: input.publisher,
    published_at: input.publishedAt, storage_path: input.storagePath, content_hash: contentHash,
    metadata: { ...input.metadata, embeddingModel: embedding.model, embeddingDegraded: embedding.degraded },
  });
  if (documentError) throw documentError;
  const rows = chunks.map((chunk, index) => ({
    id: randomUUID(), owner_id: input.ownerId, document_id: documentId, chunk_index: chunk.index,
    heading: chunk.heading, content: chunk.content, token_count: chunk.tokenCount,
    embedding: JSON.stringify(embedding.vectors[index]), metadata: chunk.metadata,
  }));
  const { error: chunksError } = await admin.from("document_chunks").insert(rows);
  if (chunksError) {
    await admin.from("documents").delete().eq("id", documentId);
    throw chunksError;
  }
  return { documentId, chunks: rows.length, duplicate: false, embeddingModel: embedding.model, embeddingDegraded: embedding.degraded };
}

export async function searchDocuments(ownerId: string, query: string, count = 6): Promise<Citation[]> {
  const admin = createSupabaseAdminClient();
  if (!admin) return [];
  const embedding = await embedTexts([query]);
  const { data, error } = await admin.rpc("match_document_chunks", {
    p_owner_id: ownerId,
    p_query_text: query,
    p_query_embedding: JSON.stringify(embedding.vectors[0]),
    p_match_count: Math.min(Math.max(count, 1), 6),
    p_rrf_k: 50,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    chunkId: String(row.chunk_id), documentId: String(row.document_id), title: String(row.title),
    sourceUrl: row.source_url ? String(row.source_url) : `/api/research/documents/${String(row.document_id)}?chunk=${encodeURIComponent(String(row.chunk_id))}`,
    publisher: row.publisher ? String(row.publisher) : undefined,
    publishedAt: row.published_at ? String(row.published_at) : undefined,
    heading: row.heading ? String(row.heading) : undefined,
    excerpt: String(row.content), score: Number(row.score),
  }));
}
