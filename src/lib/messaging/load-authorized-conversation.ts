/**
 * src/lib/messaging/load-authorized-conversation.ts
 *
 * Helper per le nuove Route Handler Fase 2.3 del piano DMs
 * (keyate su Conversation.id invece che su coppia otherUserId+productId).
 *
 * Pipeline canonica (single source of truth):
 *   1. Conversation.findUnique({ id, ... }) — O(1) via primary key.
 *   2. Membership precheck inline (no extra DB hit): l'utente DEVE
 *      essere userOne o userTwo della Conversation. ❌ membership →
 *      403 (no info-leak sulla presenza di ID conversazione non propri).
 *   3. Deriva `partnerId` (l'altro partecipante rispetto a me) e
 *      `productId` dalla row Conversation stessa.
 *   4. authorizeDmRequest({ actorId=me, targetId=partnerId, productId })
 *      → se deny, ritorna un NextResponse strutturato dal wrapper api-authorize
 *      (400 self / 404 product / 403 not creator-student / 403 no order).
 *      Questo step è la "retro-compat sanity": se l'Order.completed
 *      originariamente associato alla Conversation è stato rimborsato
 *      dopo la sua creazione, la POST message successiva deve essere
 *      negata. Il solo membership check (step 2) sarebbe insufficiente.
 *
 * Convenzioni:
 *   - `partnerId` è sempre valorizzato (la Conversation per definitione
 *     ha esattamente 2 partecipanti: userOne !== userTwo).
 *   - Il partner per definizione NON è l'utente corrente. Se la query
 *     ritornasse un partner === me (impossibile per schema ma difesa
 *     profonda), viene lanciato AppError 500 invece di auto-messaggio.
 *
 * Caller contract: questo helper throws AppError per qualunque fallimento
 * che la route dovrebbe tradurre in risposta HTTP. Le route possono
 * racchiuderlo in try/catch + apiErrorResponse helper.
 */

import { prisma } from "@/lib/db/prisma";
import { authorizeDmRequest } from "@/lib/messaging/api-authorize";
import { AppError, ValidationError, NotFoundError } from "@/lib/errors";

export interface AuthorizedConversation {
  /** Conversation row (full select — caller può accedere a qualsiasi campo). */
  conversation: {
    id: string;
    userOneId: string;
    userTwoId: string;
    productId: string;
    createdAt: Date;
    updatedAt: Date;
  };
  /** L'altro partecipante della Conversation (sempre != dbUserId). */
  partnerId: string;
  /** Product.id a cui è scoped la Conversation (usato dal resolver). */
  productId: string;
}

/**
 * Carica una Conversation per id, valida membership, deriva partner+product,
 * e applica authorizeDmRequest come sanity per retro-compat (es. Order refund
 * post-creazione della Conversation).
 *
 * Se tutto OK → ritorna AuthorizedConversation.
 * Se membership mancante → AppError statusCode 403 (no info-leak su ID).
 * Se Conversation inesistente → AppError statusCode 404.
 * Se `id` mancante → ValidationError 400.
 * Se authorizeDmRequest nega → AppError typed con status + reason dal mapping
 *   di api-authorize (es. 403/404/409). Le route caller possono catturare
 *   l'errore tramite `apiErrorResponse` che ispeziona `error.statusCode` + `error.code`.
 *
 * IMPORTANTE: questa helper throws SEMPRE oggetti di tipo `Error` (mai `NextResponse`
 * o altri oggetti plain). Il motivo è che `apiErrorResponse` nelle route
 * ispeziona `error instanceof AppError` → status + body italiani corretti
 * (403 / 404 / 409), e cade su 500 generico per qualunque NON-AppError.
 * Throwing `NextResponse` direttamente avrebbe causato il fallback 500,
 * rendendo INVISIBILI i 403/404/409 che l'api-authorize aveva correttamente
 * mappato. Vedi errata Fase 2.3 prima review.
 */
export async function loadAuthorizedConversation(
  dbUserId: string,
  conversationId: string | null | undefined,
): Promise<AuthorizedConversation> {
  // ── 1. Input validation (Fase 2.3 URL parse failures) ───────
  if (!conversationId || typeof conversationId !== "string") {
    throw new ValidationError("conversationId è obbligatorio");
  }

  // ── 2. Conversation lookup (O(1) via PK) ────────────────────
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      userOneId: true,
      userTwoId: true,
      productId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!conversation) {
    // Non esponiamo 404 vs 403 differential nel caso in cui l'ID
    // appartenga ad un'altra persona: preferiamo il 403 membership
    // check (sotto) che è coerente con la risposta sbagliata-data.
    // Tuttavia se l'ID è syntatticamente valido ma non esiste,
    // 404 è informativo e non leak. Qui il throw consente alle
    // route di scegliere 404 esplicito. Per Fase 2.3, route
    // possono optare per 404 (più chiaro in dev) o 403 (più
    // security-by-obscurity).
    throw new NotFoundError("Conversazione non trovata");
  }

  // ── 3. Membership precheck inline (no DB hit) ───────────────
  if (
    conversation.userOneId !== dbUserId &&
    conversation.userTwoId !== dbUserId
  ) {
    // Defense-in-depth: questo 403 non leak che la conversation esiste.
    // Per info-leak mitigation V2 potremmo uniformarlo al NotFoundError.
    throw new AppError("Accesso negato — non sei partecipante di questa conversazione", {
      statusCode: 403,
      code: "NOT_CONVERSATION_MEMBER",
    });
  }

  // ── 4. Deriva partnerId + productId ─────────────────────────
  const partnerId =
    conversation.userOneId === dbUserId
      ? conversation.userTwoId
      : conversation.userOneId;

  // Sanity defense-in-depth: la membership check dovrebbe escludere
  // questo caso (userOne !== userTwo per schema), ma se un admin tool
  // riuscisse a forzare userOne === userTwo, evitiamo auto-messaggio.
  if (partnerId === dbUserId) {
    throw new AppError("Malformed Conversation: partnerId === dbUserId", {
      statusCode: 500,
      code: "MALFORMED_CONVERSATION",
    });
  }

  // ── 5. authorizeDmRequest as retro-compat sanity check ──────
  // La Conversation row potrebbe essere stata creata quando l'utente
  // aveva Order.completed, ma successivamente l'ordine potrebbe essere
  // stato rimborsato. La Conversation non viene cancellata
  // automaticamente (FK CASCADE su Product none su Order.status update),
  // quindi serve un re-check del resolver ad ogni operazione.
  const auth = await authorizeDmRequest({
    actorId: dbUserId,
    targetId: partnerId,
    productId: conversation.productId,
  });
  if (!auth.allowed) {
    // Traduce la decisione di api-authorize (NextResponse con status + reason)
    // in un AppError typed cosi che apiErrorResponse nelle route possa
    // preservare il mapping dei deny (403/404/409) invece di cadere su 500.
    //
    // Estrae status dal NextResponse originale, reason dal permesso, e il
    // messaggio user-facing dal body JSON. NB: `await auth.response.json()`
    // rigenera una copia del body (il NextResponse non è single-use lato
    // response.json(), è una re-serializzazione). Se nel futuro dovesse
    // servire preservare l'EXACT body, basterebbe clonare il buffer.
    const status = auth.response.status;
    const body = await auth.response.json().catch(() => ({}));
    throw new AppError(body.error ?? "DM non autorizzata", {
      statusCode: status,
      code: body.reason ?? "DM_DENIED",
    });
  }

  return {
    conversation,
    partnerId,
    productId: conversation.productId,
  };
}
