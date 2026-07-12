import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";
import { createHmac } from "crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * GET /api/auth/ws-token
 *
 * Due scope supportati (Fase 4.1 + Fase 4.3):
 *
 *   1. **Conversation scope** (?conversationId=<id>)
 *      Token firmato sulla tripla `userId:conversationId:timestamp`.
 *      WS upgrade handler usa questo token per aprire una sottoscrizione
 *      alla Conversation specifica (con DB membership check).
 *
 *   2. **Inbox scope** (?scope=inbox)
 *      Token firmato su `userId:inbox:timestamp`.
 *      WS upgrade handler usa questo token per aprire una sottoscrizione
 *      IMPLICITA a TUTTE le conversation di cui l'utente è membro.
 *      Il client riceve `inboxUpdate` events quando QUALSIASI sua
 *      conversation riceve un nuovo messaggio, permettendo di aggiornare
 *      i badge "non letti" senza page refresh.
 *
 * Format token: `userId:<scope_marker>:timestamp:signature` (4-part).
 * HMAC-SHA256 di `userId:<scope_marker>:timestamp` con WS_SECRET.
 * Expires after 5 minutes.
 *
 * Verifica lato WS upgrade (server.ts):
 *   1. timestamp entro 5 minuti
 *   2. firma HMAC corrisponde
 *   3. scope_marker matcha `?conversationId` o `?scope=inbox`
 *   4. per conversation scope: DB membership (userOneId OR userTwoId)
 *      per inbox scope: nessun check extra (l'utente firma per sé stesso)
 */
export async function GET(request: NextRequest) {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get("conversationId");
  const scope = searchParams.get("scope");

  // ── Case 1: Inbox scope (Fase 4.3) ─────────────────────────
  // Firmato su userId:inbox:timestamp. Nessuna DB lookup: il client
  // sta chiedendo di ascoltare la propria inbox personale, non una
  // conversation specifica. Il WS upgrade handler (server.ts) skippa
  // il membership check sulla Conversation e usa `inboxClients` cache.
  if (scope === "inbox") {
    const secret = process.env.WS_SECRET ?? "dev-secret-change-in-production";
    const timestamp = Date.now();
    const payload = `${dbUser.id}:inbox:${timestamp}`;
    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex")
      .slice(0, 16);
    const token = `${dbUser.id}:inbox:${timestamp}:${signature}`;

    return NextResponse.json({
      token,
      userId: dbUser.id,
      scope: "inbox",
      expiresAt: timestamp + 5 * 60 * 1000,
    });
  }

  // ── Case 2: Conversation scope (Fase 4.1) ──────────────────
  if (!conversationId) {
    return NextResponse.json(
      {
        error:
          "specifica `conversationId` (subscript per-conv) oppure `scope=inbox` (Fase 4.3)",
      },
      { status: 400 },
    );
  }

  // ── Membership check DB-side (pre-firma) ──────────────────
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

  // ── Firme HMAC con conversationId nel payload ────────────────
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
