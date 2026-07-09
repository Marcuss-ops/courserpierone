import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";

const MAX_NAME_LENGTH = 60;

/**
 * PATCH /api/account/profile
 *
 * Updates the authenticated user's display name in our `User` table.
 * Email is intentionally NOT editable here (would require a verification flow).
 *
 * Body: { name: string }   — non-empty, trimmed, max 60 chars
 * Returns: 200 { success: true, name } | 400 { error } | 401 { error }
 */
export async function PATCH(request: NextRequest) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 });
  }

  const nameRaw = (body as { name?: unknown })?.name;
  if (typeof nameRaw !== "string") {
    return NextResponse.json({ error: "Il campo 'name' è obbligatorio" }, { status: 400 });
  }

  const name = nameRaw.trim();
  if (name.length === 0) {
    return NextResponse.json({ error: "Il nome non può essere vuoto" }, { status: 400 });
  }
  if (name.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `Il nome non può superare ${MAX_NAME_LENGTH} caratteri` },
      { status: 400 }
    );
  }

  try {
    await prisma.user.update({
      where: { id: dbUser.id },
      data: { name },
    });
    return NextResponse.json({ success: true, name });
  } catch (err) {
    console.error("[api/account/profile] PATCH failed", err);
    return NextResponse.json({ error: "Errore interno, riprova" }, { status: 500 });
  }
}
