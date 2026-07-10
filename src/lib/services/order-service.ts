import { prisma } from "../db/prisma";
import { sendPurchaseConfirmation } from "./email";
import { COUNTRY_LOCALE } from "@/lib/i18n/_generated/locale-data";
import { NotFoundError } from "@/lib/errors";

export interface ProcessOrderInput {
  /** Customer email — used for find-or-create user */
  email: string;
  /** Optional customer display name */
  customerName?: string;
  /** Direct Prisma product ID (from Stripe session metadata) */
  productId?: string;
  /** Product slug (from LS custom_data) */
  productSlug?: string;
  /** LemonSqueezy variant ID */
  variantId?: string;
  /** Stripe price ID */
  stripePriceId?: string;
  /** Stripe session ID (unique constraint on Order.stripeSessionId) */
  stripeSessionId?: string;
  /** Provider's own order ID (unique per provider via @@unique) */
  providerOrderId?: string;
  /** Payment provider identifier */
  paymentProvider: "stripe" | "lemonsqueezy";
  /** Amount in cents */
  amount: number;
  /** Currency code (eur, usd, etc.) */
  currency: string;
  /** Buyer's locale at time of purchase */
  locale: string;
  /** Customer's country code (ISO 3166-1 alpha-2, e.g. "IT", "US") — used to localize ebook download */
  customerCountry?: string | null;
}

/**
 * Process a completed order from any payment provider.
 *
 * Flow:
 * 1. Find or create user by email
 * 2. Resolve product via productId / slug / variantId / stripePriceId
 * 3. Idempotency check (skip if order already exists)
 * 4. Create order
 * 5. Send purchase confirmation email
 * 7. Track analytics purchase event
 */
export async function processOrder(input: ProcessOrderInput): Promise<void> {
  const {
    email,
    customerName,
    productId: directProductId,
    productSlug,
    variantId,
    stripePriceId,
    stripeSessionId,
    providerOrderId,
    paymentProvider,
    amount,
    currency,
    locale,
    customerCountry,
  } = input;

  // ── 1. Find or create user ──────────────────────────────────
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email,
        name: customerName ?? email.split("@")[0],
      },
    });
  }

  // ── 2. Resolve product ──────────────────────────────────────
  let product = null;

  if (directProductId) {
    product = await prisma.product.findUnique({ where: { id: directProductId } });
  }

  if (!product && productSlug) {
    product = await prisma.product.findUnique({ where: { slug: productSlug } });
  }

  if (!product && variantId) {
    product = await prisma.product.findFirst({
      where: { lemonVariantId: variantId },
    });
  }

  if (!product && stripePriceId) {
    product = await prisma.product.findFirst({
      where: { stripePriceId },
    });
  }

  if (!product) {
    console.error(
      `[OrderService] Product not found — directId: ${directProductId ?? "—"}, slug: ${productSlug ?? "—"}, variantId: ${variantId ?? "—"}, stripePriceId: ${stripePriceId ?? "—"}`
    );
    throw new NotFoundError(
      `Product not resolvable from provided identifiers`
    );
  }

  // ── 3. Idempotency check ────────────────────────────────────
  if (stripeSessionId) {
    const existing = await prisma.order.findUnique({
      where: { stripeSessionId },
    });
    if (existing) {
      console.log(`[OrderService] Order for Stripe session ${stripeSessionId} already exists, skipping`);
      return;
    }
  }

  if (paymentProvider === "lemonsqueezy" && providerOrderId) {
    const existing = await prisma.order.findFirst({
      where: { paymentProvider: "lemonsqueezy", providerOrderId },
    });
    if (existing) {
      console.log(`[OrderService] Order ${providerOrderId} already exists, skipping`);
      return;
    }
  }

  // ── 4. Create order ─────────────────────────────────────────
  await prisma.order.create({
    data: {
      userId: user.id,
      productId: product.id,
      paymentProvider,
      stripeSessionId: stripeSessionId ?? null,
      providerOrderId: providerOrderId ?? null,
      amount,
      currency,
      locale,
      status: "completed",
    },
  });

  // ── 5. Resolve ebook locale from country ────────────────────────
  // Use customer_country → COUNTRY_LOCALE mapping, fallback to locale param, then "en"
  const ebookLang = (customerCountry && COUNTRY_LOCALE[customerCountry])
    ? COUNTRY_LOCALE[customerCountry].split("-")[0]
    : (locale.split("-")[0] ?? "en");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // ── 6. Build email links (require auth) ─────
  // Users must log in to access their course and download the ebook.
  // The email directs them to the course portal (which redirects to login
  // if not authenticated) and the dashboard (for ebook downloads).
  const courseUrl = `${appUrl}/${product.slug}/portal?lang=${ebookLang}`;
  const ebookDownloadUrl = `${appUrl}/dashboard`;

  // ── 7. Send purchase confirmation email (localizzata) ─────────
  try {
    await sendPurchaseConfirmation(email, product.slug, courseUrl, locale, ebookDownloadUrl);
  } catch (emailErr) {
    console.error(`[${paymentProvider}] Failed to send purchase confirmation email:`, emailErr);
  }

  // ── 8. Track analytics event ────────────────────────────────
  await prisma.analyticEvent
    .create({
      data: {
        productId: product.id,
        eventType: "purchase",
        metadata: JSON.stringify({
          provider: paymentProvider,
          amount,
          currency,
          ...(stripeSessionId ? { stripeSessionId } : {}),
          ...(providerOrderId ? { providerOrderId } : {}),
        }),
        userId: user.id,
      },
    })
    .catch((e) => console.warn(`[${paymentProvider}] Failed to track analytics event:`, e));

  // ── 9. Recover abandoned checkout ────────────────────────────
  try {
    await prisma.abandonedCheckout.updateMany({
      where: {
        email,
        productId: product.id,
        status: "pending",
      },
      data: {
        status: "recovered",
      },
    });
    console.log(`[OrderService] Marked abandoned checkouts for ${email} as recovered`);
  } catch (recoverErr) {
    console.error("[OrderService] Failed to mark abandoned checkouts as recovered:", recoverErr);
  }

  console.log(`[OrderService] Order created: user=${user.id}, product=${product.slug}, provider=${paymentProvider}`);
}
