import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@/lib/agents/runtime", () => ({ runResearchAgent: mocks.run }));

import { POST as runPortfolioAgent } from "@/app/api/agent/run/route";
import { POST as runResearchAgent } from "@/app/api/agents/run/route";

const result = {
  runId: "run-1",
  query: "Portfolio summary",
  answer: "**Portfolio risk** - Markets remain mixed [1].",
  citations: [{ title: "Market update", sourceUrl: "https://example.com", excerpt: "Evidence", score: 1 }],
  status: "completed" as const,
  specialist: "portfolio" as const,
  model: "test-model",
  confidence: 82,
};

describe("anonymous AI demo", () => {
  beforeEach(() => {
    mocks.run.mockReset();
    mocks.run.mockResolvedValue(result);
    vi.stubEnv("GROQ_API_KEY", "server-key");
  });

  it("runs the portfolio brief without an owner session", async () => {
    const response = await runPortfolioAgent(new NextRequest("https://finpulse.example/api/agent/run", {
      method: "POST",
      body: JSON.stringify({ holdings: [{ symbol: "AAPL", quantity: 2, kind: "stock" }] }),
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.analysis.overview).toBe("Portfolio risk\n• Markets remain mixed [1].");
    expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: "00000000-0000-0000-0000-000000000000",
      includePrivateResearch: false,
    }));
  });

  it("runs a cited research question without private-corpus access", async () => {
    const response = await runResearchAgent(new Request("https://finpulse.example/api/agents/run", {
      method: "POST",
      body: JSON.stringify({ query: "What changed in markets today?", holdings: [] }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith(expect.objectContaining({ includePrivateResearch: false }));
  });
});
