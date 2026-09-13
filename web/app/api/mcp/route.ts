import { createMcpHandler } from "@modelcontextprotocol/server";
import { AuthError, authenticateRequest, authErrorResponse } from "@/lib/auth";
import { createFinPulseMcpServer } from "@/lib/mcp/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function validateRequestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!origin) return;

  const normalizeOrigin = (value: string, status = 500) => {
    try { return new URL(value).origin; }
    catch { throw new AuthError(status === 403 ? "Origin is not allowed." : "Invalid origin configuration.", status); }
  };
  const allowed = new Set([
    requestUrl.origin,
    ...(process.env.MCP_ALLOWED_ORIGINS ?? "").split(",").map((value) => value.trim()).filter(Boolean).map(normalizeOrigin),
  ]);
  if (!allowed.has(normalizeOrigin(origin, 403))) throw new AuthError("Origin is not allowed.", 403);
}

async function handle(request: Request) {
  try {
    validateRequestOrigin(request);
    const principal = await authenticateRequest(request);
    if (principal.kind === "local") throw new AuthError("Create an owner API key before connecting an MCP client.", 401);
    const handler = createMcpHandler(() => createFinPulseMcpServer(principal));
    const response = await handler.fetch(request);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) { return authErrorResponse(error); }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
