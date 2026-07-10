import { describe, it, expect } from "vitest";
import {
  parseCountryOverrides,
  getCountryPriceOverride,
  getPriceString,
  getCurrentAmountAndSymbol,
  parsePricesByCurrency,
  formatPrice,
  type CountryPriceOverride,
} from "./pricing";

// ─── Test Data ────────────────────────────────────────────────
// CourseConfig.price è già un display value (diviso per 100 da generate-course-config.ts)
const MOCK_PRODUCT = {
  price: 49,
  prices: {
    EUR: { amount: 49, currency: "EUR", symbol: "€" },
    USD: { amount: 54, currency: "USD", symbol: "$" },
    BRL: { amount: 299, currency: "BRL", symbol: "R$" },
    JPY: { amount: 7800, currency: "JPY", symbol: "¥" },
    GBP: { amount: 44, currency: "GBP", symbol: "£" },
    default: { amount: 49, currency: "EUR", symbol: "€" },
  },
};

const MOCK_COUNTRY_OVERRIDES_JSON = JSON.stringify({
  BR: { currency: "BRL", price: 9900, symbol: "R$", lemonVariantId: "123", stripePriceId: "price_br" },
  IN: { currency: "INR", price: 299900, symbol: "₹" },
  JP: { currency: "JPY", price: 780000, symbol: "¥", lemonVariantId: "456" },
});

const MOCK_COUNTRY_OVERRIDES_OBJECT = {
  BR: { currency: "BRL", price: 9900, symbol: "R$", lemonVariantId: "123", stripePriceId: "price_br" },
  IN: { currency: "INR", price: 299900, symbol: "₹" },
  JP: { currency: "JPY", price: 780000, symbol: "¥", lemonVariantId: "456" },
};

