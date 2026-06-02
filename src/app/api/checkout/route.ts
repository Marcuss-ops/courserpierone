import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth/auth";
import { initLS, getStoreId } from "@/lib/payment/lemonsqueezy";
import { createCheckout } from "@lemonsqueezy/lemonsqueezy.js";
import { checkoutSchema, validationErrorResponse } from "@/lib/utils/validations";
import { getCurrencyFromLocale } from "@/lib/i18n/locale-resolver";

export async function POST(request: NextRequest) {
  try {
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
      try {
        const prices = JSON.parse(product.pricesByCurrency) as Record<string, {
          price: number;
          stripePriceId?: string | null;
          lemonVariantId?: string | null;
        }>;
        const currencyPrices = prices[currency.toUpperCase()];
        if (currencyPrices) {
          effectiveLemonVariantId = currencyPrices.lemonVariantId ?? product.lemonVariantId;
          effectiveStripePriceId = currencyPrices.stripePriceId ?? product.stripePriceId;
        }
      } catch {
        // Parse error, fallback to defaults
      }
    }

    // ─── Country-specific price overrides ─────────────────────
    const country = request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry");
    if (country && product.countryOverrides) {
      try {
        const overrides = JSON.parse(product.countryOverrides) as Record<string, {
          currency: string;
          price: number;
          symbol?: string;
          lemonVariantId?: string | null;
          stripePriceId?: string | null;
        }>;
        const countryOverride = overrides[country.toUpperCase()];
        if (countryOverride) {
          effectiveLemonVariantId = countryOverride.lemonVariantId ?? effectiveLemonVariantId;
          effectiveStripePriceId = countryOverride.stripePriceId ?? effectiveStripePriceId;
        }
      } catch {
        // Parse error, fallback to defaults
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

    // ─── Track abandoned checkout ────────────────────────────
    if (userEmail) {
      try {
        // Evita duplicati: controlla se esiste già un checkout pending per stesso utente+prodotto
        const existing = await prisma.abandonedCheckout.findFirst({
          where: { email: userEmail, productId: product.id, status: "pending" },
        });
        if (!existing) {
          await prisma.abandonedCheckout.create({
            data: {
              email: userEmail,
              productId: product.id,
              locale,
              paymentProvider: effectiveLemonVariantId ? "lemonsqueezy" : "stripe",
              status: "pending",
            },
          });
        }
      } catch (trackErr) {
        // Non bloccare il checkout se il tracking fallisce
        console.error("Failed to track abandoned checkout:", trackErr);
      }
    }

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
        },
        productOptions: {
          redirectUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/${product.slug}?success=1`,
          receiptButtonText: "Accedi al Corso",
          receiptLinkUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/${product.slug}/curso/lesson-1?lang=${locale}`,
        },
        // Prevent multiple checkouts for the same variant
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
      });

      if (checkout.error || !checkout.data) {
        console.error("LS checkout error:", checkout.error);
        return NextResponse.json({ error: "Checkout creation failed" }, { status: 500 });
      }

      return NextResponse.json({ url: checkout.data.data.attributes.url });
    }

    // ─── Fallback: Stripe (legacy) ────────────────────────────
    const { getStripe } = await import("@/lib/payment/stripe");
    const user = userEmail
      ? await prisma.user.findUnique({ where: { email: userEmail } })
      : null;

    const stripeSession = await getStripe().checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price: effectiveStripePriceId ?? undefined,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/${product.slug}?success=1`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/${product.slug}?canceled=1`,
      metadata: {
        userId: user?.id ?? "guest",
        productId: product.id,
        locale,
      },
    });

    return NextResponse.json({ url: stripeSession.url });
  } catch (error) {
    console.error("POST /api/checkout error:", error);
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
