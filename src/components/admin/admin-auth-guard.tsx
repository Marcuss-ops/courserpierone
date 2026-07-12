import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/supabase/get-user";

/**
 * Admin Auth Guard — server component wrapper.
 * Verifica che l'utente abbia ruolo admin prima di renderizzare l'admin UI.
 * Da usare come wrapper nei layout admin.
 */
export default async function AdminAuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, dbUser } = await getServerUser();

  if (!user?.email || dbUser?.role !== "admin") {
    redirect("/login");
  }

  return <>{children}</>;
}
