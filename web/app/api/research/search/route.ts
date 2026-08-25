import { z } from "zod";
import { authErrorResponse, requireOwner } from "@/lib/auth";
import { searchDocuments } from "@/lib/rag/service";

const SearchSchema = z.object({ query: z.string().trim().min(2).max(600), count: z.number().int().min(1).max(6).default(6) });

export async function POST(request: Request) {
  try {
    const principal = await requireOwner();
    const body = SearchSchema.parse(await request.json());
    return Response.json({ query: body.query, citations: await searchDocuments(principal.ownerId, body.query, body.count) });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid search" }, { status: 400 });
    return authErrorResponse(error);
  }
}
