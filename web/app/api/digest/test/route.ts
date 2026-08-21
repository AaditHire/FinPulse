import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function pythonCommand(): Promise<{ command: string; args: string[] }> {
  const candidates = [
    process.env.PYTHON_EXECUTABLE,
    path.resolve(process.cwd(), "..", ".venv", "Scripts", "python.exe"),
    process.env.USERPROFILE ? path.join(process.env.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe") : undefined,
  ].filter((value): value is string => Boolean(value));
  for (const command of candidates) {
    try { await access(command); return { command, args: [] }; } catch { /* Try the next runtime. */ }
  }
  return process.platform === "win32" ? { command: "py", args: ["-3.11"] } : { command: "python3", args: [] };
}

export async function POST() {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.GROQ_API_KEY) {
    return NextResponse.json({ error: "Email and Groq server credentials must be connected first." }, { status: 400 });
  }
  const runtime = await pythonCommand();
  const root = path.resolve(process.cwd(), "..");
  const result = await new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(/* turbopackIgnore: true */ runtime.command, [...runtime.args, "-m", "agent.main", "--test"], { cwd: root, env: process.env, windowsHide: true });
    let output = "";
    child.stdout.on("data", (chunk) => { output += String(chunk); });
    child.stderr.on("data", (chunk) => { output += String(chunk); });
    child.on("error", (error) => resolve({ code: -1, output: error.message }));
    child.on("close", (code) => resolve({ code, output }));
  });
  if (result.code !== 0) {
    const safeMessage = result.output.split(/\r?\n/).filter(Boolean).at(-1) ?? "The test digest failed.";
    return NextResponse.json({ error: safeMessage.replace(/gsk_[A-Za-z0-9_-]+/g, "[hidden]") }, { status: 500 });
  }
  const count = Number(result.output.match(/Digest sent with (\d+) articles/)?.[1] ?? 0);
  return NextResponse.json({ sent: true, articleCount: count });
}
