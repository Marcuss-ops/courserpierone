import { describe, it, expect } from "vitest";
import { PricingService, type PricingProduct } from "./pricing-service";
import { CheckoutPricingError } from "./pricing-service";

// ─── Fixture: product with multi-currency + country overrides ─────
const productWithOverrides: PricingProduct = {
  lemonVariantId: "lemon_global",
  stripePriceId: "stripe_global",
  pricesByCurrency: JSON.stringify({
    USD: {
      price: 5500,
      currency: "USD",
      stripePriceId: "stripe_usd",
      lemonVariantId: "lemon_usd",
    },
    GBP: {
      price: 4400,
      currency: "GBP",
      stripePriceId: "stripe_gbp",
      lemonVariantId: "lemon_gbp",
    },
    JPY: {
      price: 800,
      currency: "JPY",
      stripePriceId: null,
      lemonVariantId: "lemon_jpy",
    },
  }),
  countryOverrides: JSON.stringify({
    BR: {
      currency: "BRL",
      price: 9900,
      symbol: "R$",
      lemonVariantId: "lemon_br",
      stripePriceId: "stripe_br",
    },
    IN: {
      currency: "INR",
      price: 49900,
      symbol: "₹",
      lemonVariantId: "lemon_in",
      stripePriceId: null, // IN has no Stripe price planned
    },
  }),
};

const productNoOverrides: PricingProduct = {
  lemonVariantId: "lemon_global",
  stripePriceId: "stripe_global",
  pricesByCurrency: null,
  countryOverrides: null,
};

const productOnlyLemon: PricingProduct = {
  lemonVariantId: "lemon_only",
  stripePriceId: null,
  pricesByCurrency: null,
  countryOverrides: null,
};

const productOnlyStripe: PricingProduct = {
  lemonVariantId: null,
  stripePriceId: "stripe_only",
  pricesByCurrency: null,
  countryOverrides: null,
};

const productNoProvider: PricingProduct = {
  lemonVariantId: null,
  stripePriceId: null,
  pricesByCurrency: null,
  countryOverrides: null,
};

// ─── Tests ─────────────────────────────────────────────────────────
describe("PricingService.resolve — base behaviour", () => {
  it("returns product IDs unchanged when no overrides match", () => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productWithOverrides,
      locale: "fr-fr", // FR is not emerging, no override
      currency: "EUR",
      country: "FR",
    });

    expect(result.lemonVariantId).toBe("lemon_global");
    expect(result.stripePriceId).toBe("stripe_global");
    expect(result.discountCode).toBeUndefined();
  });

  it("returns product IDs when product has no overrides at all", () => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productNoOverrides,
      locale: "it-it",
      currency: "EUR",
      country: "IT",
    });

    expect(result).toEqual({
      lemonVariantId: "lemon_global",
      stripePriceId: "stripe_global",
      discountCode: undefined,
    });
  });
});

describe("PricingService.resolve — currency override (scenario 7)", () => {
  it("returns USD stripePriceId when currency=USD", () => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productWithOverrides,
      locale: "en-us",
      currency: "USD",
      country: "US",
    });

    expect(result.stripePriceId).toBe("stripe_usd");
    expect(result.lemonVariantId).toBe("lemon_usd");
  });

  it("returns GBP stripePriceId when currency=GBP", () => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productWithOverrides,
      locale: "en-gb",
      currency: "GBP",
      country: "GB",
    });

    expect(result.stripePriceId).toBe("stripe_gbp");
    expect(result.lemonVariantId).toBe("lemon_gbp");
  });

  it("normalizes lowercase currency code (usd → USD)", () => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productWithOverrides,
      locale: "en-us",
      currency: "usd", // lowercase
      country: "US",
    });

    expect(result.stripePriceId).toBe("stripe_usd");
  });

  it("falls back to global IDs when currency override key is absent", () => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productWithOverrides,
      locale: "de-de",
      currency: "EUR", // not in pricesByCurrency map
      country: "DE",
    });

    // No currency override; DE is not emerging; no country override.
    expect(result.stripePriceId).toBe("stripe_global");
    expect(result.lemonVariantId).toBe("lemon_global");
  });
});

