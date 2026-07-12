import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { sanitizeHtml } from "@/lib/utils/sanitize";
import { apiErrorResponse } from "@/lib/errors";
import { messageBroker, NEW_MESSAGE } from "@/lib/ws/broker";
import { sendDmNotificationEmail } from "@/lib/services/email";
import { authorizeDmRequest } from "@/lib/messaging/api-authorize";
import {
  findConversation,
  findOrCreateConversation,
} from "@/lib/messaging/find-or-create-conversation";

// NB: l'helper condiviso `findConversation` / `findOrCreateConversation` è in
// `@/lib/messaging/find-or-create-conversation` (Fase 2.2). Usa `upsert` per
// race-safety (Postgres `INSERT ... ON CONFLICT DO UPDATE`) invece della
// vecchia sequenza findUnique + create, che aveva una race condition nota.
// Questo file contiene solo la logica di business (POST/GET/PATCH sui
// messaggi); l'helper di persistenza è isolato e testato separatamente.

/**
 * GET /api/messages?with=<userId>&productId=<productId>&cursor=<id>&limit=50
 *
 * Phase 1.6: il check autorizzativo è centralizzato in
 * resolveMessagingPermission (e nel suo wrapper authorizeDmRequest).
 * Se la DM non è autorizzata (es. Order refunded, prodotto senza creator),
 * rispondiamo 403/404 senza consultare il DB delle Conversation.
 */
export const GET = withRateLimit(async function GET(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const withUserId = searchParams.get("with");
    const productId = searchParams.get("productId") || undefined;
    const cursor = searchParams.get("cursor") || undefined;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 100);

    if (!withUserId) {
      return NextResponse.json({ error: "Parametro 'with' obbligatorio" }, { status: 400 });
    }

    if (!productId) {
      return NextResponse.json(
        { error: "Parametro 'productId' obbligatorio" },
        { status: 400 },
      );
    }

    if (withUserId === dbUser.id) {
      return NextResponse.json(
        { error: "Non puoi visualizzare una conversazione con te stesso" },
        { status: 400 },
      );
    }

    // Sanity-check presenza otherUser (resolver non controlla che il
    // target esista come User; questo check inline dà un 404 pulito).
    const otherUser = await prisma.user.findUnique({
      where: { id: withUserId },
      select: { id: true },
    });
    if (!otherUser) {
      return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
    }

    // ── Permission check (Phase 1.6 single source of truth) ─────
    const auth = await authorizeDmRequest({
      actorId: dbUser.id,
      targetId: withUserId,
      productId,
    });
    if (!auth.allowed) {
      return auth.response;
    }

    const conversation = await findConversation(dbUser.id, withUserId, productId);

    if (!conversation) {
      return NextResponse.json(
        { error: "Accesso negato — nessuna conversazione con questo utente su questo prodotto" },
        { status: 403 },
      );
    }

    // Cursor-based: fetch one extra to determine if there's a next page
    const messages = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      include: {
        sender: {
          select: { id: true, name: true, image: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const page = hasMore ? messages.slice(0, limit) : messages;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return NextResponse.json({ messages: page, nextCursor });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}, "AUTH");

/**
 * POST /api/messages
 * Invia un nuovo messaggio.
 * Body: { receiverId: string, content: string, productId: string }
 *
 * Phase 1.6: il check autorizzativo passa da authorizeDmRequest →
 * resolveMessagingPermission. Niente più check sparsi qui.
 */
export const POST = withRateLimit(async function POST(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const body = await request.json();
    const { receiverId, content, productId } = body;

    if (!receiverId || !content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json({ error: "receiverId, content e productId sono obbligatori" }, { status: 400 });
    }

    if (!productId || typeof productId !== "string") {
      return NextResponse.json({ error: "productId è obbligatorio" }, { status: 400 });
    }

    if (content.length > 5000) {
      return NextResponse.json({ error: "Il messaggio non può superare 5000 caratteri" }, { status: 400 });
    }

    // Impedisci auto-invio (defense-in-depth: anche il resolver lo cattura,
    // ma il check inline evita un DB hit per il caso più ovvio).
    if (receiverId === dbUser.id) {
      return NextResponse.json(
        { error: "Non puoi inviare un messaggio a te stesso" },
        { status: 400 },
      );
    }

    // ── Permission check (Phase 1.6 single source of truth) ─────
    const auth = await authorizeDmRequest({
      actorId: dbUser.id,
      targetId: receiverId,
      productId,
    });
    if (!auth.allowed) {
      return auth.response;
    }

    // NB: ProductNotFound è già coperto dal resolver (caso ProductNotFound
    // → 404). NON ripetere la query prodotto inline: sarebbe un secondo
    // source of truth, violerebbe il principio "tutta la regex dal
    // resolver" di Fase 1.6. Idem per la verifica di esistenza User
    // partner (la sua mancanza verrebbe catturata dal fail della
    // Conversation.create con FK).

    // Lookup minimal del receiver per i dati usati a valle (email
    // notification, broker event senza nuove query).
    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
      select: { id: true, email: true, lastSeenAt: true },
    });
    if (!receiver) {
      return NextResponse.json({ error: "Destinatario non trovato" }, { status: 404 });
    }

    // Trova o crea la conversazione (ordinamento deterministico)
    const conversation = await findOrCreateConversation(dbUser.id, receiverId, productId);

    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: dbUser.id,
        content: sanitizeHtml(content.trim()),
      },
      include: {
        sender: {
          select: { id: true, name: true, image: true, role: true },
        },
      },
    });

    // Emit to WebSocket broker for real-time delivery to connected clients.
    // Phase 1.3: includiamo productId così il bridge WS può filtrare i
    // messaggi al solo participant della conversazione-prodotto (evita
    // data-leak cross-prodotto tra partecipanti diversi).
    //
    // Fase 4.3: includiamo anche `receiverId` (= l'altro partecipante,
    // NON il sender). Questo permette al bridge di fan-out
    // `inboxUpdate` verso tutti gli WS subscribed all'inbox del
    // receiver (multi-tab della dashboard, sidebar nav, conversation-
    // list, notifications-dropdown) — utile per aggiornare il badge
    // "non letti" senza page refresh.
    //
    // Per conversation uno-a-uno, receiverId = partner. Per future
    // chat di gruppo è il logical "primary recipient" da decidere.
    const partnerId =
      conversation.userOneId === dbUser.id
        ? conversation.userTwoId
        : conversation.userOneId;

    messageBroker.emit(NEW_MESSAGE, {
      conversationId: conversation.id,
      productId,
      receiverId: partnerId,
      message: {
        ...message,
        createdAt: message.createdAt.toISOString(),
      },
    });

    // Send email notification if receiver appears offline.
    const OFFLINE_THRESHOLD_MS = 5 * 60 * 1000;
    const isOffline =
      receiver.lastSeenAt != null &&
      Date.now() - receiver.lastSeenAt.getTime() > OFFLINE_THRESHOLD_MS;

    if (isOffline && receiver.email) {
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conversation.id,
          senderId: { not: receiver.id },
          read: false,
        },
      });

      if (unreadCount <= 1) {
        sendDmNotificationEmail(
          receiver.email,
          dbUser.name || dbUser.email?.split("@")[0] || "Uno studente",
          "en",
        ).catch((err) => console.error("[dm-email] Failed to send:", err));
      }
    }

    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}, "MESSAGES");
