/**
 * src/lib/parsers/index.test.ts
 *
 * Unit tests for the centralized JSON parsers in src/lib/parsers/.
 *
 * Coverage (one describe block per parser):
 *   - parseSocialLinks
 *   - parseAnalyticsEventMetadata
 *   - parseLsCustomData
 *   - parseTranslationSection
 *   - parsePricesByCurrency
 *   - parseCountryOverrides
 *
 * Each parser covers the same 4 paths:
 *   1. valid JSON + valid schema \u2192 success with typed data
 *   2. valid JSON + invalid schema \u2192 failure with Zod issues message
 *   3. invalid JSON \u2192 failure with "invalid JSON"
 *   4. null / undefined / empty \u2192 failure with "empty input"
 */

import { describe, expect, it } from "vitest";

import type { ParseResult } from "@/lib/domain-types";

import {
  parseAnalyticsEventMetadata,
  parseCountryOverrides,
  parseLsCustomData,
  parsePricesByCurrency,
  parseSocialLinks,
  parseTranslationSection,
} from "./index";

// Helper: assert the parser returned a failure with the given error message.
// Workaround for TS narrowing limits across separate statements.
function expectFailure<T>(result: ParseResult<T>, errorMsg: string) {
  expect(result).toEqual({ success: false, error: errorMsg });
}

// ─── parseSocialLinks ────────────────────────────────────────────────

describe("parseSocialLinks", () => {
  it("returns the typed shape on valid JSON + valid schema", () => {
    const json = JSON.stringify({
      twitter: "https://twitter.com/foo",
      youtube: "https://youtube.com/@foo",
    });
    const result = parseSocialLinks(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.twitter).toBe("https://twitter.com/foo");
      expect(result.data.youtube).toBe("https://youtube.com/@foo");
      expect(result.data.instagram).toBeUndefined();
    }
  });

  it("accepts empty object (all fields optional)", () => {
    const result = parseSocialLinks("{}");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({});
    }
  });

  it("fails on invalid URL in a field", () => {
    const result = parseSocialLinks(JSON.stringify({ twitter: "not-a-url" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/url/i);
    }
  });

  it("fails on invalid JSON", () => {
    expectFailure(parseSocialLinks("{not json}"), "invalid JSON");
  });

  it("fails on null/undefined/empty", () => {
    expectFailure(parseSocialLinks(null), "empty input");
    expectFailure(parseSocialLinks(undefined), "empty input");
    expectFailure(parseSocialLinks(""), "empty input");
  });
});

// ─── parseAnalyticsEventMetadata ────────────────────────────────────

describe("parseAnalyticsEventMetadata", () => {
  it("returns the typed bag on valid JSON", () => {
    const json = JSON.stringify({ utm_source: "youtube", amount: 4900 });
    const result = parseAnalyticsEventMetadata(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.utm_source).toBe("youtube");
      expect(result.data.amount).toBe(4900);
    }
  });

  it("accepts empty object", () => {
    expect(parseAnalyticsEventMetadata("{}").success).toBe(true);
  });

  it("fails on invalid JSON", () => {
    expect(parseAnalyticsEventMetadata("{bad").success).toBe(false);
  });

  it("fails on null/undefined/empty", () => {
    expectFailure(parseAnalyticsEventMetadata(null), "empty input");
  });

  it("preserves unknown keys (z.record with z.unknown values)", () => {
    const json = JSON.stringify({
      utm_source: "youtube",
      exotic_field_xyz: { nested: [1, 2, 3] },
    });
    const result = parseAnalyticsEventMetadata(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.exotic_field_xyz).toEqual({ nested: [1, 2, 3] });
    }
  });
});

// ─── parseLsCustomData ───────────────────────────────────────────────

