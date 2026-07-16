/**
 * src/lib/domain-types.test.ts
 *
 * Unit tests for the canonical branded types in src/lib/domain-types.ts.
 *
 * Coverage (one describe block per brand):
 *   - Money / CurrencyCode
 *   - Locale
 *   - ProductId
 *   - CreatorId
 *   - RecommendationScore
 *   - ExternalOperationId (mint + split)
 *
 * Tests use no live clock, no DB. Pure-function tests.
 */

import { describe, expect, it } from "vitest";

import { AppError } from "@/lib/errors";
import {
  asCreatorId,
  asCurrencyCode,
  asExternalOperationId,
  asLocale,
  asMoneyMinorUnits,
  asProductId,
  asRecommendationScore,
  OPERATION_PROVIDERS,
  splitExternalOperationId,
  SUPPORTED_CURRENCY_CODES,
  type CreatorId,
  type CurrencyCode,
  type ExternalOperationId,
  type Locale,
  type MoneyMinorUnits,
  type ProductId,
  type RecommendationScore,
} from "./domain-types";

// ─── Money / CurrencyCode ────────────────────────────────────────────

describe("asCurrencyCode", () => {
  it.each(["EUR", "USD", "GBP", "BRL"])("accepts supported code '%s'", (code) => {
    const result: CurrencyCode = asCurrencyCode(code);
    expect(result).toBe(code);
  });

  it("rejects non-3-letter code with INVALID_CURRENCY_CODE", () => {
    expect(() => asCurrencyCode("EURO")).toThrow(AppError);
    expect(() => asCurrencyCode("EU")).toThrow(/Invalid currency code length/);
  });

  it("rejects lowercase code", () => {
    expect(() => asCurrencyCode("eur")).toThrow(/must be 3 uppercase letters/);
  });

  it("rejects unsupported currency code", () => {
    expect(() => asCurrencyCode("XYZ")).toThrow(/Unsupported currency code/);
  });

  it("rejects digits in code", () => {
    expect(() => asCurrencyCode("EU1")).toThrow(/must be 3 uppercase letters/);
  });

  it("SUPPORTED_CURRENCY_CODES contains at least the major trading currencies", () => {
    // Branded Set.has() requires CurrencyCode; use asCurrencyCode() so
    // the literal strings pass runtime validation too.
    expect(SUPPORTED_CURRENCY_CODES.has(asCurrencyCode("EUR"))).toBe(true);
    expect(SUPPORTED_CURRENCY_CODES.has(asCurrencyCode("USD"))).toBe(true);
    expect(SUPPORTED_CURRENCY_CODES.has(asCurrencyCode("BRL"))).toBe(true);
  });
});

describe("asMoneyMinorUnits", () => {
  it.each([0, 1, 99, 100, 9_900, 99_999_999])(
    "accepts positive integer %i",
    (cents) => {
      const result: MoneyMinorUnits = asMoneyMinorUnits(cents);
      expect(result).toBe(cents);
    },
  );

  it("rejects negative", () => {
    expect(() => asMoneyMinorUnits(-1)).toThrow(/must be >= 0/);
  });

  it("rejects non-integer (fractional cents)", () => {
    expect(() => asMoneyMinorUnits(99.5)).toThrow(/must be integer/);
  });

  it("rejects NaN", () => {
    expect(() => asMoneyMinorUnits(NaN)).toThrow(/not finite/);
  });

  it("rejects Infinity", () => {
    expect(() => asMoneyMinorUnits(Infinity)).toThrow(/not finite/);
  });

  it("rejects -Infinity", () => {
    expect(() => asMoneyMinorUnits(-Infinity)).toThrow(/not finite/);
  });
});

// ─── Locale ──────────────────────────────────────────────────────────

describe("asLocale", () => {
  it.each(["it", "en", "fr", "de", "es", "pt", "zh", "ja", "en-US", "pt-BR", "fr-CA"])(
    "accepts valid BCP 47 tag '%s'",
    (tag) => {
      const result: Locale = asLocale(tag);
      expect(result).toBe(tag);
    },
  );

  it.each(["IT", "EN-us", "EN-US", "en_US", "english", "e-US", "en-USA"])(
    "rejects invalid BCP 47 tag '%s'",
    (tag) => {
      expect(() => asLocale(tag)).toThrow(/Invalid locale tag/);
    },
  );

  it("rejects empty string", () => {
    expect(() => asLocale("")).toThrow(/Invalid locale tag/);
  });
});

// ─── ProductId ───────────────────────────────────────────────────────

