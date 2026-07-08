import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign-out route — chiamata da <a href="/auth/signout">
 * Effettua il logout Supabase e reindirizza alla home.
 */
export async function GET() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
