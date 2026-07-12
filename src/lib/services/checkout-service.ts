import { prisma } from "@/lib/db/prisma";
import { initLS, getStoreId } from "@/lib/payment/lemonsqueezy";
import { getStripe } from "@/lib/payment/stripe";
import { env } from "@/lib/env";
import { createCheckout } from "@lemonsqueezy/lemonsqueezy.js";
import { CheckoutError } from "@/lib/errors";

export interface CheckoutProduct {
  id: string;
  slug: string;
  lemonStoreId?: string | null;
}

export interface ResolvedPricing {
  lemonVariantId?: string | null;
  stripePriceId?: string | null;
  discountCode?: string;
}

export interface CheckoutSession {
  url: string;
  provider: "lemonsqueezy" | "stripe";
}

export interface CreateCheckoutInput {
  product: CheckoutProduct;
  pricing: ResolvedPricing;
  locale: string;
  userEmail?: string;
  channelId?: string;
  country?: string | null;
}

/**
 * CheckoutService creates payment sessions and tracks abandoned checkouts.
 *
 * Priority:
 * 1. Lemon Squeezy (if lemonVariantId is resolved)
 * 2. Stripe (fallback if only stripePriceId is resolved)
 */
export class CheckoutService {
  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    if (input.pricing.lemonVariantId) {
      return this.createLemonSqueezyCheckout(input);
    }

    if (input.pricing.stripePriceId) {
      return this.createStripeCheckout(input);
    }

    throw new CheckoutError(
      "Nessun metodo di pagamento configurato per questo prodotto."
    );
  }

  private async createLemonSqueezyCheckout(
    input: CreateCheckoutInput
  ): Promise<CheckoutSession> {
    const { product, pricing, locale, userEmail, channelId, country } = input;

    const storeId = product.lemonStoreId ?? getStoreId();
    if (!storeId) {
      throw new CheckoutError(
        "Lemon Squeezy store not configured. Set LEMONSQUEEZY_STORE_ID in .env or lemonStoreId on the product."
      );
    }

    initLS();

    const variantId = parseInt(pricing.lemonVariantId!, 10);
    if (Number.isNaN(variantId)) {
      throw new CheckoutError("Invalid lemonVariantId");
    }

    const customData: Record<string, string> = {
      courseSlug: product.slug,
      locale,
    };
    if (userEmail) customData.email = userEmail;
    if (channelId) customData.channelId = channelId;

    const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const redirectUrl = `${appUrl}/${locale}/${product.slug}/download?lang=${locale}&order_id=[order_id]`;

    const checkout = await createCheckout(storeId, variantId, {
      checkoutData: {
        email: userEmail || undefined,
        custom: customData,
        discountCode: pricing.discountCode,
      },
      productOptions: {
        redirectUrl,
        receiptButtonText: "Scarica il tuo libro",
        receiptLinkUrl: redirectUrl,
      },
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    if (checkout.error || !checkout.data) {
      throw new CheckoutError("Checkout creation failed");
    }

    const url = checkout.data.data.attributes.url;
    await this.saveAbandonedCheckout({
      product,
      locale,
      userEmail,
      url,
      provider: "lemonsqueezy",
    });

    return { url, provider: "lemonsqueezy" };
  }

  private async createStripeCheckout(
    input: CreateCheckoutInput
  ): Promise<CheckoutSession> {
    const { product, pricing, locale, userEmail, country } = input;

    const appUrl = env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const lang = locale.split("-")[0];

    const supportedStripeLocales = [
      "ar", "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fil", "fr", "he",
      "hr", "hu", "id", "it", "ja", "ko", "lt", "lv", "ms", "nb", "nl", "pl", "pt",
      "ro", "ru", "sk", "sl", "sv", "th", "tr", "vi", "zh",
    ];
    const stripeLocale = supportedStripeLocales.includes(lang) ? lang : "auto";

    const dbUser = userEmail
      ? await prisma.user.findUnique({ where: { email: userEmail } })
      : null;

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: pricing.stripePriceId!,
          quantity: 1,
        },
      ],
      customer_email: userEmail || undefined,
      locale: stripeLocale as any,
      allow_promotion_codes: true,
      success_url: `${appUrl}/${locale}/${product.slug}/download?lang=${locale}&order_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/${locale}/${product.slug}?canceled=1`,
      metadata: {
        userId: dbUser?.id ?? "guest",
        productId: product.id,
        locale,
        customer_country: country ?? "",
      },
    });

    const url = session.url;
    if (url) {
      await this.saveAbandonedCheckout({
        product,
        locale,
        userEmail,
        url,
        provider: "stripe",
      });
    }

    return { url: url ?? "", provider: "stripe" };
  }

  private async saveAbandonedCheckout(input: {
    product: CheckoutProduct;
    locale: string;
    userEmail?: string;
    url: string;
    provider: "lemonsqueezy" | "stripe";
  }): Promise<void> {
    if (!input.userEmail) return;

    try {
      const existing = await prisma.abandonedCheckout.findFirst({
        where: {
          email: input.userEmail,
          productId: input.product.id,
          status: "pending",
        },
      });

      if (existing) {
        await prisma.abandonedCheckout.update({
          where: { id: existing.id },
          data: {
            checkoutUrl: input.url,
            locale: input.locale,
            paymentProvider: input.provider,
          },
        });
      } else {
        await prisma.abandonedCheckout.create({
          data: {
            email: input.userEmail,
            productId: input.product.id,
            locale: input.locale,
            paymentProvider: input.provider,
            checkoutUrl: input.url,
            status: "pending",
          },
        });
      }
    } catch (err) {
      // Non-critical: log but don't fail checkout
      console.error("Failed to track abandoned checkout:", err);
    }
  }
}
