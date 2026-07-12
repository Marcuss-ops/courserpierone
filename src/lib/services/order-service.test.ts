import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock dependencies BEFORE importing the service ─────────
// Pattern established by src/app/api/products/products.test.ts
vi.mock("@/lib/db/prisma", () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    product: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    order: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    abandonedCheckout: {
      updateMany: vi.fn(),
    },
    analyticEvent: {
      create: vi.fn(),
    },
    // MCR Phase 2 — AccessGrant dual-write. Resolver cutover is PR 3.
    accessGrant: {
      upsert: vi.fn(),
    },
  };
  return { prisma: mockPrisma };
});

vi.mock("./email", () => ({
  sendPurchaseConfirmation: vi.fn(),
  sendAbandonedCheckoutEmail: vi.fn(),
}));

// Analytics helper uses real COUNTRY_LOCALE — import as-is
import { prisma } from "@/lib/db/prisma";
import { sendPurchaseConfirmation } from "./email";
import { processOrder, type ProcessOrderInput } from "./order-service";
import { NotFoundError } from "@/lib/errors";

// ─── Helpers ───────────────────────────────────────────────
function resetMocks() {
  vi.clearAllMocks();

  // Default: user resolved by email
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: "user_123",
    email: "buyer@example.com",
    name: "Buyer",
    role: "student",
  } as never);

  // Default: product resolved by id (Stripe path)
  vi.mocked(prisma.product.findUnique).mockResolvedValue({
    id: "prod_abc",
    slug: "test-course",
    price: 4900,
    currency: "eur",
  } as never);

  // Default: order does NOT yet exist (idempotency)
  vi.mocked(prisma.order.findUnique).mockResolvedValue(null);
  vi.mocked(prisma.order.findFirst).mockResolvedValue(null);

  // Default: abandoned updateMany is a no-op
  vi.mocked(prisma.abandonedCheckout.updateMany).mockResolvedValue({ count: 0 });

  // Default: analytics succeeds
  vi.mocked(prisma.analyticEvent.create).mockResolvedValue({} as never);

  // Default: email send succeeds
  vi.mocked(sendPurchaseConfirmation).mockResolvedValue(undefined as never);

  // Default: order.create succeeds with valid shape — required for
  // the MCR Phase 2 AccessGrant upsert since it reads `order.id`,
  // `order.userId`, `order.productId` from the create response.
  vi.mocked(prisma.order.create).mockResolvedValue({
    id: "order_test_id",
    userId: "user_123",
    productId: "prod_abc",
    paymentProvider: "stripe",
    amount: 4900,
    currency: "eur",
    locale: "it-it",
    status: "completed",
  } as never);

  // Default: AccessGrant.upsert succeeds (MCR Phase 2 dual-write).
  vi.mocked(prisma.accessGrant.upsert).mockResolvedValue({
    id: "grant_test_id",
    userId: "user_123",
    productId: "prod_abc",
    sourceType: "order",
    sourceId: "order_test_id",
    status: "active",
  } as never);
}

