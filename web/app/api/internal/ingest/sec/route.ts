import { z } from "zod";
import { authErrorResponse } from "@/lib/auth";
import { fetchSecFilings, fetchSecFilingText } from "@/lib/sources/sec";
import { ingestDocument } from "@/lib/rag/service";

const Schema = z.object({ symbol: z.string().trim().toUpperCase().regex(/^[A-Z.]{1,8}$/), limit: z.number().int().min(1).max(8).default(4) });

export async function POST(request: Request) {
  try {
    const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (!process.env.INTERNAL_API_SECRET || supplied !== process.env.INTERNAL_API_SECRET) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const ownerId = process.env.SUPABASE_OWNER_ID;
    if (!ownerId) return Response.json({ error: "SUPABASE_OWNER_ID is required for ingestion." }, { status: 503 });
    const body = Schema.parse(await request.json());
    const index = await fetchSecFilings(body.symbol);
    const results = [];
    for (const filing of index.filings.slice(0, body.limit)) {
      const text = await fetchSecFilingText(filing.url);
      results.push(await ingestDocument({ ownerId, title: filing.title, text, sourceType: "filing", sourceUrl: filing.url, publisher: "U.S. SEC", publishedAt: filing.filedAt ? `${filing.filedAt}T00:00:00.000Z` : undefined, metadata: { symbol: body.symbol, form: filing.form, accession: filing.accession } }));
    }
    return Response.json({ symbol: body.symbol, indexed: results });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    return authErrorResponse(error);
  }
}
