import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";

/**
 * Require an authenticated admin user.
 * Returns a NextResponse with 401/403 if not authorized, otherwise null.
 *
 * NB: `isAdmin` era importato da `@/lib/auth/roles` (rimosso per
 * Fase 7.2 knip cleanup). Inlinato qui come local helper.
 * Valori canonici di `User.role`: "admin" | "creator" | "student".
 */
function isAdmin(role: string | null | undefined): boolean {
  return role === "admin";
}

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
