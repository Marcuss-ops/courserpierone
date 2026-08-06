/**
 * src/lib/messaging/resolve-message-permission.ts
 *
 * Permission resolver per i DM creator<->studente.
 *
 * Questa è L'UNICA FONTE DI VERITÀ per la matrice di autorizzazioni
 * della messaggistica. Tutti i call site (route handler REST, WS
 * bridge, hook di notifica, future inbox) DEVONO passare da questa
 * funzione invece di reinventare i check sparsi nel codice.
 *
 * Piano DMs (Fase 1.5):
 *   Permettere il DM quando:
 *     - actor  = creator del prodotto
 *       target = studente con AccessGrant.status='active' per quel prodotto
 *     - oppure le parti invertite (studente -> creator)
 *
 *   Negare il DM quando:
 *     - actor == target (auto-messaggio)
 *     - il prodotto non esiste
 *     - entrambi i partecipanti sono creator (nessuno studente nel pair)
 *     - lo studente non ha un AccessGrant attivo per il prodotto
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
 *   (api-authorize.ts HTTP error mapper).
 *
 * ─────────────────────────────────────────────────────────────────────
 * PR 3 of MCR — Step 9 — AccessGrant SSOT cutover (this revision)
 * ─────────────────────────────────────────────────────────────────────
 *
 * The legacy `Order.status="completed"` read and the
 * `USE_ACCESS_GRANT_RESOLVER` feature flag have been REMOVED. The
 * single canonical read is now `resolveProductAccess` (delegates to
 * `AccessGrant.findFirst({status:"active", OR:expiresAt null/future})`).
 * SourceType is not branched on — any active grant qualifies access.
 *
 * The legacy `MessagingDenyReason.NoCompletedOrderForStudent` constant
 * remains EXPORTED with `@deprecated` tag for backward compat with
 * existing consumer code that keys on it; new code should use
 * `MessagingDenyReason.NoValidAccessGrant` (the post-cutover canonical
 * reason, which is the only "no access" reason returned by this
 * resolver).
 */

import { prisma } from "@/lib/db/prisma";
import { resolveProductAccess } from "@/domains/identity";

/**
 * Esito del permission resolver.
 *
 * - `allowed: true`  -> la DM è autorizzata tra actor e target su quel prodotto
 * - `allowed: false` -> la DM è negata; consultare `reason` per capire perché
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
 * Step 9: `NoValidAccessGrant` è il deny reason canonico post-cutover.
 * `NoCompletedOrderForStudent` resta ESPORTATO per il periodo di
 * transizione (V2 cleanup rimuoverà l'export).
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
   * deny-reason non è mai più raggiungibile dal resolver. Il constant è
   * mantenuto ESPORTATO per compatibilità con i consumer già in
   * produzione (src/lib/messaging/api-authorize.ts HTTP error mapper).
   * Poiché il resolver non lo restituisce mai più, le route lo
   * traducono in stato "irragiungibile" come safety net.
   *
   * Future V2 cleanup: rimuovere questo constant + l'entry
   * REASON_TO_STATUS corrispondente in api-authorize.ts.
   */
  NoCreatorForProduct: "no_creator_for_product",
  /**
   * I due partecipanti non sono coppia (creator, student) sul prodotto:
   * entrambi creator, entrambi student di quel prodotto, o entrambi
   * utenti random senza alcun legame con il prodotto.
   */
  NotCreatorStudentPair: "not_creator_student_pair",
  /**
   * @deprecated Post-Step 9 (MCR Phase 3 cutover): the canonical
   * "no access" reason is NoValidAccessGrant. This constant is kept
   * exported for backward compat with api-authorize.ts REASON_TO_STATUS
   * during transition; new code MUST use NoValidAccessGrant.
   *
   * V2 cleanup: remove this constant + REASON_TO_STATUS entry.
   */
  NoCompletedOrderForStudent: "no_completed_order_for_student",
  /**
   * Step 9 — canonical post-cutover deny reason: lo studente non ha
   * un AccessGrant.status='active' per il prodotto. Questo è il deny
   * reason canonico post-MCR Phase 3 (ex-pre-cutover era
   * NoCompletedOrderForStudent).
   */
  NoValidAccessGrant: "no_valid_access_grant",
} as const;

/**
 * Risolve i permessi di una DM creator<->studente su un prodotto specifico.
 *
 * Pattern "creator/student":
 *   - creator = User.id === Product.creatorId (REQUIRED post-fase 4 hardening,
 *     enforciato dalla migration `20260712210000_creator_id_required_restrict`)
 *   - student = l'altro partecipante, che DEVE avere un
 *     AccessGrant.status='active' per quel prodotto (post-Step 9 SSOT)
 *
 * Casi particolari (auto-invio, prodotto inesistente) sono gestiti con
 * `allowed: false` + `reason` valorizzato.
 */
export async function resolveMessagingPermission(
  input: ResolveMessagingPermissionInput,
): Promise<MessagingPermission> {
  const { actorId, targetId, productId } = input;

  // 0. Sanity: actor == target -> self-message
  if (actorId === targetId) {
    return {
      allowed: false,
      productId,
      reason: MessagingDenyReason.SelfMessage,
    };
  }

  // 1. Product esiste?
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

  // 2. Resolve the creator
  // Post-fase 4 hardening: `Product.creatorId` è REQUIRED (NOT NULL +
  // FK Restrict, migration `20260712210000_creator_id_required_restrict`).
  // Il legacy fallback al "primo admin" per prodotti senza creator è
  // stato rimosso. Se il lookup tornasse un valore nullo qui sarebbe un
  // problema di integrità DB (intervento manuale richiesto, eseguire
  // `npx tsx scripts/products/backfill-primary-creator.ts` come recovery
  // se si tratta di un DB legacy pre-migration).
  const creatorId = product.creatorId;

  // 3. Identifica chi è creator e chi è student nel pair
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

  // 4. Identifica lo student effettivo nel pair
  const customerId = actorIsCreator ? targetId : actorId;

  // 5. Lo student deve avere un accesso al prodotto.
  //
  // Step 9: delega a `resolveProductAccess` (AccessGrant SSOT,
  // post-cutover canonical path). The resolver returns a single deny
  // reason (NoActiveAccessGrant) which we map 1:1 to the messaging
  // domain's NoValidAccessGrant (the canonical post-cutover reason).
  //
  // Performance:
  //   - AccessGrant @@index([userId, productId, status]) — B-tree seek +
  //     OR expiresAt null/future served by the same index, no extra
  //     round-trip. Equivalent performance to the legacy Order read;
  //     see src/lib/commerce/access/resolve-product-access.ts top-of-
  //     file JSDoc for the index plan + OR-clause analysis.
  const access = await resolveProductAccess({
    userId: customerId,
    productId,
  });

  if (!access.hasAccess) {
    // Step 9 — single canonical deny reason. NoCompletedOrderForStudent
    // (legacy) is removed from the active deny surface; the constant
    // remains EXPORTED @deprecated for backward compat only.
    return {
      allowed: false,
      creatorId,
      customerId,
      productId,
      reason: MessagingDenyReason.NoValidAccessGrant,
    };
  }

  // Tutto verde - la DM è autorizzata
  return {
    allowed: true,
    creatorId,
    customerId,
    productId,
  };
}
