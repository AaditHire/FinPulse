import { NextRequest, NextResponse } from "next/server";
import { modelLabel, selectGroqModel } from "@/lib/groq";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { apiKey?: string };
    const apiKey = body.apiKey?.trim();
    if (!apiKey) return NextResponse.json({ error: "Paste a Groq API key first." }, { status: 400 });

    const model = await selectGroqModel(apiKey);
    return NextResponse.json({ connected: true, model, modelLabel: modelLabel(model) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not verify the Groq key." }, { status: 400 });
  }
}
