import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Server-side Supabase client — da usare in:
 * - Server Components
 * - Route Handlers (API routes)
 * - Server Actions
 *
 * Legge automaticamente i cookie per la sessione.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Può fallire in Server Components — gestito da middleware
          }
        },
      },
    }
  );
}

/**
 * Ottiene l'utente corrente dalla sessione Supabase.
 * Restituisce l'user object o null se non autenticato.
 * 
 * Uso:
 *   const { user } = await getCurrentUser();
 *   if (!user) redirect("/login");
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { supabase, user: null };
  return { supabase, user };
}
