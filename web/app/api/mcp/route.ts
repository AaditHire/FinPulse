import { createMcpHandler } from "@modelcontextprotocol/server";
import { authenticateRequest, authErrorResponse } from "@/lib/auth";
import { createFinPulseMcpServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function validateRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  if (host && host !== requestUrl.host) throw new Error("Invalid Host header.");
  const origin = request.headers.get("origin");
  const allowed = new Set([requestUrl.origin, ...(process.env.MCP_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean)]);
  if (origin && !allowed.has(origin)) throw new Error("Origin is not allowed.");
}

async function handle(request: Request) {
  try {
    validateRequestOrigin(request);
    const principal = await authenticateRequest(request);
    const handler = createMcpHandler(() => createFinPulseMcpServer(principal));
    return await handler.fetch(request);
  } catch (error) { return authErrorResponse(error); }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
