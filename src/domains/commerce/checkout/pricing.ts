import { parsePricesByCurrency, parseCountryOverrides } from "@/lib/utils/pricing";
import { getCurrencyFromLocale } from "@/lib/i18n/locale-resolver";
import { CheckoutError } from "@/lib/errors";

/**
 * Product subset needed by PricingService.
 */
export interface PricingProduct {
  lemonVariantId?: string | null;
  pricesByCurrency?: unknown;
  countryOverrides?: unknown;
}

export interface ResolvedPricing {
  lemonVariantId?: string | null;
  discountCode?: string;
}

export interface ResolvePricingInput {
  product: PricingProduct;
  locale: string;
  currency?: string;
  country?: string | null;
  couponCode?: string;
}

const EMERGING_COUNTRIES = new Set([
  "IN", "PK", "BD", "EG", "VN", "ID", "BR", "MX", "AR", "TR", "RU", "CO", "UA",
]);

export class CheckoutPricingError extends CheckoutError {
  constructor(message: string) {
    super(message, { code: "PRICING_ERROR" });
    this.name = "CheckoutPricingError";
  }
}

/**
 * PricingService resolves the effective payment provider IDs and discount code
 * for a given product, locale, country and optional coupon.
 *
 * Resolution order:
 * 1. Currency-specific override (pricesByCurrency)
 * 2. Country-specific override (countryOverrides)
 * 3. Automatic emerging-market discount if no explicit coupon is provided
 */
export class PricingService {
  resolve(input: ResolvePricingInput): ResolvedPricing {
    const { product, locale, country, couponCode } = input;
    const currency = input.currency ?? getCurrencyFromLocale(locale);

    let lemonVariantId = product.lemonVariantId;

    const currencyOverride = this.resolveCurrencyOverride(product, currency);
    if (currencyOverride) {
      lemonVariantId = currencyOverride.lemonVariantId ?? lemonVariantId;
    }

    const countryOverride = this.resolveCountryOverride(product, country);
    if (countryOverride) {
      lemonVariantId = countryOverride.lemonVariantId ?? lemonVariantId;
    }

    const discountCode = this.resolveDiscountCode({ couponCode, country });

    return { lemonVariantId, discountCode };
  }

  /** Validates that Lemon Squeezy is configured. */
  validateProvider(resolved: ResolvedPricing): void {
    if (!resolved.lemonVariantId) {
      throw new CheckoutPricingError(
        "Nessun metodo di pagamento configurato per questo prodotto. Aggiungi un Lemon Variant ID.",
      );
    }
  }

  private resolveCurrencyOverride(
    product: PricingProduct,
    currency: string,
  ): { lemonVariantId?: string | null } | null {
    if (!product.pricesByCurrency) return null;
    const prices = parsePricesByCurrency(product.pricesByCurrency);
    return prices?.[currency.toUpperCase()] ?? null;
  }

  private resolveCountryOverride(
    product: PricingProduct,
    country?: string | null,
  ): { lemonVariantId?: string | null } | null {
    if (!country || !product.countryOverrides) return null;
    const overrides = parseCountryOverrides(product.countryOverrides);
    return overrides?.[country.toUpperCase()] ?? null;
  }

  private resolveDiscountCode(input: {
    couponCode?: string;
    country?: string | null;
  }): string | undefined {
    if (input.couponCode) return input.couponCode;
    if (input.country && EMERGING_COUNTRIES.has(input.country.toUpperCase())) {
      return "EMERGING60";
    }
    return undefined;
  }
}
