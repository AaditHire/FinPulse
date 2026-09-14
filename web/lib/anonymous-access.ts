import "server-only";

export const ANONYMOUS_OWNER_ID = "00000000-0000-0000-0000-000000000000";

type Window = { count: number; resetAt: number };
const windows = new Map<string, Window>();

export function anonymousRateLimit(request: Request, limit = 6) {
  const now = Date.now();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || request.headers.get("x-real-ip") || "local";
  const current = windows.get(key);
  const window = !current || current.resetAt <= now ? { count: 0, resetAt: now + 60_000 } : current;
  window.count += 1;
  windows.set(key, window);
  if (windows.size > 1_000) {
    for (const [entry, value] of windows) if (value.resetAt <= now) windows.delete(entry);
  }
  if (window.count <= limit) return null;
  return Response.json(
    { error: "The AI demo is busy. Please wait a minute and try again." },
    { status: 429, headers: { "Retry-After": String(Math.max(1, Math.ceil((window.resetAt - now) / 1000))) } },
  );
}
