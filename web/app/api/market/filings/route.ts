import { z } from "zod";
import { authErrorResponse, requireOwner } from "@/lib/auth";
import { fetchSecFilings } from "@/lib/sources/sec";

export async function GET(request: Request) {
  try {
    await requireOwner();
    const symbol = z.string().regex(/^[A-Z.]{1,8}$/).parse(new URL(request.url).searchParams.get("symbol")?.toUpperCase());
    return Response.json(await fetchSecFilings(symbol));
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ error: "Enter a valid SEC ticker." }, { status: 400 });
    return authErrorResponse(error);
  }
}