describe("PricingService.resolve — country override", () => {
  it("returns BR stripePriceId when country=BR", () => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productWithOverrides,
      locale: "pt-br",
      currency: "BRL",
      country: "BR",
    });

    expect(result.lemonVariantId).toBe("lemon_br");
    expect(result.stripePriceId).toBe("stripe_br");
  });

  it("returns IN lemonVariantId only (no stripePriceId for IN)", () => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productWithOverrides,
      locale: "hi-in",
      currency: "INR",
      country: "IN",
    });

    expect(result.lemonVariantId).toBe("lemon_in");
    expect(result.stripePriceId).toBe("stripe_global"); // falls back since IN override has stripePriceId=null
  });

  it("country override applied when no currency override matches (BRL not in pricesByCurrency)", () => {
    const svc = new PricingService();
    // productWithOverrides has BR in countryOverrides but NOT BRL in pricesByCurrency,
    // so only the country override engages.
    const result = svc.resolve({
      product: productWithOverrides,
      locale: "pt-br",
      currency: "BRL",
      country: "BR",
    });

    expect(result.lemonVariantId).toBe("lemon_br");
    expect(result.stripePriceId).toBe("stripe_br");
  });

  it("country override takes precedence over currency override (when both match)", () => {
    const svc = new PricingService();
    // Fixture built so both overrides are present with distinct IDs for BR/BRL.
    // Country override is applied AFTER currency override in production code,
    // so the country ID must win.
    const productWithCompetingOverrides: PricingProduct = {
      lemonVariantId: "lemon_global",
      stripePriceId: "stripe_global",
      pricesByCurrency: JSON.stringify({
        BRL: {
          lemonVariantId: "lemon_brl_via_currency",
          stripePriceId: "stripe_brl_via_currency",
        },
      }),
      countryOverrides: JSON.stringify({
        BR: {
          lemonVariantId: "lemon_br_via_country",
          stripePriceId: "stripe_br_via_country",
        },
      }),
    };

    const result = svc.resolve({
      product: productWithCompetingOverrides,
      locale: "pt-br",
      currency: "BRL", // matches pricesByCurrency entry
      country: "BR", // matches countryOverrides entry
    });

    // Country override wins (applied last in the resolve() chain)
    expect(result.lemonVariantId).toBe("lemon_br_via_country");
    expect(result.stripePriceId).toBe("stripe_br_via_country");
  });

  it("handles null country gracefully", () => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productWithOverrides,
      locale: "en-us",
      currency: "USD",
      country: null,
    });

    expect(result.stripePriceId).toBe("stripe_usd"); // USD currency override still applies
    expect(result.lemonVariantId).toBe("lemon_usd");
  });
});

describe("PricingService.resolve — emerging-market auto discount", () => {
  it.each([
    "IN",
    "PK",
    "BD",
    "EG",
    "VN",
    "ID",
    "BR",
    "MX",
    "AR",
    "TR",
    "RU",
    "CO",
    "UA",
  ])("auto-applies EMERGING60 discount when country=%s", (country) => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productWithOverrides,
      locale: "en-us",
      currency: "USD",
      country,
    });

    expect(result.discountCode).toBe("EMERGING60");
  });

  it("does NOT auto-discount when country is non-emerging (IT, DE, US, JP)", () => {
    const svc = new PricingService();
    const cases = ["IT", "DE", "US", "JP", "FR", "GB", "ES"];
    for (const country of cases) {
      const result = svc.resolve({
        product: productWithOverrides,
        locale: "en-us",
        currency: "USD",
        country,
      });
      expect(result.discountCode).toBeUndefined();
    }
  });

  it("normalizes country case for emerging-match (lowercase br matches)", () => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productNoOverrides,
      locale: "pt-br",
      currency: "BRL",
      country: "br", // lowercase
    });

    expect(result.discountCode).toBe("EMERGING60");
  });
});

describe("PricingService.resolve — coupon precedence", () => {
  it("explicit couponCode overrides emerging-market auto-discount", () => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productWithOverrides,
      locale: "pt-br",
      currency: "BRL",
      country: "BR", // emerging
      couponCode: "SUMMER2026", // explicit
    });

    expect(result.discountCode).toBe("SUMMER2026");
  });

  it("returns couponCode even on non-emerging country", () => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productNoOverrides,
      locale: "it-it",
      currency: "EUR",
      country: "IT",
      couponCode: "WELCOME10",
    });

    expect(result.discountCode).toBe("WELCOME10");
  });
});

