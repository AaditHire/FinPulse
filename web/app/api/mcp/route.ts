import { createMcpHandler } from "@modelcontextprotocol/server";
import { AuthError, authenticateRequest, authErrorResponse } from "@/lib/auth";
import { createFinPulseMcpServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function validateRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  if (host && host !== requestUrl.host) throw new AuthError("Invalid Host header.", 403);
  const origin = request.headers.get("origin");
  const allowed = new Set([requestUrl.origin, ...(process.env.MCP_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean)]);
  if (origin && !allowed.has(origin)) throw new AuthError("Origin is not allowed.", 403);
}

async function handle(request: Request) {
  try {
    validateRequestOrigin(request);
    const principal = await authenticateRequest(request);
    if (principal.kind === "local") throw new AuthError("Sign in and create an MCP API key first.", 401);
    const handler = createMcpHandler(() => createFinPulseMcpServer(principal));
    const response = await handler.fetch(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) { return authErrorResponse(error); }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
