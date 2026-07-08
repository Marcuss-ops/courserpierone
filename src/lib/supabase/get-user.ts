import { createClient } from "./server";
import { prisma } from "@/lib/db/prisma";

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
 */
export async function getServerUser() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return { supabase, user: null, dbUser: null };
  }

  // Sync con Prisma usando upsert (evita race condition)
  // Aggiorna nome/immagine solo se ci sono dati nuovi dai metadata
  const updateData: Record<string, string | null> = {};
  if (user.user_metadata?.full_name) updateData.name = user.user_metadata.full_name;
  if (user.user_metadata?.avatar_url) updateData.image = user.user_metadata.avatar_url;

  const dbUser = await prisma.user.upsert({
    where: { email: user.email },
    update: Object.keys(updateData).length > 0 ? updateData : {},
    create: {
      email: user.email,
      name: user.user_metadata?.full_name ?? user.email.split("@")[0],
      image: user.user_metadata?.avatar_url ?? null,
      role: "student", // sempre student per nuovi utenti
    },
  });

  return { supabase, user, dbUser };
}
