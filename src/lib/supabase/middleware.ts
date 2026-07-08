import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

/**
 * Aggiorna la sessione Supabase via middleware.
 * Chiama `updateSession(request)` all'inizio del middleware globale.
 *
 * IMPORTANTE: NON chiama getUser() — solo refresh del cookie.
 * La verifica dell'utente e dei ruoli avviene nei route handler / server components.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANTE: NON usare supabase.auth.getUser() qui!
  // Il middleware fa SOLO refresh del cookie di sessione.
  // La validazione dell'utente e i check sui ruoli avvengono nei
  // route handler (API) e server components, non qui.
  //
  // Controlliamo solo se c'è un session cookie per i redirect
  // admin, senza validarlo (lo farà la pagina/API route).

  const hasSession = request.cookies.getAll().some(
    (c) => c.name.includes("sb-") && c.name.includes("auth-token")
  );

  return { supabaseResponse, hasSession };
}
