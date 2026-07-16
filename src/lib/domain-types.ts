/**
 * src/lib/domain-types.ts
 *
 * Phase 6 cross-cut — Canonical Branded Types.
 *
 * Cross-cutting primitive value-objects per the master plan §8 (Value
 * Objects strategy): "value object SOLO per concetti critici".
 *
 * Scope (this commit): the 6 additive types whose brand is
 * TYPE-SAFETY-ADDITIVE — i.e., preventing accidental cross-use at
 * compile time. NOT branded here:
 *
 *   - AgentRunStatus / AgentRunState: already a string literal union.
 *     Branding a literal union would force `as AgentRunState` casts
 *     everywhere and harm TypeScript's type narrowing.
 *   - OfferEligibility: maps to the existing OfferReason union.
 *   - RecommendationScore (special-cased to numeric 0-1 range).
 *
 * Design rules:
 *   - Branded types are STRUCTURALLY still `string` or `number` at runtime
 *     (zero-cost). The brand is a phantom property `{ __brand: "..." }`
 *     that the compiler erases. NO runtime cost.
 *   - Each brand has a `as*()` constructor that validates inputs and
 *     throws AppError on bad input. The brand is a compile-time hint;
 *     the constructor is the runtime gate.
 *   - Migrations of existing plain-string aliases (e.g., `offer-card-types.ts`)
 *     happen in this commit; future call-site migrations are separate.
 */

import { AppError } from "@/lib/errors";

// ─── Money ───────────────────────────────────────────────────────────

/**
 * Integer minor units (cents, pence, centavos). Signless positive integer.
 * The companion `CurrencyCode` carries the scale (3-letter ISO 4217);
 * MoneyMinorUnits is scale-agnostic — 100 cents = 100 pennies = 100 centavos
 * is the SAME integer value, the currency tag distinguishes.
 */
export type MoneyMinorUnits = number & { readonly __brand: "MoneyMinorUnits" };

/** ISO 4217 3-letter uppercase currency code (e.g., "EUR", "USD", "BRL"). */
export type CurrencyCode = string & { readonly __brand: "CurrencyCode" };

/**
 * Canonical set of currencies the platform supports at V1. Used by
 * `asCurrencyCode` to reject unsupported codes. Future V2 may move to
 * a `Currency.enabled` table; until then this is the source of truth.
 */
export const SUPPORTED_CURRENCY_CODES: ReadonlySet<CurrencyCode> = new Set([
  "EUR",
  "USD",
  "GBP",
  "BRL",
  "CAD",
  "AUD",
  "CHF",
  "JPY",
  "INR",
  "MXN",
  "ARS",
] as CurrencyCode[]);

/**
 * Mint a CurrencyCode from a plain string. Throws AppError on:
 *   - Non-3-letter length
 *   - Non-uppercase
 *   - Non-supported (per SUPPORTED_CURRENCY_CODES)
 */
export function asCurrencyCode(code: string): CurrencyCode {
  if (code.length !== 3) {
    throw new AppError(`Invalid currency code length: "${code}" (expected 3 letters)`, {
      code: "INVALID_CURRENCY_CODE",
      statusCode: 422,
    });
  }
  if (code !== code.toUpperCase() || !/^[A-Z]{3}$/.test(code)) {
    throw new AppError(`Invalid currency code format: "${code}" (must be 3 uppercase letters)`, {
      code: "INVALID_CURRENCY_CODE",
      statusCode: 422,
    });
  }
  if (!SUPPORTED_CURRENCY_CODES.has(code as CurrencyCode)) {
    throw new AppError(`Unsupported currency code: "${code}"`, {
      code: "UNSUPPORTED_CURRENCY_CODE",
      statusCode: 422,
    });
  }
  return code as CurrencyCode;
}

/**
 * Mint MoneyMinorUnits from a plain number. Throws on:
 *   - Negative
 *   - Non-integer
 *   - Non-finite (NaN, Infinity)
 * NOTE: does NOT validate the currency — that's the caller's job
 * (MoneyMinorUnits is scale-agnostic).
 */
