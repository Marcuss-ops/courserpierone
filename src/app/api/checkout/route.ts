import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { initLS, getStoreId } from "@/lib/payment/lemonsqueezy";
import { createCheckout } from "@lemonsqueezy/lemonsqueezy.js";
import { checkoutSchema, validationErrorResponse } from "@/lib/utils/validations";
import { parsePricesByCurrency, parseCountryOverrides } from "@/lib/utils/pricing";
import { getCurrencyFromLocale } from "@/lib/i18n/locale-resolver";
import { rateLimit, rateLimitResponse } from "@/lib/utils/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
    const rl = rateLimit(`checkout:${ip}`, 10, 60 * 1000);
    if (!rl.allowed) return rateLimitResponse(rl.resetIn);
    const session = await getServerSession(authOptions);
    const body = await request.json();
    
    // Validate body with Zod
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(
        parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        }))
      );
    }
    // Derive currency from locale if not explicitly provided
    const { productId, locale = "it", channelId } = parsed.data;
    const currency = parsed.data.currency ?? getCurrencyFromLocale(locale);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    // ─── Dynamic pricing per currency ───────────────────────────
    let effectiveLemonVariantId = product.lemonVariantId;
    let effectiveStripePriceId = product.stripePriceId;

    if (currency && product.pricesByCurrency) {
      const prices = parsePricesByCurrency(product.pricesByCurrency);
      const currencyPrices = prices?.[currency.toUpperCase()];
      if (currencyPrices) {
        effectiveLemonVariantId = currencyPrices.lemonVariantId ?? product.lemonVariantId;
        effectiveStripePriceId = currencyPrices.stripePriceId ?? product.stripePriceId;
      }
    }

    // ─── Country-specific price overrides ─────────────────────
    const country = request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry");
    if (country && product.countryOverrides) {
      const overrides = parseCountryOverrides(product.countryOverrides);
      const countryOverride = overrides?.[country.toUpperCase()];
      if (countryOverride) {
        effectiveLemonVariantId = countryOverride.lemonVariantId ?? effectiveLemonVariantId;
        effectiveStripePriceId = countryOverride.stripePriceId ?? effectiveStripePriceId;
      }
    }

    // ─── User-submitted or country-specific discount overrides ──────────────────
    let effectiveDiscountCode: string | undefined = parsed.data.couponCode;
    if (!effectiveDiscountCode && country) {
      const c = country.toUpperCase();
      const emergingCountries = ["IN", "PK", "BD", "EG", "VN", "ID", "BR", "MX", "AR", "TR", "RU", "CO", "UA"];
      if (emergingCountries.includes(c)) {
        effectiveDiscountCode = "EMERGING60";
      }
    }

    // Validate at least one payment provider is configured
    if (!effectiveLemonVariantId && !effectiveStripePriceId) {
      return NextResponse.json(
        { error: "Nessun metodo di pagamento configurato per questo prodotto. Aggiungi un Lemon Variant ID o uno Stripe Price ID." },
        { status: 400 }
      );
    }

    const userEmail = session?.user?.email ?? body.email ?? "";

    const saveAbandonedCheckout = async (checkoutUrl: string) => {
      if (!userEmail) return;
      try {
        const existing = await prisma.abandonedCheckout.findFirst({
          where: { email: userEmail, productId: product.id, status: "pending" },
        });
        if (existing) {
          await prisma.abandonedCheckout.update({
            where: { id: existing.id },
            data: {
              checkoutUrl,
              locale,
              paymentProvider: effectiveLemonVariantId ? "lemonsqueezy" : "stripe",
            },
          });
        } else {
          await prisma.abandonedCheckout.create({
            data: {
              email: userEmail,
              productId: product.id,
              locale,
              paymentProvider: effectiveLemonVariantId ? "lemonsqueezy" : "stripe",
              checkoutUrl,
              status: "pending",
            },
          });
        }
      } catch (trackErr) {
        console.error("Failed to track abandoned checkout:", trackErr);
      }
    };

    // ─── Priority 1: Lemon Squeezy (if lemonVariantId is set) ──
    if (effectiveLemonVariantId) {
      const storeId = product.lemonStoreId ?? getStoreId();
      if (!storeId) {
        return NextResponse.json(
          { error: "Lemon Squeezy store not configured. Set LEMONSQUEEZY_STORE_ID in .env or lemonStoreId on the product." },
          { status: 500 }
        );
      }

      initLS();

      const variantId = parseInt(effectiveLemonVariantId, 10);
      if (isNaN(variantId)) {
        return NextResponse.json({ error: "Invalid lemonVariantId" }, { status: 500 });
      }

      const customData: Record<string, string> = {
        courseSlug: product.slug,
        locale,
      };
      if (userEmail) customData.email = userEmail;
      if (channelId) customData.channelId = channelId;

      const checkout = await createCheckout(storeId, variantId, {
        checkoutData: {
          email: userEmail || undefined,
          custom: customData,
          discountCode: effectiveDiscountCode,
        },
        productOptions: {
          redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/${locale}/${product.slug}/download?lang=${locale}`,
          receiptButtonText: "Scarica il tuo libro",
          receiptLinkUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/${locale}/${product.slug}/download?lang=${locale}`,
        },
        // Prevent multiple checkouts for the same variant
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
      });

      if (checkout.error || !checkout.data) {
        console.error("LS checkout error:", checkout.error);
        return NextResponse.json({ error: "Checkout creation failed" }, { status: 500 });
      }

      const checkoutUrl = checkout.data.data.attributes.url;
      await saveAbandonedCheckout(checkoutUrl);

      return NextResponse.json({ url: checkoutUrl });
    }

    // ─── Fallback: Stripe (legacy) ────────────────────────────
    const { getStripe } = await import("@/lib/payment/stripe");
    const user = userEmail
      ? await prisma.user.findUnique({ where: { email: userEmail } })
      : null;

    // Resolve stripe checkout locale based on standard codes
    const lang = locale.split("-")[0];
    const supportedStripeLocales = [
      "ar", "bg", "cs", "da", "de", "el", "en", "es", "et", "fi", "fil", "fr", "he",
      "hr", "hu", "id", "it", "ja", "ko", "lt", "lv", "ms", "nb", "nl", "pl", "pt",
      "ro", "ru", "sk", "sl", "sv", "th", "tr", "vi", "zh"
    ];
    const stripeLocale = supportedStripeLocales.includes(lang) ? lang : "auto";

    const stripeSession = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: effectiveStripePriceId ?? undefined,
          quantity: 1,
        },
      ],
      customer_email: userEmail || undefined,
      locale: stripeLocale as any,
      allow_promotion_codes: true,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/${locale}/${product.slug}/download?lang=${locale}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/${product.slug}?canceled=1`,
      metadata: {
        userId: user?.id ?? "guest",
        productId: product.id,
        locale,
        customer_country: country ?? "",
      },
    });

    const checkoutUrl = stripeSession.url;
    if (checkoutUrl) {
      await saveAbandonedCheckout(checkoutUrl);
    }

    return NextResponse.json({ url: checkoutUrl });
  } catch (error) {
    console.error("POST /api/checkout error:", error);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