describe("asProductId", () => {
  it("accepts a CUID-style product id (current Prisma format)", () => {
    const cuid = "clxabc123def456ghi789jkl";
    const result: ProductId = asProductId(cuid);
    expect(result).toBe(cuid);
  });

  it("accepts a UUID v7 (future migration)", () => {
    const uuidv7 = "018f3e7c-9d2a-7abc-9def-1234567890ab";
    const result: ProductId = asProductId(uuidv7);
    expect(result).toBe(uuidv7);
  });

  it("rejects empty string", () => {
    expect(() => asProductId("")).toThrow(/empty/);
  });

  it("rejects invalid format (numeric only)", () => {
    expect(() => asProductId("12345")).toThrow(/Invalid ProductId format/);
  });

  it("rejects UUID v4 (version digit mismatch)", () => {
    // UUID v4 has '4' in the version position; UUID v7 has '7'
    const uuidv4 = "018f3e7c-9d2a-4abc-9def-1234567890ab";
    expect(() => asProductId(uuidv4)).toThrow(/Invalid ProductId format/);
  });
});

// ─── CreatorId ───────────────────────────────────────────────────────

describe("asCreatorId", () => {
  it("accepts a CUID-style user id", () => {
    const cuid = "cuser123abc456def789ghi";
    const result: CreatorId = asCreatorId(cuid);
    expect(result).toBe(cuid);
  });

  it("rejects empty string", () => {
    expect(() => asCreatorId("")).toThrow(/empty/);
  });

  it("rejects non-CUID format", () => {
    expect(() => asCreatorId("not-a-cuid")).toThrow(/Invalid CreatorId format/);
  });

  it("rejects a UUID (different brand validation)", () => {
    expect(() => asCreatorId("018f3e7c-9d2a-7abc-9def-1234567890ab")).toThrow(
      /Invalid CreatorId format/,
    );
  });
});

// ─── RecommendationScore ─────────────────────────────────────────────

describe("asRecommendationScore", () => {
  it.each([0, 0.25, 0.5, 0.75, 1])("accepts score %f in [0, 1]", (value) => {
    const result: RecommendationScore = asRecommendationScore(value);
    expect(result).toBe(value);
  });

  it.each([-0.1, -1, 1.1, 2, 100])("rejects score %f outside [0, 1]", (value) => {
    expect(() => asRecommendationScore(value)).toThrow(/must be in \[0, 1\]/);
  });

  it("rejects NaN", () => {
    expect(() => asRecommendationScore(NaN)).toThrow(/not finite/);
  });

  it("rejects Infinity", () => {
    expect(() => asRecommendationScore(Infinity)).toThrow(/not finite/);
  });
});

// ─── ExternalOperationId ─────────────────────────────────────────────

describe("asExternalOperationId", () => {
  it.each(OPERATION_PROVIDERS)("mints a valid id for provider '%s'", (provider) => {
    const id = asExternalOperationId(provider, "batch_abc123");
    const result: ExternalOperationId = id;
    expect(result).toBe(`${provider}:batch_abc123`);
  });

  it("rejects unknown provider", () => {
    expect(() => asExternalOperationId("unknown_provider", "id_1")).toThrow(
      /Unknown operation provider/,
    );
  });

  it("rejects empty id portion", () => {
    expect(() => asExternalOperationId("openai", "")).toThrow(
      /empty id portion/,
    );
  });

  it("rejects id portion containing ':' (would create ambiguous format)", () => {
    expect(() => asExternalOperationId("openai", "id:with:colons")).toThrow(
      /must not contain ":"/,
    );
  });
});

describe("splitExternalOperationId", () => {
  it("splits a valid id into provider + id parts", () => {
    const id = asExternalOperationId("openai", "batch_abc123");
    expect(splitExternalOperationId(id)).toEqual({
      provider: "openai",
      id: "batch_abc123",
    });
  });

  it("returns null on malformed id (no colon)", () => {
    // Cast through unknown to bypass the brand; split is defensive
    expect(splitExternalOperationId("not-an-id" as ExternalOperationId)).toBeNull();
  });

  it("returns null on empty id portion", () => {
    expect(splitExternalOperationId("openai:" as ExternalOperationId)).toBeNull();
  });

  it("returns null on unknown provider", () => {
    expect(
      splitExternalOperationId("unknown_provider:abc" as ExternalOperationId),
    ).toBeNull();
  });

  it("returns null when colon is at start", () => {
    expect(splitExternalOperationId(":abc" as ExternalOperationId)).toBeNull();
  });
});