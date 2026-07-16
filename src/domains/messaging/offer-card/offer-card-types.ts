/**
 * src/domains/messaging/offer-card/offer-card-types.ts
 *
 * Phase 4 (Courssy \u2014 DM with Offer Card) \u2014 REWRITE.
 *
 * OfferCard domain types. Pure logic, no I/O per ADR-0016 \u00a7Domain rule.
 *
 * Architecture (per ADR-0016 \u00a72 registries):
 *   Domain types (this file) \u2192 Discriminator guards (offer-card-discriminator.ts)
 *     \u2192 Eligibility policy (offer-eligibility-policy.ts) \u2192 UseCase adapter
 *     (next commit) \u2192 Prisma adapter (future commit when persistence added)
 *
 * STRICT RULES enforced by type design (canonical Phase 4 constraints):
 *
 *   1. NO URL COMMERCIALI LIBERI NEI MESSAGGI:
 *      OfferCard has NO `url: string` field. UI references an opaque
 *      linkToken (from offer-card-discriminator.ts) which the consumer
 *      resolves to an authenticated internal route. The recipient's
 *      chat message preview carries a rendered card, never a URL.
 *
 *   2. CHAT CONTESTO PRESERVED (NOT GLOBAL DM):
 *      Phase 1.3 Conversation model binds chat to a single Product.
 *      An OfferCard is anchored to ONE existing conversation's
 *      productId. NO new global DM channel re-introduced.
 *
 *   3. TWO-PRODUCT UPSELL SEMANTIC:
 *      OfferCardDraft carries TWO distinct productIds by design:
 *        - `conversationProductId`: the chat's anchor product.
 *          Used by the eligibility policy's Rule 2 (engagement check).
 *        - `productId`: the OFFERED upsell target product.
 *          Used by eligibility Rules 3 (creator ownership), 4
 *          (published), and 5 (anti-redundancy).
 *      In the canonical upsell flow (free course chat \u2192 premium course
 *      offer by same creator), these IDs ARE DIFFERENT \u2014 chat is on
 *      a free product, offer is the premium upgrade. Conflating them
 *      (the original bug fix) made Rules 2 and 5 mutually exclusive,
 *      preventing any upsell flow from succeeding.
 *
 *   4. CONVERSION TRACKING (NO schema change):
 *      When recipient purchases, Order.metadata JSON includes
 *      `offerCardId` for attribution. Eligibility policy doesn't know
 *      conversion details; downstream analytics reads Order.metadata.
 */

import type { OfferCardStatus, LinkToken } from "./offer-card-discriminator";

// \u2500\u2500\u2500\u2500 Identifier aliases (plain strings, zero-cost) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

// Phase 6 cross-cut (ADR-0016 §8 primitives): the 3 canonical ID brands
// live in `src/lib/domain-types.ts`. This file re-exports them so the
// rest of the offer-card module keeps its existing import surface
// (`import type { ProductId, CreatorId, RecipientId } from "./offer-card-types"`).
// Branded types are TYPE-SAFETY-ADDITIVE: structurally still `string`
// at runtime (zero-cost phantom), but the compiler now distinguishes
// `CreatorId` from `RecipientId` from `ProductId` so accidental cross-use
// (e.g., passing a recipient where a creator is expected) is a type error.
// Validation lives in `domain-types.ts` (`asProductId`, `asCreatorId`).
import type { CreatorId, ProductId } from "@/lib/domain-types";
import { asCreatorId as asCreatorIdFromDomain, asProductId as asProductIdFromDomain } from "@/lib/domain-types";
export type { CreatorId, ProductId };
// Re-export so consumers can do `import { asCreatorId, asProductId } from "./offer-card-types"`
// instead of reaching into domain-types directly. Mirrors the type re-exports above.
export const asCreatorId = asCreatorIdFromDomain;
export const asProductId = asProductIdFromDomain;

// Local RecipientId brand (Phase 6 spec: only ProductId/CreatorId get
// global brands; RecipientId stays local until a second consumer needs it).
// asRecipientId mirrors the asCreatorId validation contract (CUID format
// + non-empty) so the test fixtures can mint branded values consistently.
export function asRecipientId(value: string): RecipientId {
  if (!value) {
    throw new Error("Invalid RecipientId: empty");
  }
  if (!/^c[a-z0-9]{20,}$/.test(value)) {
    throw new Error(`Invalid RecipientId format: "${value}" (expected CUID)`);
  }
  return value as RecipientId;
}

// RecipientId is the offer-card-specific third brand. Kept as a local
// brand (zero-cost phantom) because it doesn't yet have a global
// domain-types entry — Phase 6 spec only listed ProductId/CreatorId.
// Migration to domain-types.ts is deferred until a second consumer
// needs it.
export type RecipientId = string & { readonly __brand: "RecipientId" };

// \u2500\u2500\u2500\u2500 Conversation anchor (required for valid offer) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Conversation-required anchor.
 *
 * Phase 1.3 Conversation model binds a chat to a single Product. The
 * OfferCard is anchored to that Product via this snapshot of the chat
 * participants + the chat's productId (separate from the OFFERED
 * upsell target). NO new global DM channel.
 *
 * Convention (\u00a712): creator = userOne, recipient = userTwo. Unique
 * constraint (userOneId+userTwoId+productId) prevents bidirectional
 * ordering ambiguity.
 */
export interface ConversationAnchor {
  creatorId: CreatorId;
  recipientId: RecipientId;
  /** The chat's anchor productId (NOT the offered productId). */
  conversationProductId: ProductId;
}

