/**
 * src/lib/messaging/resolve-message-permission.ts
 *
 * Permission resolver per i DM creator↔studente.
 *
 * Questa è L'UNICA FONTE DI VERITÀ per la matrice di autorizzazioni
 * della messaggistica. Tutti i call site (route handler REST, WS
 * bridge, hook di notifica, future inbox) DEVONO passare da questa
 * funzione invece di reinventare i check sparsi nel codice.
 *
 * Piano DMs (Fase 1.5):
 *   Permettere il DM quando:
 *     • actor  = creator del prodotto
 *       target = studente con Order.status = 'completed' per quel prodotto
 *     • oppure le parti invertite (studente → creator)
 *
 *   Negare il DM quando:
 *     • actor == target (auto-messaggio)
 *     • il prodotto non esiste
 *     • il prodotto non ha un creator (Product.creatorId = NULL) E non
 *       esiste un admin di fallback (legacy pre-1.4)
 *     • entrambi i partecipanti sono creator (nessuno studente nel pair)
 *     • entrambi i partecipanti sono studenti (nessun creator nel pair)
 *     • lo studente non ha Order.status = 'completed' per quel prodotto
 *     • il target user non esiste (best-effort: il check esatto
 *       viene fatto dal chiamante via prisma.user.findUnique; qui
 *       filtriamo solo via il fatto che non può essere creator/studente
 *       del pair prodotto)
 *
 * Convenzioni di naming (allineate al prompt originale):
 *   "creator" = l'account che possiede uno o più prodotti
 *   "studente" = l'utente che ha acquistato (o potenzialmente acquisterà)
 *                un prodotto del creator
 *
 * Il resolver NON effettua direttamente chiamate API: ritorna
 * `allowed: boolean` con diagnostica (`reason`) per consentire al
 * chiamante di tradurre in HTTP 403 / WS subscription refused / UI
 * feedback coerenti.
 */

import { prisma } from "@/lib/db/prisma";

/**
 * Esito del permission resolver.
 *
 * - `allowed: true`  → la DM è autorizzata tra actor e target su quel prodotto
 * - `allowed: false` → la DM è negata; consultare `reason` per capire perché
 *
 * `creatorId` e `studentId` sono valorizzati in entrambi i casi (tranne
 * `studentId` quando il pair non è ancora identificabile) — sono utili
 * al chiamante per non dover rieseguire il lookup.
 */
export type MessagingPermission = {
  allowed: boolean;
  creatorId?: string;
  studentId?: string;
  productId: string;
  reason?: string;
};

export type ResolveMessagingPermissionInput = {
  actorId: string;
  targetId: string;
  productId: string;
};

/**
 * Motivi di deny — stringhe stabili che le API / UI possono consumare.
 */
export const MessagingDenyReason = {
  /** actor == target: nessuno può auto-mandarsi DM */
  SelfMessage: "self_message_blocked",
  /** productId non esiste (404 upstream) */
  ProductNotFound: "product_not_found",
  /**
   * Prodotto legacy con creatorId NULL che non ha admin di fallback
   * — scenario di pre-Fase-1.4; non dovrebbe accadere dopo il bootstrap.
   */
  NoCreatorForProduct: "no_creator_for_product",
  /**
   * I due partecipanti non sono coppia (creator, student) sul prodotto:
   * entrambi creator, entrambi student di quel prodotto, o entrambi
   * utenti random senza alcun legame con il prodotto.
   */
  NotCreatorStudentPair: "not_creator_student_pair",
  /** Lo studente identificato non ha un Order.completed per il prodotto */
  NoCompletedOrderForStudent: "no_completed_order_for_student",
} as const;

export type MessagingDenyReasonValue =
  (typeof MessagingDenyReason)[keyof typeof MessagingDenyReason];

/**
 * Risolve i permessi di una DM creator↔studente su un prodotto specifico.
 *
 * Pattern "creator/student":
 *   - creator = User.id === Product.creatorId (con fallback al primo admin
 *     legacy se Product.creatorId è NULL, mantenuto per transizione V1→V2)
 *   - student = l'altro partecipante, che DEVE avere un Order.completed
 *     per quel prodotto
 *
 * Casi particolari (auto-invio, prodotto inesistente, prodotto senza
 * creator) sono gestiti con `allowed: false` + `reason` valorizzato.
 */
export async function resolveMessagingPermission(
  input: ResolveMessagingPermissionInput,
): Promise<MessagingPermission> {
  const { actorId, targetId, productId } = input;

  // ── 0. Sanity: actor == target → self-message ───────────────
  if (actorId === targetId) {
    return {
      allowed: false,
      productId,
      reason: MessagingDenyReason.SelfMessage,
    };
  }

  // ── 1. Product esiste? ──────────────────────────────────────
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, creatorId: true },
  });
  if (!product) {
    return {
      allowed: false,
      productId,
      reason: MessagingDenyReason.ProductNotFound,
    };
  }

  // ── 2. Resolve the creator ──────────────────────────────────
  // Product.creatorId è nullable in V1 (legacy pre-Fase 1.4).
  // Fallback: il primo admin per createdAt ascendente agisce come
  // "creator primario" implicitamente. Questo garantisce che un
  // prodotto legacy senza creatorId possa ancora avere studenti
  // che contattano l'admin principale (comportamento storico
  // precedente la Fase 1.2).
  let creatorId: string | null = product.creatorId;
  if (!creatorId) {
    const fallback = await prisma.user.findFirst({
      where: { role: "admin" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!fallback) {
      return {
        allowed: false,
        productId,
        reason: MessagingDenyReason.NoCreatorForProduct,
      };
    }
    creatorId = fallback.id;
  }

  // ── 3. Identifica chi è creator e chi è student nel pair ─────
  const actorIsCreator = actorId === creatorId;
  const targetIsCreator = targetId === creatorId;

  // Esattamente uno dei due deve essere creator. Se entrambi sono
  // creator (admin cooperative) o nessuno dei due è creator (entrambi
  // studenti di altri prodotti, o entrambi utenti random), nega.
  if (actorIsCreator === targetIsCreator) {
    return {
      allowed: false,
      creatorId: creatorId ?? undefined,
      productId,
      reason: MessagingDenyReason.NotCreatorStudentPair,
    };
  }

  // ── 4. Identifica lo student effettivo nel pair ──────────────
  const studentId = actorIsCreator ? targetId : actorId;

  // ── 5. Lo student deve avere un Order.completed sul prodotto ──
  // Query ottimizzata: usa l'indice composito esistente
  // @@index([userId, productId, status]) su Order (vedi schema.prisma).
  const completedOrder = await prisma.order.findFirst({
    where: {
      userId: studentId,
      productId,
      status: "completed",
    },
    select: { id: true },
  });
  if (!completedOrder) {
    return {
      allowed: false,
      creatorId: creatorId ?? undefined,
      studentId,
      productId,
      reason: MessagingDenyReason.NoCompletedOrderForStudent,
    };
  }

  // ── Tutto verde — la DM è autorizzata ────────────────────────
  return {
    allowed: true,
    creatorId: creatorId ?? undefined,
    studentId,
    productId,
  };
}
