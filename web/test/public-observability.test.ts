import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  admin: vi.fn(),
  configured: vi.fn(() => true),
  fred: vi.fn(),
  bls: vi.fn(),
  worldBank: vi.fn(),
  ecb: vi.fn(),
  bea: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: mocks.admin }));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: mocks.configured }));
vi.mock("@/lib/sources/macro", () => ({
  fetchFredSeries: mocks.fred,
  fetchBlsSeries: mocks.bls,
  fetchWorldBankSeries: mocks.worldBank,
  fetchEcbSeries: mocks.ecb,
  fetchBeaDataset: mocks.bea,
}));

import { GET as getHealth } from "@/app/api/data-health/route";
import { GET as getMacro } from "@/app/api/market/macro/route";

describe("public read-only portfolio endpoints", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_OWNER_ID", "00000000-0000-0000-0000-000000000001");
    mocks.fred.mockReset();
    mocks.bls.mockReset();
    mocks.admin.mockReset();
  });

  it("serves official macro observations without an owner session", async () => {
    mocks.fred.mockResolvedValue({ provider: "FRED", series: "UNRATE", observations: [{ date: "2026-08-01", value: 4.2 }] });

    const response = await getMacro(new Request("https://finpulse.example/api/market/macro?provider=fred&series=UNRATE"));

    expect(response.status).toBe(200);
    expect(mocks.fred).toHaveBeenCalledWith("UNRATE");
    expect(await response.json()).toMatchObject({ provider: "FRED", series: "UNRATE" });
  });

  it("limits the public macro proxy to the series shown in the portfolio UI", async () => {
    const response = await getMacro(new Request("https://finpulse.example/api/market/macro?provider=fred&series=PRIVATE_SERIES"));

    expect(response.status).toBe(400);
    expect(mocks.fred).not.toHaveBeenCalled();
  });

  it("returns sanitized health telemetry without private policy or error fields", async () => {
    const providerResult = { data: [{ provider: "FRED", status: "healthy", latency_ms: 120, last_success_at: "2026-09-13T06:00:00.000Z", checked_at: "2026-09-13T06:00:00.000Z" }], error: null };
    const keepaliveResult = { data: { checked_at: "2026-09-13T06:00:00.000Z" }, error: null };
    mocks.admin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: { databaseBytes: 2048, utilizationPercent: 0.1, relations: { private_documents: 1024 } }, error: null }),
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            order: () => table === "provider_health"
              ? Promise.resolve(providerResult)
              : { limit: () => ({ maybeSingle: () => Promise.resolve(keepaliveResult) }) },
          }),
        }),
      }),
    });

    const response = await getHealth();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      configured: true,
      database: { databaseBytes: 2048, utilizationPercent: 0.1 },
      providers: providerResult.data,
      keepalive: keepaliveResult.data,
    });
    expect(JSON.stringify(payload)).not.toContain("relations");
    expect(JSON.stringify(payload)).not.toContain("error_message");
  });
});
