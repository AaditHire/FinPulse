import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import "server-only";

import { isSupabaseConfigured, publicSupabaseConfig } from "./config";

export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured()) return null;
  const { url, anonKey } = publicSupabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot set response cookies; proxy.ts refreshes them.
        }
      },
    },
  });
}
