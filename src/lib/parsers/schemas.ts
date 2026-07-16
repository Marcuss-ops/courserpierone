/**
 * src/lib/parsers/schemas.ts
 *
 * Phase 6 cross-cut — Canonical Zod schemas for DB-stored JSON columns.
 *
 * Per the master plan §8 strategy: "JSON.parse non validato libero
 * sparso nel progetto" was the antipattern. These schemas are the
 * single source of truth for parsing the JSON columns scattered
 * across Prisma models.
 *
 * Categories covered (per user spec):
 *   1. socialLinks           \u2014 User.socialLinks (free-form URL map)
 *   2. analyticsEventMetadata\u2014 AnalyticEvent.metadata (key/value bag)
 *   3. lsCustomData          \u2014 Order.metadata + Lemon Squeezy customData
 *   4. translationSection    \u2014 ProductTranslation row shape
 *   5. pricesByCurrency      \u2014 Product.pricesByCurrency (canonical schema;
 *                                  src/lib/utils/pricing.ts has a partial
 *                                  implementation; future migration)
 *   6. countryOverrides      \u2014 Product.countryOverrides (canonical schema;
 *                                  same future migration)
 *
 * Architecture (per ADR-0016 §8):
 *   - Schemas are PURE declarations. Runtime parsing is in `index.ts`.
 *   - Consumers that just need the schema (e.g., API route validation)
 *     import directly from this file \u2014 don't have to go through the
 *     parser functions.
 *   - All schemas are Zod v3 (the project's standard, confirmed via
 *     src/lib/utils/validations.ts usage).
 */

import { z } from "zod";

// ─── socialLinks ─────────────────────────────────────────────────────

/**
 * User.socialLinks JSON shape. Each platform URL is optional (a user
 * may only link some of them). Unknown keys are ignored (forward-compat:
 * future platforms can be added without schema migration).
 */
export const socialLinksSchema = z
  .object({
    twitter: z.string().url().optional(),
    instagram: z.string().url().optional(),
    youtube: z.string().url().optional(),
    linkedin: z.string().url().optional(),
    website: z.string().url().optional(),
  })
  .passthrough();

export type SocialLinks = z.infer<typeof socialLinksSchema>;

// ─── analyticsEventMetadata ──────────────────────────────────────────

/**
 * AnalyticEvent.metadata JSON shape. Free-form key/value bag with
 * string keys and unknown values (per existing schema in
 * src/lib/utils/validations.ts#analyticsEventSchema). Kept as
 * `z.record(z.string(), z.unknown())` to allow provider-specific
 * payloads (UTM params, referral source, etc.).
 */
export const analyticsEventMetadataSchema = z.record(z.string(), z.unknown());

export type AnalyticsEventMetadata = z.infer<typeof analyticsEventMetadataSchema>;

// ─── lsCustomData (Lemon Squeezy customData + Order.metadata) ────────

/**
 * Lemon Squeezy `meta.custom_data` shape (sent via checkout) plus the
 * subset that round-trips into Order.metadata on the server. Mirrors
 * the LsCustomData interface in src/lib/commerce/payments/providers/
 * lemonsqueezy/index.ts. `passthrough()` for forward-compat with new
 * LS custom_data fields.
 *
 * The email field name varies in the codebase (userEmail vs email);
 * the LS provider emits `userEmail` and the round-trip preserves the
 * shape.
 */
export const lsCustomDataSchema = z
  .object({
    courseSlug: z.string().optional(),
    productSlug: z.string().optional(),
    userEmail: z.string().email().optional(),
    email: z.string().email().optional(),
    channelId: z.string().optional(),
    locale: z.string().optional(),
    /** Phase 4 attribution: offerCardId links Order back to an OfferCard. */
    offerCardId: z.string().optional(),
    /** Phase 5 attribution: agentJobId links Order back to an AgentJob. */
    agentJobId: z.string().optional(),
  })
  .passthrough();

export type LsCustomData = z.infer<typeof lsCustomDataSchema>;

// ─── translationSection (ProductTranslation row shape) ─────────────

/**
 * Per-section translation row. Matches the Prisma model
 * ProductTranslation: `{ productId, locale, section, content }`.
 * Section is constrained to the canonical funnel sections per the
 * schema JSDoc; locale is a plain string here (use asLocale from
 * domain-types at the type level after parse).
 */
export const translationSectionSchema = z.object({
  productId: z.string(),
  locale: z.string(),
  section: z.enum([
    "problema",
    "storia",
    "recensioni",
    "cta",
    "titolo",
    "sottotitolo",
  ]),
  content: z.string(),
});

export type TranslationSection = z.infer<typeof translationSectionSchema>;

// ─── pricesByCurrency (canonical schema for Product.pricesByCurrency) ─

/**
 * Per-currency price override. Matches the shape documented in
 * prisma/schema.prisma for Product.pricesByCurrency:
 *   { "USD": { "price": 5500, "symbol": "$", "lemonVariantId": "..." }, ... }
 *
 * NOTE: src/lib/utils/pricing.ts already has a `parsePricesByCurrency`
 * function with similar semantics. Future migration commit should
 * consolidate the two; for now this schema is the CANONICAL shape,
 * and pricing.ts's implementation will be migrated to consume it.
 */
export const currencyPriceSchema = z.object({
  price: z.number().int().nonnegative(),
  symbol: z.string().optional(),
  lemonVariantId: z.string().nullable().optional(),
});

export type CurrencyPrice = z.infer<typeof currencyPriceSchema>;

export const pricesByCurrencySchema = z.record(z.string(), currencyPriceSchema);

export type PricesByCurrency = z.infer<typeof pricesByCurrencySchema>;

// ─── countryOverrides (canonical schema for Product.countryOverrides) ─

/**
 * Per-country override. Matches the shape documented in
 * prisma/schema.prisma for Product.countryOverrides:
 *   { "BR": { "currency": "BRL", "price": 9900, "symbol": "R$", ... }, ... }
 *
 * Same future-migration note as pricesByCurrencySchema.
 */
export const countryPriceOverrideSchema = z.object({
  currency: z.string().length(3),
  price: z.number().int().nonnegative(),
  symbol: z.string().optional(),
  lemonVariantId: z.string().nullable().optional(),
});

export type CountryPriceOverride = z.infer<typeof countryPriceOverrideSchema>;

export const countryOverridesSchema = z.record(z.string(), countryPriceOverrideSchema);

export type CountryOverrides = z.infer<typeof countryOverridesSchema>;