export function asMoneyMinorUnits(cents: number): MoneyMinorUnits {
  if (!Number.isFinite(cents)) {
    throw new AppError(`Invalid money value: ${cents} (not finite)`, {
      code: "INVALID_MONEY",
      statusCode: 422,
    });
  }
  if (cents < 0) {
    throw new AppError(`Invalid money value: ${cents} (must be >= 0)`, {
      code: "INVALID_MONEY",
      statusCode: 422,
    });
  }
  if (!Number.isInteger(cents)) {
    throw new AppError(`Invalid money value: ${cents} (must be integer)`, {
      code: "INVALID_MONEY",
      statusCode: 422,
    });
  }
  return cents as MoneyMinorUnits;
}

/**
 * Combined Money value object — minor units + currency tag.
 * Optional companion type for call sites that always carry both fields
 * (e.g., Order.amount + Order.currency, Product.price + Product.currency).
 */
export interface Money {
  amount: MoneyMinorUnits;
  currency: CurrencyCode;
}

// ─── Locale ──────────────────────────────────────────────────────────

/**
 * IETF BCP 47 language tag. Accepts:
 *   - Language only: "it", "en", "fr" (2-3 lowercase letters)
 *   - Language + Region: "it-IT", "en-US", "pt-BR" (lang + "-" + 2 uppercase)
 * Regex: `^[a-z]{2,3}(-[A-Z]{2})?$`
 */
export type Locale = string & { readonly __brand: "Locale" };

const LOCALE_BCP47_PATTERN = /^[a-z]{2,3}(-[A-Z]{2})?$/;

/**
 * Mint a Locale from a plain string. Throws on invalid BCP 47 format.
 * Validation is permissive on language length (2 or 3 chars) but strict
 * on case (lowercase lang, uppercase region). Does NOT verify the
 * language is in the platform's supported set — that's the caller's
 * responsibility (e.g., `Locale.isActive` check in DB).
 */
export function asLocale(tag: string): Locale {
  if (!LOCALE_BCP47_PATTERN.test(tag)) {
    throw new AppError(
      `Invalid locale tag: "${tag}" (must match BCP 47: lowercase lang + optional -UPPERCASE region)`,
      { code: "INVALID_LOCALE", statusCode: 422 },
    );
  }
  return tag as Locale;
}

// ─── Locale helper (DELEGATED to i18n/locale-resolver) ────────────────────────────────────────
//
// Per Phase 6 review: a branded `languageFromLocale` here would duplicate
// `localeToLanguage()` in src/lib/i18n/locale-resolver.ts (both do
// `tag.split("-")[0]`). The i18n version accepts plain `string` and is the
// canonical helper used by 30+ call sites.
//
// Callers needing "extract lang from Locale":
//   import { localeToLanguage } from "@/lib/i18n/locale-resolver";
//   localeToLanguage(myLocale); // returns "it" from "it-IT"
//
// Branded `Locale` values from `asLocale()` are assignable to the plain
// string parameter of `localeToLanguage` — no casting required.

// ─── ProductId ───────────────────────────────────────────────────────

/**
 * Product.id (Prisma CUID currently; UUID v7 hinted for future migration
 * per the user's spec — the `asProductId` validator accepts BOTH formats
 * to support the gradual migration without breaking existing rows).
 */
export type ProductId = string & { readonly __brand: "ProductId" };

/**
 * Mint a ProductId from a plain string. Throws on:
 *   - Empty string
 *   - Invalid format (must match CUID `c[a-z0-9]{20,}` OR UUID v7
 *     `[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}`)
 */
const PRODUCT_ID_CUID = /^c[a-z0-9]{20,}$/;
const PRODUCT_ID_UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function asProductId(value: string): ProductId {
  if (!value) {
    throw new AppError("Invalid ProductId: empty", {
      code: "INVALID_PRODUCT_ID",
      statusCode: 422,
    });
  }
  if (!PRODUCT_ID_CUID.test(value) && !PRODUCT_ID_UUID_V7.test(value)) {
    throw new AppError(
      `Invalid ProductId format: "${value}" (expected CUID or UUID v7)`,
      { code: "INVALID_PRODUCT_ID", statusCode: 422 },
    );
  }
  return value as ProductId;
}

// ─── CreatorId ───────────────────────────────────────────────────────

/**
 * Creator's User.id (User.role === "creator"). Branded to prevent
 * accidental cross-use with CustomerId (which is also User.id with
 * role="student" or "admin"). Migration to a separate Creator table
 * is a future V2; until then, the brand is the compile-time guard.
 */
export type CreatorId = string & { readonly __brand: "CreatorId" };

const USER_ID_CUID = /^c[a-z0-9]{20,}$/;

