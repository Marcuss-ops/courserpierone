import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase Auth Callback — gestisce il redirect dopo OAuth (Google) o Magic Link.
 *
 * Behavior:
 *   1. Se arrivano ?code= e ?next=, scambia il code con una sessione
 *   2. Se lo scambio FALLISCE, redirige alla pagina di login con `?oauth_error=...`
 *      così l'utente vede un messaggio comprensibile invece di un redirect silenzioso
 *   3. Se manca il code, redirige al login senza errore
 *   4. Se tutto OK, redirige a `${origin}${next}`
 *
 * Per debug, ogni errore viene loggato server-side con la descrizione completa
 * della causa (mismatch redirect URI, provider disabilitato, code scaduto, ecc).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    // Nessun code → torniamo al login (utente probabilmente ha cancellato i cookie)
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (!error) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  // ── Error path — log dettagli + mostra errore all'utente ──
  console.error("[auth/callback] exchangeCodeForSession failed", {
    code: error.code ?? "unknown",
    status: error.status,
    message: error.message,
    name: error.name,
  });

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("oauth_error", error.message || "unknown_error");
  if (error.code) loginUrl.searchParams.set("oauth_code", error.code);
  // Preserva la destinazione originale così dopo l'utente può riprovare
  if (next && next !== "/dashboard") {
    loginUrl.searchParams.set("next", next);
  }
  return NextResponse.redirect(loginUrl);
}