function buildStripeInput(overrides: Partial<ProcessOrderInput> = {}): ProcessOrderInput {
  return {
    email: "buyer@example.com",
    customerName: "Buyer",
    productId: "prod_abc",
    paymentProvider: "stripe",
    amount: 4900,
    currency: "eur",
    locale: "it-it",
    customerCountry: "IT",
    stripeSessionId: `cs_test_${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

function buildLsInput(overrides: Partial<ProcessOrderInput> = {}): ProcessOrderInput {
  return {
    email: "buyer@example.com",
    customerName: "Buyer",
    productSlug: "test-course",
    variantId: "12345",
    paymentProvider: "lemonsqueezy",
    providerOrderId: `ls_order_${Math.random().toString(36).slice(2)}`,
    amount: 4900,
    currency: "usd",
    locale: "en-us",
    customerCountry: "US",
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────
// ─── Stripe success path ──────────────────────────────────

describe("processOrder — Stripe success path", () => {
  beforeEach(resetMocks);

  it("creates a completed order on first call (scenario 1)", async () => {
    // Default mock already returns a valid order with userId/productId.
    // No override needed — assertion on the input shape works.

    await processOrder(buildStripeInput());

    expect(prisma.order.create).toHaveBeenCalledOnce();
    const createArg = vi.mocked(prisma.order.create).mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      userId: "user_123",
      productId: "prod_abc",
      paymentProvider: "stripe",
      status: "completed",
      amount: 4900,
      currency: "eur",
      locale: "it-it",
    });
    expect(createArg.data.stripeSessionId).toMatch(/^cs_test_/);
  });

  it("calls find-or-create user by email and falls back name to email local-part", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user_new",
      email: "newbuyer@example.com",
      name: "newbuyer",
    } as never);
    // update order.create to reflect the new user
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: "order_new",
      userId: "user_new",
      productId: "prod_abc",
      paymentProvider: "stripe",
      status: "completed",
    } as never);

    // Override customerName to undefined so production code falls back to email.split('@')[0]
    await processOrder({
      ...buildStripeInput(),
      email: "newbuyer@example.com",
      customerName: undefined,
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "newbuyer@example.com" },
    });
    // Phase 1.2 addendum: preferredLocale backfill al signup — guest
    // checkout valorizza User.preferredLocale dal parametro `locale`
    // dell'ordine. Input default: locale="it-it" → preferredLocale="it".
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: "newbuyer@example.com",
        name: "newbuyer",
        preferredLocale: "it",
      },
    });
  });

  it("calls sendPurchaseConfirmation with localized links", async () => {
    // override order.create to make sure its id/userId/productId align
    // with the IT-IT locale variant
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: "order_en_us",
      userId: "user_123",
      productId: "prod_abc",
      paymentProvider: "stripe",
      status: "completed",
    } as never);

    await processOrder(buildStripeInput({ locale: "en-us", customerCountry: "US" }));

    const emailArgs = vi.mocked(sendPurchaseConfirmation).mock.calls[0];
    expect(emailArgs[0]).toBe("buyer@example.com");
    expect(emailArgs[1]).toBe("test-course");
    expect(emailArgs[2]).toMatch(/\/en-us\/test-course\/portal/);
    expect(emailArgs[3]).toBe("en-us");
    expect(emailArgs[4]).toMatch(/\/dashboard/);
  });
});

// ─── MCR Phase 2 — AccessGrant dual-write ──────────────────

describe("processOrder — MCR Phase 2 AccessGrant dual-write", () => {
  beforeEach(resetMocks);

  it("upserts an active AccessGrant alongside the Order on Stripe success", async () => {
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: "order_dual_write",
      userId: "user_123",
      productId: "prod_abc",
      paymentProvider: "stripe",
      status: "completed",
    } as never);

    await processOrder(buildStripeInput());

    expect(prisma.accessGrant.upsert).toHaveBeenCalledOnce();

    const upsertArg = vi.mocked(prisma.accessGrant.upsert).mock.calls[0][0];
    expect(upsertArg.where).toEqual({
      sourceType_sourceId_productId: {
        sourceType: "order",
        sourceId: "order_dual_write",
        productId: "prod_abc",
      },
    });
    expect(upsertArg.create).toMatchObject({
      userId: "user_123",
      productId: "prod_abc",
      sourceType: "order",
      sourceId: "order_dual_write",
      status: "active",
    });
    expect(upsertArg.update).toEqual({});
  });

  it("upserts an active AccessGrant alongside the Order on LemonSqueezy success", async () => {
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: "order_ls_dual",
      userId: "user_123",
      productId: "prod_abc",
      paymentProvider: "lemonsqueezy",
      status: "completed",
    } as never);

    await processOrder(buildLsInput());

    expect(prisma.accessGrant.upsert).toHaveBeenCalledOnce();
    const upsertArg = vi.mocked(prisma.accessGrant.upsert).mock.calls[0][0];
    expect(upsertArg.create).toMatchObject({
      sourceType: "order",
      sourceId: "order_ls_dual",
      status: "active",
    });
  });

  it("tolerates AccessGrant.upsert failure (does NOT throw)", async () => {
    vi.mocked(prisma.accessGrant.upsert).mockRejectedValue(
      new Error("dual-write boom"),
    );

    await expect(
      processOrder(buildStripeInput())
    ).resolves.toBeUndefined();

    expect(prisma.order.create).toHaveBeenCalledOnce();
    expect(prisma.analyticEvent.create).toHaveBeenCalledOnce();
  });

  it("does NOT upsert a grant when the order already exists (idempotency)", async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: "order_existing",
    } as never);

    await processOrder(buildStripeInput());

    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.accessGrant.upsert).not.toHaveBeenCalled();
  });

  it("does NOT upsert a grant when the LS provider order id already exists (idempotency)", async () => {
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: "order_ls_existing",
    } as never);

    await processOrder(buildLsInput());

    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.accessGrant.upsert).not.toHaveBeenCalled();
  });
});

// ─── Idempotency (already-shipped behavior, now also covering grant) ──

describe("processOrder — idempotency (scenario 3)", () => {
  beforeEach(resetMocks);

  it("skips creation when stripeSessionId already exists (Stripe)", async () => {
    const existingSession = "cs_test_existing";
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: "order_existing",
      stripeSessionId: existingSession,
    } as never);

    await processOrder(buildStripeInput({ stripeSessionId: existingSession }));

    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.accessGrant.upsert).not.toHaveBeenCalled();
    expect(sendPurchaseConfirmation).not.toHaveBeenCalled();
    expect(prisma.analyticEvent.create).not.toHaveBeenCalled();
    expect(prisma.abandonedCheckout.updateMany).not.toHaveBeenCalled();
  });

  it("skips creation when providerOrderId already exists (LemonSqueezy)", async () => {
    const existingOrderId = "ls_order_existing";
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: "order_existing",
      paymentProvider: "lemonsqueezy",
      providerOrderId: existingOrderId,
    } as never);

    await processOrder(buildLsInput({ providerOrderId: existingOrderId }));

    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.accessGrant.upsert).not.toHaveBeenCalled();
    expect(sendPurchaseConfirmation).not.toHaveBeenCalled();
  });

  it("does NOT trigger side effects on duplicate call (defensive)", async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue({
      id: "order_existing",
    } as never);

    await processOrder(buildStripeInput());

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.abandonedCheckout.updateMany).not.toHaveBeenCalled();
    expect(prisma.analyticEvent.create).not.toHaveBeenCalled();
    expect(prisma.accessGrant.upsert).not.toHaveBeenCalled();
  });
});

// ─── Email failure tolerance (scenario 9) ─────────────────────

describe("processOrder — email failure tolerance (scenario 9)", () => {
  beforeEach(resetMocks);

  it("does NOT throw when sendPurchaseConfirmation fails", async () => {
    vi.mocked(sendPurchaseConfirmation).mockRejectedValue(
      new Error("SMTP temporarily unavailable")
    );

    await expect(
      processOrder(buildStripeInput())
    ).resolves.toBeUndefined();

    expect(prisma.order.create).toHaveBeenCalledOnce();
    expect(prisma.accessGrant.upsert).toHaveBeenCalledOnce();
  });

  it("still records analytics event even when email fails", async () => {
    vi.mocked(sendPurchaseConfirmation).mockRejectedValue(new Error("mail 421"));

    await processOrder(buildStripeInput());

    expect(prisma.analyticEvent.create).toHaveBeenCalledOnce();
    const analyticsArg = vi.mocked(prisma.analyticEvent.create).mock.calls[0][0];
    expect(analyticsArg.data).toMatchObject({
      productId: "prod_abc",
      eventType: "purchase",
    });
  });

  it("still recovers abandoned checkouts when email fails", async () => {
    vi.mocked(sendPurchaseConfirmation).mockRejectedValue(new Error("boom"));

    vi.mocked(prisma.abandonedCheckout.updateMany)
      .mockResolvedValueOnce({ count: 1 });

    await processOrder(buildStripeInput());

    expect(prisma.abandonedCheckout.updateMany).toHaveBeenCalledOnce();
    const updateArg = vi.mocked(prisma.abandonedCheckout.updateMany).mock.calls[0][0];
    expect(updateArg.where).toMatchObject({
      email: "buyer@example.com",
      productId: "prod_abc",
      status: "pending",
    });
    expect(updateArg.data).toEqual({ status: "recovered" });
  });
});

// ─── Abandoned checkout recovery (scenario 6) ─────────────────

describe("processOrder — abandoned checkout recovery (scenario 6)", () => {
  beforeEach(resetMocks);

  it("marks matching pending abandoned checkouts as recovered", async () => {
    vi.mocked(prisma.abandonedCheckout.updateMany).mockResolvedValue({ count: 2 });

    await processOrder(buildStripeInput());

    expect(prisma.abandonedCheckout.updateMany).toHaveBeenCalledWith({
      where: {
        email: "buyer@example.com",
        productId: "prod_abc",
        status: "pending",
      },
      data: { status: "recovered" },
    });
  });

  it("tolerates abandoned-checkout recovery failure (does not rollback order)", async () => {
    vi.mocked(prisma.abandonedCheckout.updateMany).mockRejectedValue(
      new Error("abandoned table unreachable")
    );

    await expect(
      processOrder(buildStripeInput())
    ).resolves.toBeUndefined();

    expect(prisma.order.create).toHaveBeenCalledOnce();
    expect(prisma.accessGrant.upsert).toHaveBeenCalledOnce();
  });
});

// ─── Product resolution ────────────────────────────────────

describe("processOrder — product resolution", () => {
  beforeEach(resetMocks);

  it("resolves product via direct productId when provided (Stripe)", async () => {
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: "order_direct",
      userId: "user_123",
      productId: "prod_direct",
      paymentProvider: "stripe",
      status: "completed",
    } as never);

    await processOrder(buildStripeInput({ productId: "prod_direct" }));

    expect(prisma.product.findUnique).toHaveBeenCalledWith({
      where: { id: "prod_direct" },
    });
  });

  it("resolves product via slug when no productId is provided (LS path)", async () => {
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: "order_ls_slug",
      userId: "user_123",
      productId: "prod_abc",
      paymentProvider: "lemonsqueezy",
      status: "completed",
    } as never);

    // LS path defaults: no productId, productSlug="test-course"
    await processOrder(buildLsInput());

    expect(prisma.product.findUnique).toHaveBeenCalledWith({
      where: { slug: "test-course" },
    });
  });

  it("falls back to variantId lookup when productId AND slug both miss (LS path)", async () => {
    // Override: provide an explicit (but missing) productId and a missing slug.
    // The chain: id miss -> slug miss -> variantId match.
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null); // default: null
    vi.mocked(prisma.product.findFirst).mockResolvedValueOnce({
      id: "prod_abc",
      slug: "test-course",
    } as never);
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: "order_ls_variant",
      userId: "user_123",
      productId: "prod_abc",
      paymentProvider: "lemonsqueezy",
      status: "completed",
    } as never);

    await processOrder(
      buildLsInput({
        productId: "prod_unknown",
        productSlug: "unknown-slug",
      })
    );

    expect(prisma.product.findUnique).toHaveBeenCalledTimes(2);
    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { lemonVariantId: "12345" },
    });
  });

  it("throws NotFoundError when no product is resolvable via any identifier", async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null);

    const promise = processOrder(
      buildLsInput({
        productId: "prod_unknown",
        productSlug: "unknown-slug",
        variantId: "unknown_variant",
      })
    );

    await expect(promise).rejects.toThrow(/not resolvable/i);

    // Webhook handler relies on this exact subclass to ack gracefully (see
    // src/app/api/webhooks/stripe/route.ts and .../lemonsqueezy/route.ts).
    await expect(
      processOrder(
        buildLsInput({
          productId: "prod_unknown",
          productSlug: "unknown-slug",
          variantId: "unknown_variant",
        })
      )
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.accessGrant.upsert).not.toHaveBeenCalled();
  });
});

// ─── Analytics & metadata ──────────────────────────────────

describe("processOrder — analytics & metadata", () => {
  beforeEach(resetMocks);

  it("stores provider/session/amount/currency in analytics metadata", async () => {
    await processOrder(
      buildStripeInput({
        stripeSessionId: "cs_metadata_test",
        amount: 9900,
        currency: "usd",
      })
    );

    const call = vi.mocked(prisma.analyticEvent.create).mock.calls[0][0];
    expect(call.data.eventType).toBe("purchase");
    const metadata = JSON.parse(call.data.metadata!);
    expect(metadata).toMatchObject({
      provider: "stripe",
      amount: 9900,
      currency: "usd",
      stripeSessionId: "cs_metadata_test",
    });
  });

  it("tolerates analytics failure (does not throw)", async () => {
    vi.mocked(prisma.analyticEvent.create).mockRejectedValue(new Error("analytics down"));

    await expect(processOrder(buildStripeInput())).resolves.toBeUndefined();
  });
});

// ─── Full idempotency proof (defence in depth) ─────────────

describe("processOrder — full idempotency proof (defence in depth)", () => {
  beforeEach(resetMocks);

  it("two identical Stripe calls → exactly one order, one email, one analytics event, one grant", async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: "order_existing",
    } as never);

    const sessionId = "cs_replay_test";
    const first = buildStripeInput({ stripeSessionId: sessionId });

    await processOrder(first);
    await processOrder({ ...first, stripeSessionId: sessionId });

    expect(prisma.order.create).toHaveBeenCalledOnce();
    expect(prisma.accessGrant.upsert).toHaveBeenCalledOnce();
    expect(sendPurchaseConfirmation).toHaveBeenCalledOnce();
    expect(prisma.analyticEvent.create).toHaveBeenCalledOnce();
  });
});