export function asCreatorId(value: string): CreatorId {
  if (!value) {
    throw new AppError("Invalid CreatorId: empty", {
      code: "INVALID_CREATOR_ID",
      statusCode: 422,
    });
  }
  if (!USER_ID_CUID.test(value)) {
    throw new AppError(
      `Invalid CreatorId format: "${value}" (expected CUID)`,
      { code: "INVALID_CREATOR_ID", statusCode: 422 },
    );
  }
  return value as CreatorId;
}

// ─── RecommendationScore ─────────────────────────────────────────────

/**
 * Recommendation score in [0, 1] inclusive. 0 = no recommendation,
 * 1 = strongest recommendation. Used by `src/domains/discovery/feed/`
 * policies to normalize heterogeneous signals into a comparable scale.
 */
export type RecommendationScore = number & { readonly __brand: "RecommendationScore" };

export function asRecommendationScore(value: number): RecommendationScore {
  if (!Number.isFinite(value)) {
    throw new AppError(`Invalid RecommendationScore: ${value} (not finite)`, {
      code: "INVALID_RECOMMENDATION_SCORE",
      statusCode: 422,
    });
  }
  if (value < 0 || value > 1) {
    throw new AppError(`Invalid RecommendationScore: ${value} (must be in [0, 1])`, {
      code: "INVALID_RECOMMENDATION_SCORE",
      statusCode: 422,
    });
  }
  return value as RecommendationScore;
}

// ─── ExternalOperationId ─────────────────────────────────────────────

/**
 * Provider-prefixed operation ID. Format: `<provider>:<id>` where
 * `<provider>` is one of the canonical provider names and `<id>` is
 * the opaque provider-side identifier. Examples:
 *   - "openai:batch_abc123"
 *   - "anthropic:msg_xyz789"
 *   - "lemonsqueezy:order_456"
 *
 * The brand prevents accidental cross-provider string concatenation
 * (e.g., silently mixing OpenAI and LemonSqueezy IDs in the same field).
 */
export type ExternalOperationId = string & { readonly __brand: "ExternalOperationId" };

/**
 * Canonical provider names. Mirrors `AgentProvider` from
 * `src/domains/automation/agent-registry.ts`. The validation is
 * strict here (no future-proofing with arbitrary strings) to surface
 * typos at the call site.
 */
export const OPERATION_PROVIDERS = [
  "openai",
  "anthropic",
  "lemonsqueezy",
  "inhouse",
] as const;

export type OperationProvider = (typeof OPERATION_PROVIDERS)[number];

/**
 * Mint an ExternalOperationId from a provider + opaque ID. Throws on:
 *   - Unknown provider
 *   - Empty ID
 *   - ID already contains ":" (would produce ambiguous format)
 */
export function asExternalOperationId(provider: string, id: string): ExternalOperationId {
  if (!(OPERATION_PROVIDERS as readonly string[]).includes(provider)) {
    throw new AppError(`Unknown operation provider: "${provider}"`, {
      code: "UNKNOWN_OPERATION_PROVIDER",
      statusCode: 422,
    });
  }
  if (!id) {
    throw new AppError("Invalid ExternalOperationId: empty id portion", {
      code: "INVALID_EXTERNAL_OPERATION_ID",
      statusCode: 422,
    });
  }
  if (id.includes(":")) {
    throw new AppError(
      `Invalid ExternalOperationId: id portion must not contain ":" (got "${id}")`,
      { code: "INVALID_EXTERNAL_OPERATION_ID", statusCode: 422 },
    );
  }
  return `${provider}:${id}` as ExternalOperationId;
}

/**
 * Parse a canonical ExternalOperationId back into its (provider, id) parts.
 * Returns null on malformed input (defensive — caller can decide fallback).
 */
export function splitExternalOperationId(
  value: ExternalOperationId,
): { provider: OperationProvider; id: string } | null {
  const idx = value.indexOf(":");
  if (idx <= 0 || idx >= value.length - 1) return null;
  const provider = value.slice(0, idx);
  const id = value.slice(idx + 1);
  if (!(OPERATION_PROVIDERS as readonly string[]).includes(provider)) return null;
  return { provider: provider as OperationProvider, id };
}

// ─── ParseResult (used by parsers/) ──────────────────────────────────

/**
 * Re-exported for the parsers/ layer. Avoids importing zod types
 * directly into domain-types (keeps the dependency surface small).
 * Used as the return type for all `parse*` functions in src/lib/parsers/.
 */
export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };