import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  owner: vi.fn(),
  admin: vi.fn(),
  writeLocal: vi.fn(),
  sendDigest: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireOwner: mocks.owner,
  authErrorResponse: (error: unknown) => Response.json({ error: error instanceof Error ? error.message : "unauthorized" }, { status: 500 }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/digest-settings", () => ({
  readDigestSettings: vi.fn(),
  writeDigestSettings: mocks.writeLocal,
}));
vi.mock("@/lib/digest", () => ({ buildAndSendResearchDigest: mocks.sendDigest }));

import { POST as saveSettings } from "@/app/api/digest/settings/route";
import { POST as sendTestDigest } from "@/app/api/digest/test/route";

describe("digest routes", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mocks.owner.mockResolvedValue({ ownerId: "owner-1", kind: "session" });
  });

  it("persists production schedule settings to Supabase without writing serverless files", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.admin.mockReturnValue({
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        upsert,
      }),
    });

    const response = await saveSettings(new Request("https://finpulse.example/api/digest/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ recipient: "owner@example.com", deliveryTime: "08:00", timezone: "Asia/Kolkata", enabled: true }),
    }));

    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ recipient: "owner@example.com", digest_enabled: true }));
    expect(mocks.writeLocal).not.toHaveBeenCalled();
  });

  it("sends test mail through the TypeScript digest service", async () => {
    vi.stubEnv("SMTP_USER", "mailer@example.com");
    vi.stubEnv("SMTP_PASS", "app-password");
    vi.stubEnv("GROQ_API_KEY", "test-key");
    mocks.admin.mockReturnValue({
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { recipient: "owner@example.com" }, error: null }) }) }) }),
    });
    mocks.sendDigest.mockResolvedValue({ runId: "run-1", status: "completed", citations: 4 });

    const response = await sendTestDigest();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: true, articleCount: 4 });
    expect(mocks.sendDigest).toHaveBeenCalledWith({ ownerId: "owner-1", recipient: "owner@example.com", apiKey: "test-key" });
  });
});