describe("PricingService.resolve — currency fallback via locale", () => {
  it("falls back to getCurrencyFromLocale when currency is omitted", () => {
    const svc = new PricingService();
    // locale "en-gb" → currency GBP per locale-resolver convention
    const result = svc.resolve({
      product: productWithOverrides,
      locale: "en-gb",
      // currency omitted → derived from locale
      country: "GB",
    });

    expect(result.stripePriceId).toBe("stripe_gbp");
  });

  it("uses explicit currency over locale fallback (when both passed)", () => {
    const svc = new PricingService();
    // locale would suggest EUR, but explicit currency=JPY wins.
    const result = svc.resolve({
      product: productWithOverrides,
      locale: "en-gb", // would normally imply GBP
      currency: "JPY", // explicit override
      country: "JP",
    });

    // JPY override has no stripePriceId → falls back to global
    expect(result.lemonVariantId).toBe("lemon_jpy");
    expect(result.stripePriceId).toBe("stripe_global");
  });
});

describe("PricingService.validateProvider", () => {
  it("throws CheckoutPricingError when neither provider is configured", () => {
    const svc = new PricingService();
    expect(() =>
      svc.validateProvider({
        lemonVariantId: null,
        stripePriceId: null,
        discountCode: undefined,
      })
    ).toThrow(CheckoutPricingError);
  });

  it("throws the CheckoutPricingError CLASS specifically (for downstream catch handlers)", () => {
    const svc = new PricingService();
    let caught: unknown;
    try {
      svc.validateProvider({
        lemonVariantId: null,
        stripePriceId: null,
        discountCode: undefined,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CheckoutPricingError);
    expect((caught as Error).message).toMatch(/nessun metodo di pagamento configurato/i);
    expect((caught as Error).name).toBe("CheckoutPricingError");
  });

  it("does NOT throw when only lemonVariantId is set", () => {
    const svc = new PricingService();
    expect(() =>
      svc.validateProvider({
        lemonVariantId: "lemon_only",
        stripePriceId: null,
        discountCode: undefined,
      })
    ).not.toThrow();
  });

  it("does NOT throw when only stripePriceId is set", () => {
    const svc = new PricingService();
    expect(() =>
      svc.validateProvider({
        lemonVariantId: null,
        stripePriceId: "stripe_only",
        discountCode: undefined,
      })
    ).not.toThrow();
  });

  it("survives the fallback chain (productOnlyLemon with no overrides)", () => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productOnlyLemon,
      locale: "it-it",
      currency: "EUR",
      country: "IT",
    });

    expect(result.lemonVariantId).toBe("lemon_only");
    expect(result.stripePriceId).toBeNull();
    expect(() => svc.validateProvider(result)).not.toThrow();
  });
});

describe("PricingService — defence scenarios from DoD", () => {
  it("scenario 7: USD price for US visitor with correct currency resolution", () => {
    const svc = new PricingService();

    // /api/checkout sends locale=en-us, country=US. PricingService must resolve
    // USD-specific price IDs and NOT the EUR/base IDs.
    const result = svc.resolve({
      product: productWithOverrides,
      locale: "en-us",
      currency: "USD",
      country: "US",
    });

    expect(result.stripePriceId).toBe("stripe_usd");
    expect(result.lemonVariantId).toBe("lemon_usd");
    expect(result.stripePriceId).not.toBe("stripe_global");
    expect(result.lemonVariantId).not.toBe("lemon_global");
  });

  it("scenario 7: BR visitor gets BR override + emerging discount (composed path)", () => {
    const svc = new PricingService();

    const result = svc.resolve({
      product: productWithOverrides,
      locale: "pt-br",
      currency: "BRL",
      country: "BR",
    });

    // country override wins
    expect(result.lemonVariantId).toBe("lemon_br");
    expect(result.stripePriceId).toBe("stripe_br");
    // AND emerging-market auto-discount applies
    expect(result.discountCode).toBe("EMERGING60");
  });

  it("regression: invalid price catalog (no provider) is rejected before checkout", () => {
    const svc = new PricingService();
    const result = svc.resolve({
      product: productNoProvider,
      locale: "it-it",
      currency: "EUR",
      country: "IT",
    });

    expect(() => svc.validateProvider(result)).toThrow(
      /nessun metodo di pagamento configurato/i
    );
  });
});
