import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), session: vi.fn(), owner: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: mocks.session }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true, ownerEmails: () => new Set(["owner@example.com"]) }));
vi.mock("@/lib/agents/runtime", () => ({ runResearchAgent: vi.fn() }));
vi.mock("@/lib/market", () => ({ buildDashboardData: vi.fn() }));
vi.mock("@/lib/rag/service", () => ({ searchDocuments: vi.fn() }));

import { authenticateRequest } from "@/lib/auth";
import { POST } from "@/app/api/mcp/route";

function request(method: string, params?: unknown) {
  return new Request("https://finpulse.example/api/mcp", {
    method: "POST", headers: { Authorization: "Bearer fp_test", "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, ...(params ? { params } : {}) }),
  });
}
async function rpc(response: Response) {
  const text = await response.text();
  const data = text.split("\n").find(line => line.startsWith("data: "));
  return JSON.parse(data ? data.slice(6) : text);
}
let record: Record<string, unknown>;
let updated: ReturnType<typeof vi.fn>;
beforeEach(() => {
  record = { id: "key-1", owner_id: "owner-1", scopes: ["portfolio:read"], expires_at: "2099-01-01", revoked_at: null };
  updated = vi.fn().mockResolvedValue({ error: null });
  mocks.admin.mockReturnValue({ from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: record, error: null }) }) }),
    update: () => ({ eq: updated }),
  }) });
  mocks.session.mockReset();
});
describe("MCP bearer authentication", () => {
  it("executes last-used update and accepts case-insensitive Bearer", async () => {
    const principal = await authenticateRequest(new Request("https://finpulse.example", { headers: { Authorization: "bearer fp_test" } }));
    expect(principal.kind).toBe("pat");
    expect(updated).toHaveBeenCalled();
  });
  it("rejects revoked, expired and insufficient-scope keys", async () => {
    record.revoked_at = "2026-01-01";
    await expect(authenticateRequest(request("tools/list"))).rejects.toThrow("Invalid or expired");
    record.revoked_at = null; record.expires_at = "2000-01-01";
    await expect(authenticateRequest(request("tools/list"))).rejects.toThrow("Invalid or expired");
    record.expires_at = "2099-01-01";
    await expect(authenticateRequest(request("tools/list"), ["research:read"])).rejects.toThrow("Missing scope");
  });
  it("does not fall back to cookies for invalid authorization", async () => {
    await expect(authenticateRequest(new Request("https://finpulse.example", { headers: { Authorization: "Basic test" } }))).rejects.toThrow("Use Authorization");
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it("validates a supplied JWT with Supabase", async () => {
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: "owner-1", email: "owner@example.com" } }, error: null });
    mocks.session.mockResolvedValue({ auth: { getUser } });
    await authenticateRequest(new Request("https://finpulse.example", { headers: { Authorization: "Bearer jwt-value" } }));
    expect(getUser).toHaveBeenCalledWith("jwt-value");
  });
});
describe("Streamable HTTP protocol", () => {
  it("initializes using the legacy protocol supported by existing clients", async () => {
    const response = await POST(request("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } }));
    expect(response.status).toBe(200);
    expect((await rpc(response)).result.serverInfo.name).toBe("finpulse");
  });
  it("discovers only the tools allowed by the API key", async () => {
    const response = await POST(request("tools/list"));
    expect(response.status).toBe(200);
    const result = await rpc(response);
    expect(result.result.tools.map((tool: { name: string }) => tool.name)).toEqual(["portfolio_get_holdings", "portfolio_risk"]);
  });
  it("rejects disallowed origins before authenticating", async () => {
    const req = request("tools/list");
    req.headers.set("origin", "https://attacker.example");
    expect((await POST(req)).status).toBe(403);
  });
});
