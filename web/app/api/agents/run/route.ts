import { z } from "zod";
import { runResearchAgent } from "@/lib/agents/runtime";
import { ANONYMOUS_OWNER_ID, anonymousRateLimit } from "@/lib/anonymous-access";

export const runtime = "nodejs";
export const maxDuration = 60;

const Schema = z.object({
  query: z.string().trim().min(3).max(1200),
  holdings: z.array(z.object({ symbol: z.string().regex(/^[A-Z0-9.=-]{1,16}$/), quantity: z.number().finite().min(0), kind: z.enum(["stock", "crypto"]) })).max(30).default([]),
});

export async function POST(request: Request) {
  try {
    const limited = anonymousRateLimit(request);
    if (limited) return limited;
    const apiKey = request.headers.get("x-groq-api-key")?.trim() || process.env.GROQ_API_KEY;
    if (!apiKey) return Response.json({ error: "Connect Groq or configure GROQ_API_KEY." }, { status: 503 });
    const body = Schema.parse(await request.json());
    return Response.json(await runResearchAgent({ ownerId: ANONYMOUS_OWNER_ID, query: body.query, holdings: body.holdings, apiKey, includePrivateResearch: false }));
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid research request" }, { status: 400 });
    return Response.json({ error: error instanceof Error ? error.message : "Research run failed" }, { status: 502 });
  }
}
