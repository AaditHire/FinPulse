"use server";

import { headers } from "next/headers";
import { ownerEmails } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { message: string; ok: boolean };

export async function sendMagicLink(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false, message: "Enter a valid email address." };
  const allowlist = ownerEmails();
  if (!allowlist.size) return { ok: false, message: "FINPULSE_OWNER_EMAILS must be configured before sign-in." };
  if (!allowlist.has(email)) return { ok: false, message: "This deployment is restricted to its owner." };
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, message: "Supabase is not configured yet." };
  const origin = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${origin}/auth/callback` } });
  return error ? { ok: false, message: error.message } : { ok: true, message: "Check your inbox for the secure sign-in link." };
}
