"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Client-side Supabase client — da usare SOLO nei Client Components.
 * 
 * Uso:
 *   const supabase = createClient();
 *   await supabase.auth.signInWithOAuth({ provider: "google" });
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
