import { createHash } from "node:crypto";
import { z } from "zod";
import { authErrorResponse, requireOwner } from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ingestDocument } from "@/lib/rag/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const JsonDocument = z.object({
  title: z.string().trim().min(2).max(300),
  text: z.string().min(20).max(2_000_000),
  sourceType: z.enum(["filing", "news", "macro", "upload", "web"]).default("web"),
  sourceUrl: z.string().url().optional(),
  publisher: z.string().max(120).optional(),
  publishedAt: z.string().datetime().optional(),
  assetId: z.string().uuid().optional(),
});

async function pdfText(bytes: Uint8Array) {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: bytes });
  try { return (await parser.getText()).text; } finally { await parser.destroy(); }
}

export async function POST(request: Request) {
  try {
    const principal = await requireOwner();
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = JsonDocument.parse(await request.json());
      return Response.json(await ingestDocument({ ownerId: principal.ownerId, ...body }));
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Attach a document." }, { status: 400 });
    if (file.size > 8 * 1024 * 1024) return Response.json({ error: "Direct ingestion is limited to 8MB per file on Vercel." }, { status: 413 });
    const allowed = new Set(["application/pdf", "text/plain", "text/markdown", "text/html", "application/json"]);
    if (!allowed.has(file.type)) return Response.json({ error: "Supported formats: PDF, text, Markdown, HTML, JSON." }, { status: 415 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = file.type === "application/pdf" ? await pdfText(bytes) : new TextDecoder().decode(bytes);
    const admin = createSupabaseAdminClient();
    if (!admin) throw new Error("Supabase is required for uploads.");
    const { data: stored, error: listError } = await admin.storage.from("research-documents").list(principal.ownerId, { limit: 1000 });
    if (listError) throw listError;
    const storedBytes = (stored ?? []).reduce((sum, item) => sum + Number(item.metadata?.size ?? 0), 0);
    if (storedBytes + file.size > 250 * 1024 * 1024) return Response.json({ error: "Owner upload storage is capped at 250MB on the free deployment." }, { status: 413 });
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${principal.ownerId}/${Date.now()}-${createHash("sha1").update(file.name).digest("hex").slice(0, 8)}-${safeName}`;
    const { error: uploadError } = await admin.storage.from("research-documents").upload(path, bytes, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    try {
      return Response.json(await ingestDocument({ ownerId: principal.ownerId, title: String(form.get("title") ?? file.name), text, sourceType: "upload", storagePath: path, publisher: "User upload" }));
    } catch (error) {
      await admin.storage.from("research-documents").remove([path]);
      throw error;
    }
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid document" }, { status: 400 });
    return authErrorResponse(error);
  }
}
