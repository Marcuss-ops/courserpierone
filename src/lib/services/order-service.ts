import { prisma } from "../db/prisma";
import { sendPurchaseConfirmation } from "./email";
import { NotFoundError } from "@/lib/errors";

export interface ProcessOrderInput {
  /** Customer email — used for find-or-create user */
  email: string;
  /** Optional customer display name */
  customerName?: string;
  /** Direct Prisma product ID (from checkout metadata) */
  productId?: string;
  /** Product slug (from LS custom_data) */
  productSlug?: string;
  /** LemonSqueezy variant ID */
  variantId?: string;
  /** Provider's own order ID (unique per provider via @@unique) */
  providerOrderId?: string;
  /** Payment provider identifier */
  paymentProvider: "lemonsqueezy";
  /** Amount in cents */
  amount: number;
  /** Currency code (eur, usd, etc.) */
  currency: string;
  /** Buyer's locale at time of purchase */
  locale: string;
  /** Customer's country code (ISO 3166-1 alpha-2, e.g. "IT", "US") — used to localize ebook download */
  customerCountry?: string | null;
  /** YouTube channel attribution (from LS customData.channelId) — written to AnalyticEvent.channelId */
  channelId?: string | null;
}

/**
 * Process a completed order from any payment provider.
 *
 * Flow:
 * 1. Find or create user by email
 * 2. Resolve product via productId / slug / variantId
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
    providerOrderId,
    paymentProvider,
    amount,
    currency,
    locale,
    // _customerCountry is the underscore-prefixed binding (varsIgnorePattern: "^_"
    // in eslint.config.mjs handles it without a per-line disable). The interface
    // field is still `customerCountry` — LS webhooks + tests pass the
    // original key.
    customerCountry: _customerCountry,
    channelId,
  } = input;

  // ── 1. Find or create user ──────────────────────────────────
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Guest checkout (no Supabase account). L'utente viene creato qui
    // per la prima volta — Phase 1.2 addendum: valorizziamo
    // preferredLocale dal parametro `locale` dell'ordine in modo che
    // la successiva sendPurchaseConfirmation (e eventuali future DM)
    // parlino la lingua giusta fin dal primo acquisto.
    //
    // Convenzione: memorizziamo il LINGUAGE-ONLY code ("it", "en",
    // "fr", ...) prendendo il primo segmento. Coerente con il
    // @default("en") di User.preferredLocale e con la catena di
    // fallback di src/lib/services/email.ts. `locale` è required
    // in ProcessOrderInput (mai null), nessun fallback defensivo
    // necessario qui.
    const signupLang = locale.split("-")[0]?.toLowerCase();
    user = await prisma.user.create({
      data: {
        email,
        name: customerName ?? email.split("@")[0],
        preferredLocale: signupLang,
      },
    });
  }
  // Update branch: NON sovrascrivere preferredLocale (snapshot al
  // primo purchase, congelato fino a future V2 settings page).

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

  if (!product) {
    console.error(
      `[OrderService] Product not found — directId: ${directProductId ?? "—"}, slug: ${productSlug ?? "—"}, variantId: ${variantId ?? "—"}`
    );
    throw new NotFoundError(
      `Product not resolvable from provided identifiers`
    );
  }

  // ── 3. Idempotency check ────────────────────────────────────
  // LS provides a unique providerOrderId for every completed checkout.
  // We de-duplicate on that id. If a future provider does not supply a
  // providerOrderId, this guard is skipped and the caller is responsible
  // for idempotency (e.g. via ProcessedWebhook).
  if (providerOrderId) {
    const existing = await prisma.order.findFirst({
      where: { paymentProvider: "lemonsqueezy", providerOrderId },
    });
    if (existing) {
      console.log(`[OrderService] Order ${providerOrderId} already exists, skipping`);
      return;
    }
  }

  // ── 4. Create order + AccessGrant ATOMICALLY via $transaction ──
  // The grant is the new source of truth for "is this user authorized
  // to access this product" (MCR Phase 2). The resolver cutover (PR 3
  // of MCR) will swap `Order.status='completed'` reads to
  // `AccessGrant.status='active'` reads behind the feature flag
  // `USE_ACCESS_GRANT_RESOLVER`.
  //
  // ATOMICITY: order.create + accessGrant.upsert are wrapped in a
  // single `prisma.$transaction`. If the upsert fails for any reason
  // (unique violation, deadlock, conn timeout), the WHOLE transaction
  // is rolled back — no orphan `Order.status='completed'` row without
  // matching AccessGrant can exist. The webhook route catches the
  // propagated error, classifies transient vs permanent, and either
  // returns 503 (LS will retry → idempotency check on retry prevents
  // double-creation) or returns 200 + ack for permanent faults
  // (NotFoundError / ValidationError).
  //
  // Idempotency strategy inside the tx: upsert + @@unique([sourceType,
  // sourceId, productId]) means concurrent retries from the explicit
  // backfill (scripts/migrate-grants-from-orders.ts) or LS re-delivery
  // safely no-op via the `update: {}` clause.
  //
  // Things OUTSIDE the transaction by design:
  //   - User find-or-create (step 1): a User created for an order
  //     that later fails to commit is harmless — User is unique by
  //     email anyway, no constraint violation possible. Keeping it
  //     outside prevents holding user-row locks during the tx.
  //   - Product resolve (step 2): read-only lookup, no point inside tx.
  //   - Idempotency check (step 3): outside so concurrent webhook
  //     retries don't waste a tx slot on what's a duplicate. The
  //     Order @@unique([paymentProvider, providerOrderId]) is the
  //     authoritative dedupe; step 3 is a fast-path early-return.
  //   - Email send / Analytics create / AbandonedCheckout.updateMany
  //     (steps 5+): fire-and-forget side-effects (network or non-
  //     critical writes). Their failures must NOT roll back the order
  //     — the order is the canonical record. They keep their per-step
  //     try/catch + console.error pattern.
  // tx returns the created Order, but the post-commit side-effects
  // (email, analytics, abandoned-checkout recovery) don't need it —
  // they read from `user`, `product`, `email`, and `channelId`. We
  // discard the return value to keep the linter quiet (`'order' is
  // assigned but never used` would otherwise fire since the only
  // reader was the in-callback `tx.accessGrant.upsert` we're now
  // wrapping here).
  await prisma.$transaction(async (tx) => {
    const o = await tx.order.create({
      data: {
        userId: user.id,
        productId: product.id,
        paymentProvider,
        providerOrderId: providerOrderId ?? null,
        amount,
        currency,
        locale,
        status: "completed",
      },
    });
    await tx.accessGrant.upsert({
      where: {
        sourceType_sourceId_productId: {
          sourceType: "order",
          sourceId: o.id,
          productId: o.productId,
        },
      },
      create: {
        userId: o.userId,
        productId: o.productId,
        sourceType: "order",
        sourceId: o.id,
        status: "active",
      },
      update: {}, // no-op: idempotent re-runs are safe
    });
    return o;
  });

  // ── 5. Ebook locale resolution: deferred to dashboard-side ─────
  // We intentionally do NOT pre-compute the ebook language here. The
  // purchase-confirmation email sends the full BCP-47 `locale` (e.g.
  // "it-it") for template routing; the actual ebook file pick is owned
  // by the dashboard route (post-login) and lives outside this service.
  // Earlier derivations (`ebookLang` + the `COUNTRY_LOCALE` import that
  // fed it) were hoisted here in error during the MCR refactor; cleared
  // per the C2 no-unused-vars sweep. Downstream consumers continue to
  // receive `customerCountry` (see destructure above) for analytics +
  // future locale hooks without forcing this service to act on it.

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // ── 6. Build email links (require auth) ─────
  // Users must log in to access their course and download the ebook.
  // The email directs them to the course portal (which redirects to login
  // if not authenticated) and the dashboard (for ebook downloads).
  const courseUrl = `${appUrl}/${locale}/${product.slug}/portal`;
  const ebookDownloadUrl = `${appUrl}/dashboard`;

  // ── 7. Send purchase confirmation email (localizzata) ─────────
  try {
    await sendPurchaseConfirmation(email, product.slug, courseUrl, locale, ebookDownloadUrl);
  } catch (emailErr) {
    console.error(`[${paymentProvider}] Failed to send purchase confirmation email:`, emailErr);
  }

  // ── 8. Track analytics event ────────────────────────────────
  // channelId is the YouTube attribution flowing in from the checkout
  // (LS customData.channelId). Stored on AnalyticEvent.channelId (the
  // dedicated column is the source of truth) rather than on Order —
  // attribution is an analytics concern, not a transactional one.
  // See V1 acceptance-test criterion #10.
  await prisma.analyticEvent
    .create({
      data: {
        productId: product.id,
        eventType: "purchase",
        ...(channelId ? { channelId } : {}),
        metadata: JSON.stringify({
          provider: paymentProvider,
          amount,
          currency,
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
