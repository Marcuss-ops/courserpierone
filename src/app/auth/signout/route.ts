import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign-out route — chiamata dal <form action="/auth/signout" method="post"> in dashboard.
 *
 * Solo POST per evitare:
 *   - CSRF (un <img src="/auth/signout"> su un sito malevolo potrebbe loggare fuori l'utente)
 *   - Browser prefetch (alcuni browser pre-fetchono link GET, loggando fuori l'utente a tradimento)
 *   - User-agent prefetching
 *
 * Effettua il logout Supabase e reindirizza alla home.
 */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
