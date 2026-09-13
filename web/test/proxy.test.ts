import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

describe("public dashboard routing", () => {
  it("loads the dashboard directly without an authentication redirect", () => {
    const response = proxy(new NextRequest("https://finpulse.example/"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("retires the login page by redirecting it to the dashboard", () => {
    const response = proxy(new NextRequest("https://finpulse.example/login?next=%2F"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://finpulse.example/");
  });

  it("leaves private API authorization to the route handlers", () => {
    const response = proxy(new NextRequest("https://finpulse.example/api/mcp/tokens"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
