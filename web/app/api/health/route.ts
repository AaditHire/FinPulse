import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    integrations: {
      marketData: true,
      newsFeeds: true,
      groq: Boolean(process.env.GROQ_API_KEY),
      email: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_TO),
    },
  });
}
