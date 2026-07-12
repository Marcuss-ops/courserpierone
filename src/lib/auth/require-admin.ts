import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";

/**
 * Require an authenticated admin user.
 * Returns a NextResponse with 401/403 if not authorized, otherwise null.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const { user, dbUser } = await getServerUser();

  if (!user?.email || !dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (dbUser.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}
