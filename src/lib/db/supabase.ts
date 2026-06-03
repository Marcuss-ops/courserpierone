import { createClient } from "@supabase/supabase-js";

// Lazily create admin client to avoid crashing at import time when env vars are missing
let _supabaseAdmin: ReturnType<typeof createClient> | null = null;

export function getSupabaseAdmin() {
  if (_supabaseAdmin) return _supabaseAdmin;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.warn("⚠️ Supabase admin not configured — SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing");
    return null;
  }

  _supabaseAdmin = createClient(url, serviceKey);
  return _supabaseAdmin;
}
