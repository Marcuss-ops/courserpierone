import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";
import { isAdmin } from "@/lib/auth/roles";

/**
 * Require an authenticated admin user.
 * Returns a NextResponse with 401/403 if not authorized, otherwise null.
 *
 * Behavior unchanged from the previous version — solo il confronto sul ruolo
 * passa dall'helper tipizzato `isAdmin` per centralizzare la definizione di
 * "admin" e facilitare future aggiunte (es. "creator" come variante).
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const { user, dbUser } = await getServerUser();

  if (!user?.email || !dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdmin(dbUser.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
