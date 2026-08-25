import { z } from "zod";
import { authErrorResponse, requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireOwner();
    const { id } = await context.params;
    const documentId = z.string().uuid().parse(id);
    const chunkId = new URL(request.url).searchParams.get("chunk");
    const admin = createSupabaseAdminClient();
    if (!admin) return Response.json({ error: "Supabase is required." }, { status: 503 });
    const [document, chunks] = await Promise.all([
      admin.from("documents").select("id,title,source_type,source_url,publisher,published_at,ingested_at,metadata").eq("owner_id", principal.ownerId).eq("id", documentId).maybeSingle(),
      admin.from("document_chunks").select("id,chunk_index,heading,content,token_count").eq("owner_id", principal.ownerId).eq("document_id", documentId).order("chunk_index"),
    ]);
    if (document.error || chunks.error) throw document.error ?? chunks.error;
    if (!document.data) return Response.json({ error: "Document not found" }, { status: 404 });
    const selected = chunkId ? chunks.data?.find((chunk) => chunk.id === chunkId) : undefined;
    return Response.json({ document: document.data, selectedChunk: selected ?? null, chunks: chunks.data ?? [] });
  } catch (error) { return authErrorResponse(error); }
}
