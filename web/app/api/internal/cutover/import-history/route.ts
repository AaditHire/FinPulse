import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const Schema = z.object({ version: z.literal(1), articles: z.array(z.object({ article_id: z.string().min(1), url: z.string().url(), ticker: z.string(), title: z.string(), sent_at: z.string().datetime() })).max(100000) });

export async function POST(request: Request) {
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.INTERNAL_API_SECRET || supplied !== process.env.INTERNAL_API_SECRET) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ownerId = process.env.SUPABASE_OWNER_ID; const admin = createSupabaseAdminClient();
  if (!ownerId || !admin) return Response.json({ error: "Supabase cutover is not configured." }, { status: 503 });
  try {
    const body = Schema.parse(await request.json());
    const rows = body.articles.map((article) => ({ owner_id: ownerId, content_hash: article.article_id, url: article.url, symbol: article.ticker, title: article.title, sent_at: article.sent_at, imported_from: "python-sqlite" }));
    for (let index = 0; index < rows.length; index += 500) { const { error } = await admin.from("sent_articles").upsert(rows.slice(index, index + 500), { onConflict: "owner_id,content_hash", ignoreDuplicates: true }); if (error) throw error; }
    return Response.json({ imported: rows.length });
  } catch (error) { if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message }, { status: 400 }); return Response.json({ error: error instanceof Error ? error.message : "Import failed" }, { status: 502 }); }
}
