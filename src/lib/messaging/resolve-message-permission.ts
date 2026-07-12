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
 *     • entrambi i partecipanti sono creator (nessuno studente nel pair)
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
 *
 * Fase 4 hardening (migration `20260712210000_creator_id_required_restrict`):
 *   Il deny-reason storico `NoCreatorForProduct` non è più raggiungibile
 *   runtime (la colonna `Product.creatorId` è REQUIRED + FK Restrict a
 *   livello DB). Tuttavia il constant rimane ESPORTATO con tag
 *   `@deprecated` per compatibilità con i consumer già in produzione
 *   (server.ts WS bridge + SSE stream handler + route WS upgrade).
 *   Questi consumer si traducono in "messaggio impossibile" via la
 *   tabella REASON_TO_STATUS in `api-authorize.ts`. Future V2 cleanup:
 *   migrare i consumer ad un deny-reason canonico (es. ProductNotFound
 *   condizionale) e rimuovere il constant.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PR 3 of MCR — Feature-flagged AccessGrant resolver cutover
 * ─────────────────────────────────────────────────────────────────────
 *
 * When `USE_ACCESS_GRANT_RESOLVER=true`, Step 5 reads from
 * `AccessGrant.status='active'` (the new source of truth, dual-written
 * in PR 2). When the flag is off, the legacy `Order.status='completed'`
 * read remains the authority. The cutover sequence is:
 *
 *   1. Staging-only flip on day 0. Monitor `MessagingDenyReason`
 *      counts in the staging log for 1d.
 *   2. If 0 new `NoValidAccessGrant` denies (vs the pre-flip baseline),
 *      proceed to step 3. Otherwise roll back the flag and investigate
 *      the gaps — most likely the backfill script
 *      (`scripts/migrate-grants-from-orders.ts`) didn't complete or a
 *      refund happened post-backfill.
 *   3. Promote flag to production behind a 7d monitoring window. The
 *      baseline for prod is the staging log: `NoValidAccessGrant`
 *      count should be 0 (or in the same low-percentile as
 *      `NoCompletedOrderForStudent`).
 *   4. After 7d of clean prod, remove the legacy Order-based read in
 *      Step 5 (and the `USE_ACCESS_GRANT_RESOLVER` flag, the
 *      `NoCompletedOrderForStudent` deny reason, and the related
 *      `REASON_TO_STATUS` entry in `api-authorize.ts`). Keep the
 *      `MessagingDenyReason.NoValidAccessGrant` constant — it's the
 *      post-cutover canonical reason.
 *
 * The flag is checked at runtime per-call (no module-load caching),
 * so flipping is instantaneous: change env, redeploy, the next
 * request uses the new path. No service restart, no DB migration
 * (the `AccessGrant` table is already in place from PR 2).
 *
 * ─── Known rollout caveat (race window during heavy refund/edit traffic)
 *
 * During the rollout window, when the flag is OFF (legacy), the resolver
 * may transiently deny DM access for orders whose `AccessGrant` was
 * written by PR 2's dual-write but whose `Order.status` hasn't been
 * observed as `'completed'` yet. The narrow window is the time between
 * the `prisma.order.create` and the `prisma.accessGrant.upsert` in
 * `processOrder` (PR 2) — a synchronous sequence in the same handler,
 * so the window is sub-millisecond in practice. The risk surface is:
 *
 *   - heavy refund/edit traffic that re-evaluates `Order.status`
 *     mid-flight (very rare in current product behavior)
 *   - partial-failure scenarios where `Order.create` succeeds but the
 *     `accessGrant.upsert` logs an error and the worker process
 *     crashes (extremely rare — the upsert has a `.catch` defensive
 *     log, see `processOrder` Step 4b)
 *
 * Operationally: monitor `NoCompletedOrderForStudent` (legacy) vs
 * `NoValidAccessGrant` (new) deny counts in the staging log during
 * the 7d rollout. A spike in `NoCompletedOrderForStudent` after the
 * flag flip in staging indicates a backfill gap, not a race — run
 * `scripts/migrate-grants-from-orders.ts` to repair.
 */

import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";

/**
 * Esito del permission resolver.
 *
 * - `allowed: true`  → la DM è autorizzata tra actor e target su quel prodotto
 * - `allowed: false` → la DM è negata; consultare `reason` per capire perché
 *
 * `creatorId` e `customerId` sono valorizzati in entrambi i casi (tranne
 * `customerId` quando il pair non è ancora identificabile) — sono utili
 * al chiamante per non dover rieseguire il lookup.
 */
export interface MessagingPermission {
  allowed: boolean;
  creatorId?: string;
  customerId?: string;
  productId: string;
  reason?: string;
}

export interface ResolveMessagingPermissionInput {
  actorId: string;
  targetId: string;
  productId: string;
}

/**
 * Motivi di deny — stringhe stabili che le API / UI possono consumare.
 *
 * Post-PR 3: `NoValidAccessGrant` è il deny reason canonico per
 * "l'utente non ha un grant attivo per questo prodotto" quando il flag
 * `USE_ACCESS_GRANT_RESOLVER` è ON. `NoCompletedOrderForStudent` resta
 * ESPORTATO per il path legacy (flag OFF) e per la fase di rollout
 * (entrambi i path sono attivi contemporaneamente). Una V2 cleanup
 * rimuoverà `NoCompletedOrderForStudent` dopo che il flag sarà
 * completamente rimosso.
 */
