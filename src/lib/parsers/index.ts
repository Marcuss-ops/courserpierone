/**
 * src/lib/parsers/index.ts
 *
 * Phase 6 cross-cut — Centralized JSON parsers.
 *
 * Replaces scattered `JSON.parse(jsonString) as SomeType` patterns
 * across the codebase. Every parser:
 *
 *   1. Accepts a raw JSON string OR a pre-parsed unknown value.
 *   2. Attempts `JSON.parse` if input is a string; catches the error
 *      and returns a failed ParseResult (NEVER throws).
 *   3. Validates the parsed value via the canonical Zod schema in
 *      `./schemas.ts`.
 *   4. Returns a typed `ParseResult<T>` from `domain-types.ts`.
 *
 * API style: Zod's native safeParse pattern (Result type). Throws
 * NEVER \u2014 the caller decides fallback. This is the divergence from
 * the older `parseCountryOverrides` in src/lib/utils/pricing.ts which
 * returns `null` on failure; the new pattern returns the underlying
 * ZodError message for diagnostics.
 *
 * Future V2: when pricing.ts migrates to consume these parsers, the
 * null-returning wrapper can be a thin adapter on top.
 */

import type { ParseResult } from "@/lib/domain-types";

import {
  analyticsEventMetadataSchema,
  countryOverridesSchema,
  lsCustomDataSchema,
  pricesByCurrencySchema,
  socialLinksSchema,
  translationSectionSchema,
  type AnalyticsEventMetadata,
  type CountryOverrides,
  type LsCustomData,
  type PricesByCurrency,
  type SocialLinks,
  type TranslationSection,
} from "./schemas";

// Re-export schemas for direct composition by API routes / components.
export {
  analyticsEventMetadataSchema,
  countryOverridesSchema,
  countryPriceOverrideSchema,
  currencyPriceSchema,
  lsCustomDataSchema,
  pricesByCurrencySchema,
  socialLinksSchema,
  translationSectionSchema,
  type AnalyticsEventMetadata,
  type CountryOverrides,
  type CountryPriceOverride,
  type CurrencyPrice,
  type LsCustomData,
  type PricesByCurrency,
  type SocialLinks,
  type TranslationSection,
} from "./schemas";

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Internal helper: try JSON.parse, return raw or null on failure.
 * Does NOT throw \u2014 the parser functions compose this with safeParse
 * to produce a typed result without exceptions.
 */
function tryJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Compose JSON.parse + Zod safeParse into a single ParseResult<T>.
 * Centralizes the "is this null/empty?" + "is this valid JSON?" +
 * "is this valid against the schema?" tri-state error reporting.
 */
function parseJsonString<T>(
  input: string | null | undefined,
  schema: { safeParse: (raw: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } },
): ParseResult<T> {
  if (input === null || input === undefined || input === "") {
    return { success: false, error: "empty input" };
  }
  const raw = tryJsonParse(input);
  if (raw === null) {
    return { success: false, error: "invalid JSON" };
  }
  const result = schema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  const messages = result.error.issues.map((i) => i.message).join("; ");
  return { success: false, error: messages };
}

// ─── Public parsers ─────────────────────────────────────────────────

/**
 * Parse a User.socialLinks JSON column. Returns the canonical
 * SocialLinks shape (object with optional URL fields). On failure,
 * the error message is human-readable (e.g., "invalid JSON" or
 * "Expected string, received number").
 */
export function parseSocialLinks(
  input: string | null | undefined,
): ParseResult<SocialLinks> {
  return parseJsonString(input, socialLinksSchema);
}

/**
 * Parse an AnalyticEvent.metadata JSON column. Returns the
 * free-form key/value bag.
 */
export function parseAnalyticsEventMetadata(
  input: string | null | undefined,
): ParseResult<AnalyticsEventMetadata> {
  return parseJsonString(input, analyticsEventMetadataSchema);
}

/**
 * Parse Lemon Squeezy customData (or Order.metadata which carries
 * the same shape after round-trip). Returns the LsCustomData shape
 * with optional offerCardId + agentJobId attribution fields.
 */
export function parseLsCustomData(
  input: string | null | undefined,
): ParseResult<LsCustomData> {
  return parseJsonString(input, lsCustomDataSchema);
}

/**
 * Parse a single ProductTranslation row (not used for the table
 * directly \u2014 Prisma returns typed rows \u2014 but useful when the row
 * is stored as a JSON sub-document).
 */
export function parseTranslationSection(
  input: string | null | undefined,
): ParseResult<TranslationSection> {
  return parseJsonString(input, translationSectionSchema);
}

/**
 * Parse a Product.pricesByCurrency JSON column. Returns the canonical
 * PricesByCurrency shape (currency code \u2192 CurrencyPrice).
 */
export function parsePricesByCurrency(
  input: string | null | undefined,
): ParseResult<PricesByCurrency> {
  return parseJsonString(input, pricesByCurrencySchema);
}

/**
 * Parse a Product.countryOverrides JSON column. Returns the canonical
 * CountryOverrides shape (ISO country code \u2192 CountryPriceOverride).
 */
export function parseCountryOverrides(
  input: string | null | undefined,
): ParseResult<CountryOverrides> {
  return parseJsonString(input, countryOverridesSchema);
}