import { createClient } from "./server";
import { prisma } from "@/lib/db/prisma";
import { parseAcceptLanguage } from "@/lib/i18n/locale-resolver";
import { headers } from "next/headers";

/**
 * Helper server-side per ottenere l'utente corrente da Supabase
 * e sincronizzarlo con la tabella Prisma User.
 *
 * Restituisce:
 * - `supabase`: il client Supabase server-side
 * - `user`: l'utente Supabase (null se non autenticato)
 * - `dbUser`: il record Prisma User corrispondente (null se non trovato)
 *
 * Uso in Server Components / Route Handlers:
 *   const { user, dbUser } = await getServerUser();
 *   if (!user) redirect("/login");
 *
 * SICUREZZA: Il ruolo admin NON viene mai letto dai user_metadata
 * (che sono manipolabili lato client). Il ruolo è determinato
 * esclusivamente dal record Prisma esistente o default "student".
 * Nome e immagine vengono aggiornati solo se i metadata contengono
 * dati nuovi e significativi (non sovrascriviamo valori DB esistenti).
 *
 * Phase 1.2 addendum (Accept-Language signup backfill):
 *   - NextRequest header `Accept-Language` viene letto automaticamente
 *     via `next/headers()` — coì tutti i 30+ call site in App Router
 *     ottengono la backfill senza opt-in esplicito.
 *   - Al primo user-create scriviamo User.preferredLocale col primo
 *     segmento del Accept-Language (es. "en-US" → "en"). Se header
 *     assente o vuoto, lo schema `@default("en")` di Prisma si applica.
 *   - NON sovrascriviamo MAI preferredLocale su update (preserva la
 *     scelta manuale dell'utente — es. future settings page).
 *   - Se dbUser esiste già, NON tocchiamo preferredLocale (snapshot
 *     al signup, congelato fino a future V2 settings-page override).
 *   - Se next/headers() lancia (es. chiamato fuori da request scope:
 *     scripts CLI, migration runner), catch e fallback a schema default.
 *
 * Convenzione di storage:
 *   La colonna memorizza il LINGUAGE-ONLY code ("en", "it", "fr", ...)
 *   non il locale canonico "xx-xx" — coerente con `@default("en")` e
 *   con la catena di fallback di `src/lib/services/email.ts` che
 *   estrae il primo segmento via `localeToLanguage()`. Questo evita
 *   mismatch tra il valore di default (literal "en" per spec
 *   compliance) e i valori runtime (canonical "en-us" prodotti da
 *   resolveLocale).
 */
export async function getServerUser() {
  // Gracefully handle missing Supabase env vars (e.g. local dev without .env)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return { supabase: null, user: null, dbUser: null };
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { supabase: null, user: null, dbUser: null };
  }

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return { supabase, user: null, dbUser: null };
  }

  // Sync con Prisma usando upsert (evita race condition)
  // Aggiorna nome/immagine solo se ci sono dati nuovi dai metadata
  const updateData: Record<string, string | null> = {};
  if (user.user_metadata?.full_name) updateData.name = user.user_metadata.full_name;
  if (user.user_metadata?.avatar_url) updateData.image = user.user_metadata.avatar_url;

  // Phase 1.2 addendum: signup backfill del preferredLocale tramite
  // Accept-Language header. Lettura diretta da `next/headers()` per
  // catturare l'header senza propagare il parametro attraverso 30+
  // call sites. Try/catch difensivo: next/headers() lancia fuori da
  // request scope (CLI scripts, migration runner), in quel caso il
  // @default("en") di Prisma si applica.
  //
  // NB: Next.js 15+ ha cambiato la signature di `headers()` da sync a
  // async (Promise<ReadonlyHeaders>); `await` è quindi obbligatorio.
  let signupLocale: string | undefined;
  try {
    const reqHeaders = await headers();
    const acceptLanguage = reqHeaders.get("accept-language");
    const parsed = parseAcceptLanguage(acceptLanguage);
    // "en-US,en;q=0.9,fr;q=0.8" → ["en-us", "en", "fr"] → prendi "en"
    signupLocale = parsed[0]?.split("-")[0]?.toLowerCase();
  } catch {
    // next/headers fuori scope → schema default prende il posto.
    signupLocale = undefined;
  }

  const dbUser = await prisma.user.upsert({
    where: { email: user.email },
    // Update branch: NON tocchiamo preferredLocale. Verrà sovrascritto
    // da update espliciti solo se una future V2 settings page lo consente
    // (es. UserProfile form). Per ora: signup snapshot è immutabile.
    update: Object.keys(updateData).length > 0 ? updateData : {},
    create: {
      email: user.email,
      name: user.user_metadata?.full_name ?? user.email.split("@")[0],
      image: user.user_metadata?.avatar_url ?? null,
      role: "student", // sempre student per nuovi utenti
      // Preferred-locale backfill (Phase 1.2 addendum):
      //   Se abbiamo un Accept-Language valido, scrivilo; altrimenti
      //   Prisma userà il @default("en") dello schema. Mai null.
      ...(signupLocale ? { preferredLocale: signupLocale } : {}),
    },
  });

  return { supabase, user, dbUser };
}