export const MessagingDenyReason = {
  /** actor == target: nessuno può auto-mandarsi DM */
  SelfMessage: "self_message_blocked",
  /** productId non esiste (404 upstream) */
  ProductNotFound: "product_not_found",
  /**
   * @deprecated Post-fase 4 hardening (migration
   * `20260712210000_creator_id_required_restrict`): `Product.creatorId`
   * è ora REQUIRED + FK Restrict a livello DB, di conseguenza questo
   * deny-reason non è più raggiungibile dal resolver. Il constant è
   * mantenuto ESPORTATO per compatibilità con i consumer già in
   * produzione (server.ts WS bridge + src/app/api/conversations/[id]/stream/route.ts
   * SSE handler + src/lib/messaging/api-authorize.ts HTTP error mapper).
   * Poiché il resolver non lo restituisce mai più, le route lo
   * traducono in stato "irragiungibile" come safety net.
   *
   * Future V2 cleanup: migrare i consumer ad un deny-reason canonico
   * (es. un nuovo `ProductIntegrityViolation` per audit purposes) e
   * rimuovere questo constant.
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
  /**
   * PR 3 of MCR — l'utente non ha un AccessGrant.status='active' per
   * il prodotto. È il deny reason canonico post-cutover, attivo solo
   * quando `USE_ACCESS_GRANT_RESOLVER=true`. Convivente con
   * `NoCompletedOrderForStudent` per tutta la durata del rollout.
   */
  NoValidAccessGrant: "no_valid_access_grant",
} as const;

/**
 * Risolve i permessi di una DM creator↔studente su un prodotto specifico.
 *
 * Pattern "creator/student":
 *   - creator = User.id === Product.creatorId (REQUIRED post-fase 4 hardening,
 *     enforciato dalla migration `20260712210000_creator_id_required_restrict`)
 *   - student = l'altro partecipante, che DEVE avere un Order.completed
 *     per quel prodotto (legacy) o un AccessGrant.status='active' (PR 3)
 *
 * Casi particolari (auto-invio, prodotto inesistente) sono gestiti con
 * `allowed: false` + `reason` valorizzato.
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

  // ── 1. Product esiste? ─────────────────────────────────────
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

  // ── 2. Resolve the creator ─────────────────────────────────
  // Post-fase 4 hardening: `Product.creatorId` è REQUIRED (NOT NULL +
  // FK Restrict, migration `20260712210000_creator_id_required_restrict`).
  // Il legacy fallback al "primo admin" per prodotti senza creator è
  // stato rimosso. Se il lookup tornasse un valore nullo qui sarebbe un
  // problema di integrità DB (intervento manuale richiesto, eseguire
  // `npx tsx scripts/products/backfill-primary-creator.ts` come recovery
  // se si tratta di un DB legacy pre-migration).
  const creatorId = product.creatorId;

  // ── 3. Identifica chi è creator e chi è student nel pair ───
  const actorIsCreator = actorId === creatorId;
  const targetIsCreator = targetId === creatorId;

  // Esattamente uno dei due deve essere creator. Se entrambi sono
  // creator (admin cooperative) o nessuno dei due è creator (entrambi
  // studenti di altri prodotti, o entrambi utenti random), nega.
  if (actorIsCreator === targetIsCreator) {
    return {
      allowed: false,
      creatorId,
      productId,
      reason: MessagingDenyReason.NotCreatorStudentPair,
    };
  }

  // ── 4. Identifica lo student effettivo nel pair ────────────
  const customerId = actorIsCreator ? targetId : actorId;

  // ── 5. Lo student deve avere un grant attivo (PR 3) o, in
  // legacy mode, un Order.completed per il prodotto. Il branch è
  // pilotato da USE_ACCESS_GRANT_RESOLVER (default 'false' → legacy).
  //
  // Entrambi i path usano lo stesso indice composito ottimale:
  //   - legacy:    @@index([userId, productId, status]) su Order
  //   - grant:     @@index([userId, productId, status]) su AccessGrant
  //   Stesso piano di esecuzione PG → il flip del flag non cambia la
  //   performance del resolver.
  const useGrantResolver = env.USE_ACCESS_GRANT_RESOLVER === "true";

  if (useGrantResolver) {
    // PR 3 of MCR — AccessGrant-based path (canonical post-cutover).
    const grant = await prisma.accessGrant.findFirst({
      where: {
        userId: customerId,
        productId,
        status: "active",
      },
      select: { id: true },
    });
    if (!grant) {
      return {
        allowed: false,
        creatorId,
        customerId,
        productId,
        reason: MessagingDenyReason.NoValidAccessGrant,
      };
    }
  } else {
    // Legacy Order-based path (in use during the rollout window).
    // Mantenuto per backward compat; verrà rimosso in V2 cleanup
    // (post 7d prod monitoring) insieme al flag e al deny reason
    // `NoCompletedOrderForStudent`. Vedi commento in cima al file.
    const completedOrder = await prisma.order.findFirst({
      where: {
        userId: customerId,
        productId,
        status: "completed",
      },
      select: { id: true },
    });
    if (!completedOrder) {
      return {
        allowed: false,
        creatorId,
        customerId,
        productId,
        reason: MessagingDenyReason.NoCompletedOrderForStudent,
      };
    }
  }

  // ── Tutto verde — la DM è autorizzata ────────────────────────
  return {
    allowed: true,
    creatorId,
    customerId,
    productId,
  };
}