// ─── parseCountryOverrides ────────────────────────────────────
describe("parseCountryOverrides", () => {
  it("parses a valid JSON string into structured overrides", () => {
    const result = parseCountryOverrides(MOCK_COUNTRY_OVERRIDES_JSON);
    expect(result).not.toBeNull();
    expect(result!["BR"]).toBeDefined();
    expect(result!["BR"].currency).toBe("BRL");
    expect(result!["BR"].price).toBe(9900);
    expect(result!["BR"].symbol).toBe("R$");
    expect(result!["BR"].amount).toBe(99); // price / 100
    expect(result!["BR"].lemonVariantId).toBe("123");
    expect(result!["BR"].stripePriceId).toBe("price_br");
  });

  it("parses a pre-parsed object directly", () => {
    const result = parseCountryOverrides(MOCK_COUNTRY_OVERRIDES_OBJECT);
    expect(result).not.toBeNull();
    expect(result!["IN"].currency).toBe("INR");
    expect(result!["IN"].amount).toBe(2999); // 299900 / 100
    expect(result!["IN"].symbol).toBe("₹");
  });

  it("falls back to currency code for unknown symbol", () => {
    const overrides = { XX: { currency: "XYZ", price: 1000 } };
    const result = parseCountryOverrides(overrides);
    expect(result!["XX"].symbol).toBe("XYZ"); // fallback to currency code
  });

  it("returns null for null input", () => {
    expect(parseCountryOverrides(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parseCountryOverrides(undefined)).toBeNull();
  });

  it("returns null for invalid JSON string", () => {
    expect(parseCountryOverrides("not-json")).toBeNull();
  });

  it("uses built-in currency symbols when symbol is not provided", () => {
    const overrides = { FR: { currency: "EUR", price: 4900 } };
    const result = parseCountryOverrides(overrides);
    expect(result!["FR"].symbol).toBe("€");
  });

  it("handles lemonVariantId and stripePriceId when null", () => {
    const overrides = { US: { currency: "USD", price: 5400, lemonVariantId: null, stripePriceId: null } };
    const result = parseCountryOverrides(overrides);
    expect(result!["US"].lemonVariantId).toBeNull();
    expect(result!["US"].stripePriceId).toBeNull();
  });

  it("handles multiple countries", () => {
    const result = parseCountryOverrides(MOCK_COUNTRY_OVERRIDES_JSON);
    expect(Object.keys(result!)).toEqual(["BR", "IN", "JP"]);
  });

  it("handles empty object", () => {
    const result = parseCountryOverrides("{}");
    expect(result).toEqual({});
  });
});

// ─── getCountryPriceOverride ─────────────────────────────────
describe("getCountryPriceOverride", () => {
  it("returns correct override for Brazil", () => {
    const result = getCountryPriceOverride(
      { countryOverrides: MOCK_COUNTRY_OVERRIDES_JSON },
      "BR"
    );
    expect(result).not.toBeNull();
    expect(result!.currency).toBe("BRL");
    expect(result!.amount).toBe(99);
    expect(result!.symbol).toBe("R$");
  });

  it("returns correct override for India", () => {
    const result = getCountryPriceOverride(
      { countryOverrides: MOCK_COUNTRY_OVERRIDES_JSON },
      "IN"
    );
    expect(result).not.toBeNull();
    expect(result!.currency).toBe("INR");
    expect(result!.amount).toBe(2999);
  });

  it("is case-insensitive for country code", () => {
    const result = getCountryPriceOverride(
      { countryOverrides: MOCK_COUNTRY_OVERRIDES_JSON },
      "br"
    );
    expect(result).not.toBeNull();
    expect(result!.currency).toBe("BRL");
  });

  it("returns null for country without override", () => {
    const result = getCountryPriceOverride(
      { countryOverrides: MOCK_COUNTRY_OVERRIDES_JSON },
      "DE"
    );
    expect(result).toBeNull();
  });

  it("returns null when country is null", () => {
    const result = getCountryPriceOverride(
      { countryOverrides: MOCK_COUNTRY_OVERRIDES_JSON },
      null
    );
    expect(result).toBeNull();
  });

  it("returns null when country is undefined", () => {
    const result = getCountryPriceOverride(
      { countryOverrides: MOCK_COUNTRY_OVERRIDES_JSON },
      undefined
    );
    expect(result).toBeNull();
  });

  it("returns null when countryOverrides is null", () => {
    const result = getCountryPriceOverride({ countryOverrides: null }, "BR");
    expect(result).toBeNull();
  });

  it("returns null when countryOverrides is undefined", () => {
    const result = getCountryPriceOverride({}, "BR");
    expect(result).toBeNull();
  });

  it("works with pre-parsed object", () => {
    const result = getCountryPriceOverride(
      { countryOverrides: MOCK_COUNTRY_OVERRIDES_OBJECT },
      "JP"
    );
    expect(result).not.toBeNull();
    expect(result!.currency).toBe("JPY");
    expect(result!.lemonVariantId).toBe("456");
  });

  it("returns null for invalid countryOverrides JSON", () => {
    const result = getCountryPriceOverride(
      { countryOverrides: "invalid-json{]" },
      "BR"
    );
    expect(result).toBeNull();
  });
});

// ─── getPriceString ─────────────────────────────────────────
describe("getPriceString", () => {
  it("returns EUR price for Italian locale without country", () => {
    const result = getPriceString(MOCK_PRODUCT, "it-it");
    expect(result.price).toBe("€49");
    expect(result.currency).toBe("EUR");
  });

  it("returns USD price for US locale", () => {
    const result = getPriceString(MOCK_PRODUCT, "en-us");
    expect(result.price).toBe("$54");
    expect(result.currency).toBe("USD");
  });

  it("returns BRL price for pt-br locale with country override", () => {
    const result = getPriceString(
      { ...MOCK_PRODUCT, countryOverrides: MOCK_COUNTRY_OVERRIDES_JSON },
      "pt-br",
      "BR"
    );
    expect(result.price).toBe("R$99");
    expect(result.currency).toBe("BRL");
  });

  it("returns GBP price for en-gb locale", () => {
    const result = getPriceString(MOCK_PRODUCT, "en-gb");
    expect(result.price).toBe("£44");
    expect(result.currency).toBe("GBP");
  });

  it("returns JPY price for ja-jp locale", () => {
    const result = getPriceString(MOCK_PRODUCT, "ja-jp");
    expect(result.price).toBe("¥7800");
    expect(result.currency).toBe("JPY");
  });

  it("prioritizes country override over locale-based price", () => {
    const result = getPriceString(
      { ...MOCK_PRODUCT, countryOverrides: MOCK_COUNTRY_OVERRIDES_JSON },
      "en-us", // user is from US, but browsing from Brazil
      "BR"
    );
    expect(result.currency).toBe("BRL");
    expect(result.price).toBe("R$99");
  });

  it("falls back to EUR price when locale has no mapping", () => {
    const result = getPriceString(MOCK_PRODUCT, "unknown-locale");
    expect(result.currency).toBe("EUR");
    expect(result.price).toBe("€49");
  });

  it("falls back to default price when locale has no mapping and no prices configured", () => {
    const result = getPriceString({ price: 25 }, "unknown-locale");
    expect(result.price).toBe("€25");
    expect(result.currency).toBe("EUR");
  });

  it("handles full locale code (en-us → USD)", () => {
    const result = getPriceString(MOCK_PRODUCT, "en-us");
    expect(result.currency).toBe("USD");
    expect(result.price).toBe("$54");
  });

  it("handles full locale code (fr-fr → EUR)", () => {
    const result = getPriceString(MOCK_PRODUCT, "fr-fr");
    expect(result.currency).toBe("EUR");
    expect(result.price).toBe("€49");
  });

  it("returns fallback when country is provided but no override exists", () => {
    const result = getPriceString(MOCK_PRODUCT, "en-us", "DE");
    // DE has no override, so falls back to locale-based
    expect(result.currency).toBe("USD");
    expect(result.price).toBe("$54");
  });

  it("uses default price for locale currency (INR) when specific price config is missing", () => {
    const result = getPriceString(MOCK_PRODUCT, "hi-in");
    // INR not in MOCK_PRODUCT.prices → uses default price with INR currency
    expect(result.currency).toBe("INR");
    expect(result.price).toBe("€49");
  });

  it("uses default prices entry when specific currency is missing", () => {
    const productWithDefault = {
      price: 4900,
      prices: {
        default: { amount: 49, currency: "EUR", symbol: "€" },
      },
    };
    const result = getPriceString(productWithDefault, "it-it");
    expect(result.price).toBe("€49");
  });

  it("uses default price for locale currency (SEK) when specific price config is missing", () => {
    const result = getPriceString(MOCK_PRODUCT, "sv-se");
    // SEK not in MOCK_PRODUCT.prices → uses default price with SEK currency
    expect(result.price).toBe("€49");
    expect(result.currency).toBe("SEK");
  });
});

// ─── getCurrentAmountAndSymbol ─────────────────────────────
describe("getCurrentAmountAndSymbol", () => {
  it("returns correct amount and symbol for Italian locale", () => {
    const result = getCurrentAmountAndSymbol(MOCK_PRODUCT, "it-it");
    expect(result.currentAmount).toBe(49);
    expect(result.symbol).toBe("€");
    expect(result.currency).toBe("EUR");
    expect(result.baseAmount).toBe(49);
  });

  it("returns correct amount and symbol for US locale", () => {
    const result = getCurrentAmountAndSymbol(MOCK_PRODUCT, "en-us");
    expect(result.currentAmount).toBe(54);
    expect(result.symbol).toBe("$");
    expect(result.currency).toBe("USD");
  });

  it("returns country override values when applicable", () => {
    const result = getCurrentAmountAndSymbol(
      { ...MOCK_PRODUCT, countryOverrides: MOCK_COUNTRY_OVERRIDES_JSON },
      "pt-br",
      "BR"
    );
    expect(result.currentAmount).toBe(99); // 9900 / 100
    expect(result.symbol).toBe("R$");
    expect(result.currency).toBe("BRL");
    expect(result.baseAmount).toBe(49);
  });

  it("uses default baseAmount when price is undefined", () => {
    const result = getCurrentAmountAndSymbol({}, "it-it");
    expect(result.baseAmount).toBe(19); // default fallback
    expect(result.currentAmount).toBe(19);
    expect(result.symbol).toBe("€");
    expect(result.currency).toBe("EUR");
  });

  it("returns JPY values for Japanese locale", () => {
    const result = getCurrentAmountAndSymbol(MOCK_PRODUCT, "ja-jp");
    expect(result.currentAmount).toBe(7800);
    expect(result.symbol).toBe("¥");
    expect(result.currency).toBe("JPY");
  });

  it("handles unknown locale with fallback", () => {
    const result = getCurrentAmountAndSymbol(MOCK_PRODUCT, "unknown");
    // Falls back to EUR (default currency)
    expect(result.currentAmount).toBe(49);
    expect(result.symbol).toBe("€");
    expect(result.currency).toBe("EUR");
  });
});

// ─── parsePricesByCurrency ─────────────────────────────────
describe("parsePricesByCurrency", () => {
  const validPrices = JSON.stringify({
    EUR: { price: 4900, symbol: "€" },
    USD: { price: 5400, symbol: "$", stripePriceId: "price_usd" },
    BRL: { price: 29900, lemonVariantId: "ls_br" },
  });

  it("parses valid JSON string", () => {
    const result = parsePricesByCurrency(validPrices);
    expect(result).not.toBeNull();
    expect(result!.EUR.price).toBe(4900);
    expect(result!.EUR.symbol).toBe("€");
    expect(result!.USD.stripePriceId).toBe("price_usd");
    expect(result!.BRL.lemonVariantId).toBe("ls_br");
  });

  it("returns null for null input", () => {
    expect(parsePricesByCurrency(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(parsePricesByCurrency(undefined)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parsePricesByCurrency("not-valid-json")).toBeNull();
  });

  it("handles empty object", () => {
    const result = parsePricesByCurrency("{}");
    expect(result).toEqual({});
  });

  it("preserves optional fields (undefined when missing)", () => {
    const result = parsePricesByCurrency(validPrices);
    // stripePriceId and lemonVariantId were not in the JSON → undefined
    expect(result!.EUR.stripePriceId).toBeUndefined();
    expect(result!.EUR.lemonVariantId).toBeUndefined();
  });

  it("handles whitespace in JSON string", () => {
    const result = parsePricesByCurrency('  { "EUR": { "price": 4900 } }  ');
    expect(result).not.toBeNull();
    expect(result!.EUR.price).toBe(4900);
  });
});

// ─── formatPrice ───────────────────────────────────────────
describe("formatPrice", () => {
  it("formats EUR price", () => {
    expect(formatPrice(4900, "€")).toBe("€49");
  });

  it("formats USD price", () => {
    expect(formatPrice(5400, "$")).toBe("$54");
  });

  it("formats JPY price (no decimals)", () => {
    expect(formatPrice(780000, "¥")).toBe("¥7800");
  });

  it("formats BRL price", () => {
    expect(formatPrice(9900, "R$")).toBe("R$99");
  });

  it("formats zero amount", () => {
    expect(formatPrice(0, "€")).toBe("€0");
  });

  it("handles large amounts", () => {
    expect(formatPrice(299900, "₹")).toBe("₹2999");
  });

  it("rounds down (toFixed(0))", () => {
    expect(formatPrice(199, "€")).toBe("€2"); // 199/100 = 1.99 → toFixed(0) = "2"
  });
});