// \u2500\u2500\u2500\u2500 Localized price (pre-computed by caller) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Localized price for the offered product, pre-computed by caller.
 * V2 candidate: branded Money value object per ADR-0016 \u00a78.
 */
export interface LocalizedPrice {
  /** Lowercased ISO 4217 currency code (e.g., "eur", "usd"). */
  currency: string;
  /** Amount in cents (matches Product.price convention). */
  amountCents: number;
  /** Optional display symbol for UI rendering only (NOT stored on Order). */
  symbol?: string;
}

// \u2500\u2500\u2500\u2500 Optional coupon snapshot \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Optional coupon applied at offer creation. Stored as immutable
 * snapshot to avoid drift if Coupon row mutates later (admin can
 * change `value` post-hoc; the OfferCard carries its own copy).
 */
export interface OfferCoupon {
  code: string;
  type: "percent" | "fixed";
  value: number; // percent (0-100) OR cents (fixed)
  expiresAt?: Date;
}

// \u2500\u2500\u2500\u2500 Offer reason (drives UI copy + analytics) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Why this offer is being shown. Strict string union per ADR-0016 \u00a78
 * primitives. Drives UI copy ("Because you completed...") and analytics
 * segmentation (cohort analysis: free\u2192paid conversion by reason).
 */
export type OfferReason =
  | "free_course_completion"      // recipient finished free course
  | "creator_recommendation"      // creator manually flagged user
  | "watchlist_reminder"          // product on recipient's watchlist
  | "topic_match"                 // Phase 2 Step 5 wire-up
  | "cohort_pattern";              // similar users converted free\u2192paid

// \u2500\u2500\u2500\u2500 Draft shape (pre-validation by eligibility policy) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Draft shape (pre-validation by eligibility policy). All fields
 * populated by the offer-generation UseCase. NO id / status / createdAt
 * \u2014 those are added by the persistence adapter (future commit).
 *
 * TWO product IDs by design \u2014 see file-top comment \u00a73:
 *   - `conversationProductId` \u2014 the chat's anchor product (engagement check)
 *   - `productId` \u2014 the OFFERED upsell target
 * In the canonical upsell flow these differ (free chat context, paid
 * premium offer); the eligibility policy operates on them independently.
 */
export interface OfferCardDraft {
  /** Creator who proposed the offer (must match Conversation.userOneId). */
  creatorId: CreatorId;

  /** Recipient (the upsell target \u2014 must match Conversation.userTwoId). */
  recipientId: RecipientId;

  /** Product anchoring the chat room (the engagement context). */
  conversationProductId: ProductId;

  /** Product being offered (the upsell target). */
  productId: ProductId;

  /** Pre-computed localized price for (recipient, offered product). */
  localizedPrice: LocalizedPrice;

  /** Why this offer is being shown. Drives UI copy + analytics. */
  reason: OfferReason;

  /** Optional coupon snapshot (immutable, taken at offer creation). */
  coupon?: OfferCoupon;
}

// \u2500\u2500\u2500\u2500 Canonical OfferCard (post-validation, post-persistence) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * Canonical OfferCard (post-validation by eligibility policy +
 * post-persistence in future commit). The recipient's chat UI sees
 * an `OfferCardPreview` projection (below) \u2014 NEVER this raw shape,
 * to enforce the type-level "no URL" rule (this shape has no URL
 * field, but server-side rendering must drop the linkToken into an
 * internal route, not embed it as raw text).
 */
export interface OfferCard extends OfferCardDraft {
  /** Server-generated opaque id (cuid, consistent with rest of codebase). */
  id: string;

  /** Status enum anchor (canonical values per offer-card-discriminator.ts). */
  status: OfferCardStatus;

  /**
   * Opaque token for UI <Link href> rendering. See LinkToken brand
   * in offer-card-discriminator.ts. NO free URL field exists on
   * OfferCard \u2014 this is type-level enforcement of the Phase 4 rule.
   */
  linkToken: LinkToken;

  /** Created at \u2014 server timestamp (UTC). */
  createdAt: Date;

  /**
   * Sent at \u2014 defined when status transitions `draft \u2192 sent`. Null
   * while in draft state.
   */
  sentAt: Date | null;

  /**
   * Conversion tracking (NO new schema column):
   *   - convertedAt: timestamp when recipient purchased
   *   - convertedOrderId: Order.id of resulting purchase
   *
   * Attribution path: Order.metadata JSON contains `offerCardId`
   * referenced back to this card. The eligibility policy doesn't
   * read conversion directly \u2014 analytics reads Order.metadata.
   */
  convertedAt: Date | null;
  convertedOrderId: string | null;
}

// \u2500\u2500\u2500\u2500 Recipient-side projection (UI-safe) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500

/**
 * What the recipient's chat UI sees. Localized strings + opaque token.
 * The UI's `<Link href={`/api/offer/${preview.linkToken}`}>` resolves
 * via an authenticated internal route; the canonical URL is never
 * displayed. ALL fields here are safe to render directly.
 */
export interface OfferCardPreview {
  id: string;
  productName: string;
  priceLabel: string; // pre-rendered "$49.00" or "Free (was $99)"
  reasonCopy: string; // localized "Because you completed..."
  /** Opaque \u2014 UI passes to Link href, server resolves to internal route. */
  linkToken: LinkToken;
  expiresAt: Date | null;
}
