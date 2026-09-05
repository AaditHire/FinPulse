import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ owner: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireOwner: state.owner, authErrorResponse: () => Response.json({ error: "unauthorized" }, { status: 401 }) }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: state.admin }));
import { POST, DELETE } from "@/app/api/mcp/tokens/route";
beforeEach(() => { state.owner.mockResolvedValue({ ownerId: "owner-1", kind: "session" }); });
it("returns the key once but stores only its hash and owner", async () => {
  let inserted: Record<string, unknown> = {};
  state.admin.mockReturnValue({ from: () => ({ insert: (row: Record<string, unknown>) => {
    inserted = row;
    return { select: () => ({ single: async () => ({ data: { id: "key-1" }, error: null }) }) };
  } }) });
  const response = await POST(new Request("https://example.com/api/mcp/tokens", { method: "POST", body: JSON.stringify({ name: "Research", scopes: ["research:read"], expiresInDays: 7 }) }));
  expect(response.status).toBe(201);
  const { token } = await response.json();
  expect(token).toMatch(/^fp_[A-Za-z0-9_-]{43}$/);
  expect(inserted.token_hash).toBe(createHash("sha256").update(token).digest("hex"));
  expect(inserted.owner_id).toBe("owner-1");
  expect(JSON.stringify(inserted)).not.toContain(token);
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("rejects unknown scopes and invalid revocation IDs", async () => {
  const response = await POST(new Request("https://example.com/api/mcp/tokens", { method: "POST", body: JSON.stringify({ name: "Bad", scopes: ["admin"] }) }));
  expect(response.status).toBe(400);
  expect((await DELETE(new Request("https://example.com/api/mcp/tokens?id=invalid"))).status).toBe(400);
});
