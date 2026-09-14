import { PROVIDERS } from "@/lib/providers/registry";

export async function GET() {
  return Response.json({ providers: PROVIDERS });
}
