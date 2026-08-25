import { NextRequest, NextResponse } from "next/server";
import { ownerEmails } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const requestedType = request.nextUrl.searchParams.get("type");
  if (!code && !tokenHash) return NextResponse.redirect(new URL("/login?error=missing-code", request.url));
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.redirect(new URL("/login?error=not-configured", request.url));
  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({
        token_hash: tokenHash!,
        type: requestedType === "email" ? "email" : "magiclink",
      });
  const allowlist = ownerEmails();
  const email = data.user?.email?.toLowerCase();
  if (error || !email || !allowlist.size || !allowlist.has(email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=unauthorized", request.url));
  }
  return NextResponse.redirect(new URL("/", request.url));
}
