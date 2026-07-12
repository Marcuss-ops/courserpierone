import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";
import { loadAuthorizedConversation } from "@/lib/messaging/load-authorized-conversation";
import { createMessageAndNotify } from "@/lib/messaging/create-message";

/**
 * GET /api/conversations/[id]/messages?cursor=<msgId>&limit=<n>
 *
 * Fase 2.3 del piano DMs: endpoint REST keyato su `Conversation.id`
 * (path URL segment) invece che sulla coppia legacy (otherUserId +
 * productId). Più RESTful, più coerente con `/api/messages/stream`
 * (Fase 4.1) e `/api/messages/read` PATCH (Fase 1.6).
 *
 * Pipeline canonica:
 *   1. auth (401 anon)
 *   2. loadAuthorizedConversation(dbUserId, conversationId):
 *      a. Conversation.findUnique (404)
 *      b. membership precheck (403)
 *      c. derive (partnerId, productId)
 *      d. authorizeDmRequest sanity per retro-compat (refund)
 *   3. cursor-based query: `prisma.message.findMany` con limit+1 per
 *      determinare `hasMore`.
 *
 * Status: L'UNICA route messages GET canonica. Il legacy `/api/messages`
 * GET è stato rimosso in commit `chore(dm): delete legacy /api/messages
 * routes + shim`, consolidate su `/api/conversations`.
 *
 * Rate limit tier "AUTH" (lettura, OK alta freq). Non usare MESSAGES
 * (tier scrittura, troppo stretto per scroll/polling frequenti).
 */
export const GET = withRateLimit(async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { id: conversationId } = await params;

    const { conversation } = await loadAuthorizedConversation(
      dbUser.id,
      conversationId,
    );

    // ── Cursor-based pagination ───────────────────────────────
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get("cursor") || undefined;
    // Default 50, max 100 (match legacy /api/messages GET contract).
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "50", 10) || 50,
      100,
    );

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
      take: limit + 1, // +1 per determinare hasMore
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
 * POST /api/conversations/[id]/messages
 *
 * Fase 2.3: invia un nuovo messaggio nella Conversation indicata
 * dall'URL. Body: { content: string }.
 *
 * Differenze rispetto a legacy /api/messages POST:
 *   - conversationId è nel PATH (canonical REST), non derivato
 *     server-side da (otherUserId, productId).
 *   - Non c'è più upsert di Conversation: si assume che il client
 *     abbia prima chiamato `/api/conversations POST { productId,
 *     targetUserId }` per ottenere il conversationId. Questo è un
 *     refactor REST-orthogonal: la gestione del "find or create
 *     conversation" è demandata all'endpoint canonico.
 *   - `receiverId` per il WS broker è derivato dalla Conversation
 *     via `loadAuthorizedConversation` (partnerId).
 *
 * Validation:
 *   - content obbligatorio, non vuoto, ≤ 5000 chars.
 *   - authorizeDmRequest è una sanity (refund retroattivo).
 *
 * Response: 201 con `{ message, conversationId }` per coerenza
 * con legacy POST.
 */
export const POST = withRateLimit(async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, dbUser } = await getServerUser();
    if (!user?.email || !dbUser) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
    }

    const { id: conversationId } = await params;

    // ── Input validation ─────────────────────────────────────
    const body = await request.json();
    const { content } = body ?? {};

    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "content è obbligatorio" },
        { status: 400 },
      );
    }

    if (content.length > 5000) {
      return NextResponse.json(
        { error: "Il messaggio non può superare 5000 caratteri" },
        { status: 400 },
      );
    }

    // ── Pipeline autorizzativa canonica ───────────────────────
    const { conversation, partnerId } = await loadAuthorizedConversation(
      dbUser.id,
      conversationId,
    );

    // ── Create + broker.emit + offline email (orchestrated helper) ──
    const created = await createMessageAndNotify({
      conversation,
      sender: {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
      },
      partnerId,
      content,
    });

    return NextResponse.json(
      { message: created, conversationId: conversation.id },
      { status: 201 },
    );
  } catch (error) {
    return apiErrorResponse(error, "Errore interno");
  }
}, "MESSAGES");
