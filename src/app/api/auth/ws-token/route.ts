import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";
import { createHmac } from "crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/auth/ws-token?conversationId=<conversationId>
 *
 * Fase 4.1 del piano DMs: il token è SCOPED a una specifica Conversation.
 * Verifica membership dell'utente sulla Conversation PRIMA di firmare
 * (defense-in-depth: il token firmato è utilizzabile solo per la stessa
 * Conversation; spoofing di un conversationId altrui è bloccato sia
 * dalla firma HMAC sia dal check DB del WS upgrade handler).
 *
 * Format token: `userId:conversationId:timestamp:signature`
 * HMAC-SHA256 di `userId:conversationId:timestamp` con WS_SECRET.
 * Expires after 5 minutes.
 *
 * Verifica lato WS upgrade (server.ts):
 * 1. timestamp entro 5 minuti
 * 2. firma HMAC corrisponde
 * 3. Conversation.id matcha `?conversationId` URL query
 * 4. Conversation.userOneId OR userTwoId == userId (DB membership)
 */
export async function GET(request: NextRequest) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json(
      { error: "conversationId è obbligatorio (Fase 4.1)" },
      { status: 400 },
    );
  }

  // ── Membership check DB-side (pre-firma) ─────────────────
  // Fail-fast: se l'utente non è membro della Conversation, non
  // generiamo il token. Così un client malevolo non ottiene nemmeno
  // un token firmato da provare sull'WS upgrade.
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userOneId: true, userTwoId: true },
  });

  if (!conversation) {
    return NextResponse.json(
      { error: "Conversazione non trovata" },
      { status: 404 },
    );
  }

  if (
    conversation.userOneId !== dbUser.id &&
    conversation.userTwoId !== dbUser.id
  ) {
    return NextResponse.json(
      { error: "Non sei membro di questa conversazione" },
      { status: 403 },
    );
  }

  // ── Firme HMAC con conversationId nel payload ────────────
  const secret = process.env.WS_SECRET ?? "dev-secret-change-in-production";
  const timestamp = Date.now();
  const payload = `${dbUser.id}:${conversationId}:${timestamp}`;
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex")
    .slice(0, 16);

  const token = `${dbUser.id}:${conversationId}:${timestamp}:${signature}`;

  return NextResponse.json({
    token,
    userId: dbUser.id,
    conversationId,
    expiresAt: timestamp + 5 * 60 * 1000,
  });
}