describe("parseLsCustomData", () => {
  it("returns the typed shape on valid JSON + valid schema", () => {
    const json = JSON.stringify({
      courseSlug: "alpha-course",
      userEmail: "buyer@example.com",
      channelId: "youtube_main",
      locale: "it",
    });
    const result = parseLsCustomData(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.courseSlug).toBe("alpha-course");
      expect(result.data.userEmail).toBe("buyer@example.com");
    }
  });

  it("preserves offerCardId + agentJobId attribution fields", () => {
    const json = JSON.stringify({
      courseSlug: "x",
      offerCardId: "oc_abc123",
      agentJobId: "aj_xyz789",
    });
    const result = parseLsCustomData(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.offerCardId).toBe("oc_abc123");
      expect(result.data.agentJobId).toBe("aj_xyz789");
    }
  });

  it("preserves unknown keys via passthrough()", () => {
    const json = JSON.stringify({
      courseSlug: "x",
      futureFieldNotYetInSchema: "future value",
    });
    const result = parseLsCustomData(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        (result.data as Record<string, unknown>).futureFieldNotYetInSchema,
      ).toBe("future value");
    }
  });

  it("fails on invalid email format", () => {
    const json = JSON.stringify({ userEmail: "not-an-email" });
    const result = parseLsCustomData(json);
    expect(result.success).toBe(false);
  });

  it("fails on invalid JSON", () => {
    expect(parseLsCustomData("not-json-at-all").success).toBe(false);
  });

  it("fails on null/undefined/empty", () => {
    expectFailure(parseLsCustomData(null), "empty input");
  });
});

// ─── parseTranslationSection ────────────────────────────────────────

describe("parseTranslationSection", () => {
  it("returns the typed row on valid JSON", () => {
    const json = JSON.stringify({
      productId: "prod_abc",
      locale: "it",
      section: "titolo",
      content: "Titolo del corso",
    });
    const result = parseTranslationSection(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.section).toBe("titolo");
      expect(result.data.content).toBe("Titolo del corso");
    }
  });

  it("rejects unknown section value", () => {
    const json = JSON.stringify({
      productId: "prod_abc",
      locale: "it",
      section: "not_a_real_section",
      content: "x",
    });
    const result = parseTranslationSection(json);
    expect(result.success).toBe(false);
  });

  it("fails on invalid JSON / null / empty", () => {
    expect(parseTranslationSection("not-json").success).toBe(false);
    expectFailure(parseTranslationSection(null), "empty input");
  });
});

// ─── parsePricesByCurrency ──────────────────────────────────────────

describe("parsePricesByCurrency", () => {
  it("returns the typed map on valid JSON + valid schema", () => {
    const json = JSON.stringify({
      USD: { price: 5500, symbol: "$", lemonVariantId: "var_usd" },
      EUR: { price: 4900, symbol: "\u20ac" },
    });
    const result = parsePricesByCurrency(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.USD?.price).toBe(5500);
      expect(result.data.USD?.symbol).toBe("$");
      expect(result.data.EUR?.price).toBe(4900);
    }
  });

  it("rejects negative price (Zod validation)", () => {
    const json = JSON.stringify({ USD: { price: -100 } });
    const result = parsePricesByCurrency(json);
    expect(result.success).toBe(false);
  });

  it("rejects fractional price (must be integer cents)", () => {
    const json = JSON.stringify({ USD: { price: 99.5 } });
    const result = parsePricesByCurrency(json);
    expect(result.success).toBe(false);
  });

  it("fails on invalid JSON / null / empty", () => {
    expect(parsePricesByCurrency("not-json").success).toBe(false);
    expectFailure(parsePricesByCurrency(null), "empty input");
  });
});

// ─── parseCountryOverrides ──────────────────────────────────────────

describe("parseCountryOverrides", () => {
  it("returns the typed map on valid JSON + valid schema", () => {
    const json = JSON.stringify({
      BR: { currency: "BRL", price: 9900, symbol: "R$", lemonVariantId: "var_brl" },
      IN: { currency: "INR", price: 49900 },
    });
    const result = parseCountryOverrides(json);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.BR?.currency).toBe("BRL");
      expect(result.data.BR?.price).toBe(9900);
      expect(result.data.IN?.currency).toBe("INR");
    }
  });

  it("rejects currency code of wrong length (Zod .length(3))", () => {
    const json = JSON.stringify({ BR: { currency: "BRRR", price: 100 } });
    const result = parseCountryOverrides(json);
    expect(result.success).toBe(false);
  });

  it("rejects negative price", () => {
    const json = JSON.stringify({ BR: { currency: "BRL", price: -1 } });
    const result = parseCountryOverrides(json);
    expect(result.success).toBe(false);
  });

  it("fails on invalid JSON / null / empty", () => {
    expect(parseCountryOverrides("not-json").success).toBe(false);
    expectFailure(parseCountryOverrides(null), "empty input");
  });
});