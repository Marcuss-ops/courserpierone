/**
 * src/domains/messaging/offer-card/offer-card-discriminator.ts
 *
 * Phase 4 (Courssy \u2014 DM with Offer Card).
 *
 * Canonical OfferCard status enum + runtime guards + LinkToken opaque
 * type. Pure logic, no I/O per ADR-0016 \u00a7Domain rule.
 *
 * ADR-0016 \u00a78: discriminator as canonical schema. Even though persistence
 * (future commit) stores status as a Prisma String column (no enum
 * because the schema is intentionally flexible), the application
 * validates the value against this single canonical set.
 *
 * Lifecycle (terminal states have no outgoing transitions):
 *
 *     draft \u2192 sent \u2192 viewed \u2192 clicked \u2192 converted
 *                         \u2199         \u2199
 *                       expired   withdrawn
 *
 *   \u2022 draft      \u2014 created, not yet visible to recipient
 *   \u2022 sent       \u2014 chat message with the card delivered
 *   \u2022 viewed     \u2014 recipient opened the message containing the card
 *   \u2022 clicked    \u2014 recipient clicked the resolved link (via token)
 *   \u2022 converted  \u2014 recipient purchased (Order.metadata.offerCardId set)
 *   \u2022 expired    \u2014 TTL hit (DEFAULT_FREQUENCY_WINDOW_DAYS rolling)
 *   \u2022 withdrawn  \u2014 creator manually canceled before conversion
 */

// \u2500\u2500\u2500 Canonical status enum (single source of truth) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Canonical status string union. Subset of 8 lifecycle states
 * (per Phase 4 spec). Adding a new state requires editing this union
 * + the OFFER_CARD_STATUSES Set + VALID_TRANSITIONS map below.
 */
export type OfferCardStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "clicked"
  | "converted"
  | "expired"
  | "withdrawn";

/**
 * Canonical runtime set of valid statuses. Used for DB write validation
 * + incoming payload guarding. Mirrors the OfferCardStatus union \u2014
 * TS enforces tuple-to-Set provenance via the `as const` cast below.
 */
export const OFFER_CARD_STATUSES: ReadonlySet<OfferCardStatus> = new Set<OfferCardStatus>([
  "draft",
  "sent",
  "viewed",
  "clicked",
  "converted",
  "expired",
  "withdrawn",
]);

/**
 * Runtime guard: returns true if the value is a canonical status.
 * Used for boundary checks (form input, DB read fallback, webhook
 * payloads). `s is OfferCardStatus` narrow makes TS happy downstream.
 */
export function isValidOfferCardStatus(s: unknown): s is OfferCardStatus {
  return typeof s === "string" && OFFER_CARD_STATUSES.has(s as OfferCardStatus);
}

// \u2500\u2500\u2500 Opaque token for UI consumer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Opaque token for UI <Link href> rendering.
 *
 * WHY OPAQUE / TYPE-LEVEL: enforces the Phase 4 spec rule "NO URL
 * commerciali liberi nei messaggi" at the type level. UI consumers
 * cannot accidentally render `card.url` (which would leak the
 * canonical URL); they only ever have access to `card.linkToken`,
 * which resolves to an authenticated internal route server-side.
 *
 * Runtime: a cuid (consistent with rest of codebase) or hex token.
 * The brand marker prevents accidental mixing with raw URL strings.
 */
export type LinkToken = string & { readonly __brand: "LinkToken" };

/**
 * Mint a LinkToken from a server-generated string. The caller (UseCase
 * adapter) is responsible for generating the underlying opaque string
 * (cuid via Prisma default, UUID via crypto.randomUUID, or HMAC-signed
 * cuid for unforgeable tokens). This helper is type-only: no runtime
 * validation on the token contents.
 */
export function toLinkToken(s: string): LinkToken {
  return s as LinkToken;
}

// \u2500\u2500\u2500 State-machine transitions \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Whitelisted state transitions. ALLOWED = forward + view/click
 * events + terminal states for expired/withdrawn/converted.
 * Terminal states (converted/expired/withdrawn) have empty Set.
 *
 * Use case: enforcing legal transitions in the OfferCard persistence
 * adapter (future commit): a row with status='converted' cannot
 * transition back to 'clicked'.
 */
const VALID_TRANSITIONS: Record<OfferCardStatus, ReadonlySet<OfferCardStatus>> = {
  draft: new Set<OfferCardStatus>(["sent", "withdrawn"]),
  sent: new Set<OfferCardStatus>(["viewed", "clicked", "converted", "expired", "withdrawn"]),
  viewed: new Set<OfferCardStatus>(["clicked", "converted", "expired", "withdrawn"]),
  clicked: new Set<OfferCardStatus>(["converted", "expired", "withdrawn"]),
  converted: new Set<OfferCardStatus>(),
  expired: new Set<OfferCardStatus>(),
  withdrawn: new Set<OfferCardStatus>(),
};

/**
 * Runtime guard: returns true if `from \u2192 to` is a whitelisted transition.
 * Use case: state-machine enforcement on persistence writes (future).
 */
export function isValidStatusTransition(
  from: OfferCardStatus,
  to: OfferCardStatus,
): boolean {
  return VALID_TRANSITIONS[from].has(to);
}
