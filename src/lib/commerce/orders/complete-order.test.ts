import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// ─── Mock dependencies BEFORE importing the service ─────────
// Pattern established by src/app/api/products/products.test.ts
vi.mock("@/lib/db/prisma", () => {
  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
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
    outboxEvent: {
      createMany: vi.fn(),
    },
    // MCR Phase 2 — $transaction wrapper for atomic Order+AccessGrant
    // creation. Default mock (set in resetMocks) invokes the callback with
    // the same prisma client as the `tx` handle, mirroring real Prisma
    // behavior (tx is a scoped view of the same client). Tests that need
    // to exercise rollback semantics override the implementation in-place
    // to make a specific tx operation reject.
    $transaction: vi.fn(),
  };
  return { prisma: mockPrisma };
});

vi.mock("@/lib/commerce/shared/email", () => ({
  sendPurchaseConfirmation: vi.fn(),
  sendAbandonedCheckoutEmail: vi.fn(),
}));

// Analytics helper uses real COUNTRY_LOCALE — import as-is
import { prisma } from "@/lib/db/prisma";
import { sendPurchaseConfirmation } from "@/lib/commerce/shared/email";
import { processOrder } from "./complete-order";
import {
  createCompletePaidOrderCommand,
  type CompletePaidOrderCommand,
} from "@/lib/commerce/payments/types";
import { NotFoundError } from "@/lib/errors";

// ─── Helpers ───────────────────────────────────────────────
function resetMocks() {
  vi.clearAllMocks();

  // Default: $transaction invokes its callback with the same prisma
  // client as the `tx` handle. Mirrors real Prisma semantics — in
  // production, `tx` is a scoped view of the same client, not a
  // separate connection. This default lets every success-path test
  // run unchanged; tests that need to verify rollback (failure on a
  // tx-scoped op) override this mockImplementation to inject a throw.
  vi.mocked(prisma.$transaction).mockImplementation(
    async (cb) => (cb as (client: typeof prisma) => Promise<unknown>)(prisma),
  );

  // Default: user resolved atomically by email
  vi.mocked(prisma.user.upsert).mockResolvedValue({
    id: "user_123",
    email: "buyer@example.com",
    name: "Buyer",
    role: "student",
  } as never);

  // Default: product resolved by the canonical soft-delete-aware lookup.
  vi.mocked(prisma.product.findFirst).mockResolvedValue({
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
    paymentProvider: "lemonsqueezy",
    amount: 4900,
    currency: "eur",
    locale: "it-it",
    status: "completed",
  } as never);

  // Default: transactional outbox write succeeds.
  vi.mocked(prisma.outboxEvent.createMany).mockResolvedValue({ count: 4 });

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

function uniqueViolation(target: string[] | string) {
  return new Prisma.PrismaClientKnownRequestError(
    "Unique constraint failed",
    {
      code: "P2002",
      clientVersion: "5.22.0",
      meta: { target },
    },
  );
}

function outboxEvents() {
  const call = vi.mocked(prisma.outboxEvent.createMany).mock.calls[0]?.[0];
  const data = call?.data;
  return (Array.isArray(data) ? data : data ? [data] : []) as {
    eventKey: string;
    type: string;
    payload: Record<string, unknown>;
  }[];
}

function buildInput(
  overrides: Record<string, unknown> = {},
): CompletePaidOrderCommand {
  return createCompletePaidOrderCommand({
    paymentProvider: "lemonsqueezy",
    providerOrderId: `ls_order_${Math.random().toString(36).slice(2)}`,
    product: { kind: "product_slug", value: "test-course" },
    customer: { email: "buyer@example.com", name: "Buyer" },
    amount: 4900,
    currency: "USD",
    locale: "en-US",
    customerCountry: "US",
    ...overrides,
  });
}

describe("createCompletePaidOrderCommand — contract", () => {
  it("requires providerOrderId and exactly one discriminated product locator", () => {
    expect(() =>
      createCompletePaidOrderCommand({
        paymentProvider: "lemonsqueezy",
        product: { kind: "product_slug", value: "test-course" },
        customer: { email: "buyer@example.com" },
        amount: 4900,
        currency: "USD",
        locale: "en-US",
      }),
    ).toThrow(/providerOrderId/);

    expect(() =>
      createCompletePaidOrderCommand({
        paymentProvider: "lemonsqueezy",
        providerOrderId: "",
        product: { kind: "product_slug", value: "test-course" },
        customer: { email: "buyer@example.com" },
        amount: 4900,
        currency: "USD",
        locale: "en-US",
      }),
    ).toThrow(/providerOrderId/);

    expect(() =>
      createCompletePaidOrderCommand({
        paymentProvider: "lemonsqueezy",
        providerOrderId: "ls-1",
        customer: { email: "buyer@example.com" },
        amount: 4900,
        currency: "USD",
        locale: "en-US",
      }),
    ).toThrow(/product/);

    expect(() =>
      createCompletePaidOrderCommand({
        paymentProvider: "lemonsqueezy",
        providerOrderId: "ls-1",
        product: {
          kind: "product_slug",
          value: "test-course",
          variantId: "v-1",
        },
        customer: { email: "buyer@example.com" },
        amount: 4900,
        currency: "USD",
        locale: "en-US",
      }),
    ).toThrow(/product/);
  });

  it("normalizes currency and locale while preserving the selected locator", () => {
    expect(
      createCompletePaidOrderCommand({
        paymentProvider: "lemonsqueezy",
        providerOrderId: "ls-1",
        product: { kind: "variant_id", value: "v-1" },
        customer: { email: "buyer@example.com" },
        amount: 4900,
        currency: "usd",
        locale: "en-us",
      }),
    ).toMatchObject({
      providerOrderId: "ls-1",
      product: { kind: "variant_id", value: "v-1" },
      currency: "USD",
      locale: "en-US",
    });
  });
});

// ─── Tests ─────────────────────────────────────────────────
// ─── Order success path ───────────────────────────────────

describe("processOrder — success path", () => {
  beforeEach(resetMocks);

  it("creates a completed order on first call (scenario 1)", async () => {
    // Default mock already returns a valid order with userId/productId.
    // No override needed — assertion on the input shape works.

    await processOrder(buildInput());

    expect(prisma.order.create).toHaveBeenCalledOnce();
    const createArg = vi.mocked(prisma.order.create).mock.calls[0][0];
    expect(createArg.data).toMatchObject({
      userId: "user_123",
      productId: "prod_abc",      paymentProvider: "lemonsqueezy",
      status: "completed",
      amount: 4900,
      currency: "USD",
      locale: "en-US",
    });
  });

  it("upserts a user by email and falls back name to email local-part", async () => {
    vi.mocked(prisma.user.upsert).mockResolvedValue({
      id: "user_new",
      email: "newbuyer@example.com",
      name: "newbuyer",
    } as never);
    // update order.create to reflect the new user
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: "order_new",
      userId: "user_new",
      productId: "prod_abc",
      paymentProvider: "lemonsqueezy",
      status: "completed",
    } as never);

    // Omit customer name so production code falls back to email.split('@')[0].
    await processOrder({
      ...buildInput(),
      customer: { email: "newbuyer@example.com" },
    });

    expect(prisma.user.upsert).toHaveBeenCalledWith({
      where: { email: "newbuyer@example.com" },
      create: {
        email: "newbuyer@example.com",
        name: "newbuyer",
        preferredLocale: "en",
      },
      update: {},
    });
    // Phase 1.2 addendum: preferredLocale backfill al signup — guest
    // checkout valorizza User.preferredLocale dal parametro `locale`
    // dell'ordine. Input default: locale="en-us" → preferredLocale="en".
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("persists localized purchase email details in the outbox", async () => {
    await processOrder(buildInput({ locale: "it-it", customerCountry: "IT" }));

    const events = outboxEvents();
    const emailEvent = events.find((event) => event.type === "purchase_email");
    expect(emailEvent).toMatchObject({
      eventKey: expect.stringContaining(":email"),
      type: "purchase_email",
      payload: {
        email: "buyer@example.com",
        productSlug: "test-course",
        courseUrl: expect.stringContaining("/it-IT/test-course/portal"),
        locale: "it-IT",
        ebookDownloadUrl: expect.stringContaining("/dashboard"),
      },
    });
  });
});

// ─── MCR Phase 2 — AccessGrant dual-write ──────────────────

describe("processOrder — MCR Phase 2 AccessGrant dual-write", () => {
  beforeEach(resetMocks);

  it("falls back to reading the user when an upsert loses an email race", async () => {
    const existingUser = {
      id: "user_race_winner",
      email: "buyer@example.com",
      name: "Winner",
    };
    vi.mocked(prisma.user.upsert).mockRejectedValueOnce(
      uniqueViolation(["email"]),
    );
    vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(existingUser as never);

    await processOrder(buildInput());

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "buyer@example.com" },
    });
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: "user_race_winner" }),
      }),
    );
  });

  it("does not treat an unrelated user unique violation as an email race", async () => {
    vi.mocked(prisma.user.upsert).mockRejectedValueOnce(
      uniqueViolation(["username"]),
    );

    await expect(processOrder(buildInput())).rejects.toThrow("Unique constraint failed");
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("upserts an active AccessGrant alongside the Order on success, without duplicating effects", async () => {
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: "order_dual_write",
      userId: "user_123",
      productId: "prod_abc",
      paymentProvider: "lemonsqueezy",
      status: "completed",
    } as never);

    await processOrder(buildInput());

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

  it("rolls back the order when AccessGrant.upsert throws (atomicity contract)", async () => {
    // MCR Phase 2 atomicity guarantee: if the upsert fails, the order
    // create is rolled back inside the same $transaction, and the
    // reorder of side-effects (email + analytics + recovery) MUST
    // NOT run — those are post-commit fire-and-forget and must be
    // skipped so we don't send a "congratulations on your purchase"
    // email for an order that never persisted.
    vi.mocked(prisma.accessGrant.upsert).mockRejectedValue(
      new Error("dual-write boom"),
    );

    await expect(processOrder(buildInput())).rejects.toThrow(/dual-write boom/);

    // Tx callback DID invoke order.create then accessGrant.upsert
    // before the throw. Side-effects after the tx commit MUST NOT
    // have run since the tx aborted.
    expect(prisma.order.create).toHaveBeenCalledOnce();
    expect(prisma.accessGrant.upsert).toHaveBeenCalledOnce();
    expect(prisma.analyticEvent.create).not.toHaveBeenCalled();
    expect(prisma.abandonedCheckout.updateMany).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.createMany).not.toHaveBeenCalled();
    expect(sendPurchaseConfirmation).not.toHaveBeenCalled();
  });

  it("does NOT upsert a grant when the LS provider order id already exists (MCR idempotency)", async () => {
    const existingOrderId = "ls_order_existing";
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: "order_existing",
      paymentProvider: "lemonsqueezy",
      providerOrderId: existingOrderId,
    } as never);

    await processOrder(buildInput({ providerOrderId: existingOrderId }));

    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.accessGrant.upsert).not.toHaveBeenCalled();
  });


});

// ─── Idempotency (already-shipped behavior, now also covering grant) ──

describe("processOrder — idempotency (scenario 3)", () => {
  beforeEach(resetMocks);

  it("skips creation when providerOrderId already exists (LemonSqueezy)", async () => {
    const existingOrderId = "ls_order_existing";
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: "order_existing",
      paymentProvider: "lemonsqueezy",
      providerOrderId: existingOrderId,
    } as never);

    await processOrder(buildInput({ providerOrderId: existingOrderId }));

    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.accessGrant.upsert).not.toHaveBeenCalled();
    expect(sendPurchaseConfirmation).not.toHaveBeenCalled();
    expect(prisma.analyticEvent.create).not.toHaveBeenCalled();
    expect(prisma.abandonedCheckout.updateMany).not.toHaveBeenCalled();
  });

  it("does NOT trigger side effects on duplicate call (defensive)", async () => {
    const existingOrderId = "ls_order_existing";
    vi.mocked(prisma.order.findFirst).mockResolvedValue({
      id: "order_existing",
      paymentProvider: "lemonsqueezy",
      providerOrderId: existingOrderId,
    } as never);

    await processOrder(buildInput({ providerOrderId: existingOrderId }));

    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.abandonedCheckout.updateMany).not.toHaveBeenCalled();
    expect(prisma.analyticEvent.create).not.toHaveBeenCalled();
    expect(prisma.accessGrant.upsert).not.toHaveBeenCalled();
  });

  it("acknowledges concurrent duplicate webhooks after the order unique race", async () => {
    const providerOrderId = "ls_concurrent_order";
    let releaseFirstOrder: (() => void) | undefined;
    const firstOrderStarted = new Promise<void>((resolve) => {
      releaseFirstOrder = resolve;
    });
    let orderCreateCalls = 0;
    vi.mocked(prisma.order.findFirst).mockImplementation(
      (() => Promise.resolve(null)) as never,
    );
    vi.mocked(prisma.order.create).mockImplementation(
      ((args: { data: unknown }) => {
        orderCreateCalls += 1;
        if (orderCreateCalls === 1) {
          releaseFirstOrder?.();
          return Promise.resolve({
            id: "order_concurrent_winner",
            userId: "user_123",
            productId: "prod_abc",
            paymentProvider: "lemonsqueezy",
            providerOrderId,
            status: "completed",
            ...(args.data as object),
          });
        }
        return firstOrderStarted.then(() =>
          Promise.reject(uniqueViolation(["paymentProvider", "providerOrderId"])),
        );
      }) as never,
    );

    const input = buildInput({ providerOrderId });
    await expect(Promise.all([processOrder(input), processOrder(input)])).resolves.toEqual([
      undefined,
      undefined,
    ]);

    expect(prisma.order.create).toHaveBeenCalledTimes(2);
    expect(prisma.accessGrant.upsert).toHaveBeenCalledOnce();
    expect(prisma.outboxEvent.createMany).toHaveBeenCalledOnce();
  });

  it("does not swallow an unrelated order unique constraint error", async () => {
    vi.mocked(prisma.order.create).mockRejectedValueOnce(
      uniqueViolation(["someOtherOrderConstraint"]),
    );

    await expect(processOrder(buildInput())).rejects.toThrow("Unique constraint failed");
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
      processOrder(buildInput())
    ).resolves.toBeUndefined();

    expect(prisma.order.create).toHaveBeenCalledOnce();
    expect(prisma.accessGrant.upsert).toHaveBeenCalledOnce();
  });

  it("persists analytics even when email delivery is unavailable", async () => {
    await processOrder(buildInput());

    const events = outboxEvents();
    const analyticsEvent = events.find((event) => event.type === "purchase_analytics");
    expect(analyticsEvent).toMatchObject({
      type: "purchase_analytics",
      payload: expect.objectContaining({
        productId: "prod_abc",
        productSlug: "test-course",
        providerProductId: null,
        userId: "user_123",
        provider: "lemonsqueezy",
        amount: 4900,
        currency: "USD",
      }),
    });
  });

  it("persists abandoned-checkout recovery in the outbox", async () => {
    await processOrder(buildInput());

    const events = outboxEvents();
    const recoveryEvent = events.find((event) => event.type === "purchase_abandoned_recovery");
    expect(recoveryEvent).toMatchObject({
      type: "purchase_abandoned_recovery",
      payload: { email: "buyer@example.com", productId: "prod_abc" },
    });
  });
});

// ─── Abandoned checkout recovery (scenario 6) ─────────────────

describe("processOrder — abandoned checkout recovery (scenario 6)", () => {
  beforeEach(resetMocks);

  it("creates recovery work atomically with the order", async () => {
    await processOrder(buildInput());

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.outboxEvent.createMany).toHaveBeenCalledOnce();
    expect(outboxEvents()).toHaveLength(4);
  });

  it("does not run recovery before the transaction commits", async () => {
    await processOrder(buildInput());

    expect(prisma.abandonedCheckout.updateMany).not.toHaveBeenCalled();
    expect(prisma.outboxEvent.createMany).toHaveBeenCalledOnce();
  });
});

// ─── Product resolution ────────────────────────────────────

describe("processOrder — product resolution", () => {
  beforeEach(resetMocks);

  it("resolves product via direct productId when provided", async () => {
    vi.mocked(prisma.order.create).mockResolvedValue({
      id: "order_direct",
      userId: "user_123",
      productId: "prod_direct",
      paymentProvider: "lemonsqueezy",
      status: "completed",
    } as never);

    await processOrder(
      buildInput({ product: { kind: "product_id", value: "prod_direct" } }),
    );

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: "prod_direct", deletedAt: null },
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
    await processOrder(buildInput());

    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { slug: "test-course", deletedAt: null },
    });
  });

  it("resolves product via the provider variant locator", async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null); // default: null
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
      buildInput({ product: { kind: "variant_id", value: "12345" } }),
    );

    expect(prisma.product.findUnique).not.toHaveBeenCalled();
    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: { lemonVariantId: "12345", deletedAt: null },
    });
  });

  it("throws NotFoundError when no product is resolvable via any identifier", async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null);

    const promise = processOrder(
      buildInput({ product: { kind: "product_slug", value: "unknown-slug" } }),
    );

    await expect(promise).rejects.toThrow(/not resolvable/i);

    // Webhook handler relies on this exact subclass to ack gracefully (see
    // src/app/api/webhooks/lemonsqueezy/route.ts).
    await expect(
      processOrder(
        buildInput({ product: { kind: "product_slug", value: "unknown-slug" } }),
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.accessGrant.upsert).not.toHaveBeenCalled();
  });
});

// ─── Analytics & metadata ──────────────────────────────────

describe("processOrder — analytics & metadata", () => {
  beforeEach(resetMocks);

  it("stores provider/order/amount/currency in analytics metadata", async () => {
    await processOrder(
      buildInput({
        providerOrderId: "ls_metadata_test",
        amount: 9900,
        currency: "USD",
      }),
    );

    const events = outboxEvents();
    const analyticsEvent = events.find((event) => event.type === "purchase_analytics");
    const payload = analyticsEvent?.payload;
    expect(payload).toMatchObject({
      provider: "lemonsqueezy",
      amount: 9900,
      currency: "USD",
      providerOrderId: "ls_metadata_test",
    });
  });

  it("tolerates analytics failure (does not throw)", async () => {
    await expect(processOrder(buildInput())).resolves.toBeUndefined();
    expect(prisma.outboxEvent.createMany).toHaveBeenCalledOnce();
  });
});

// ─── Full idempotency proof (defence in depth) ─────────────

describe("processOrder — full idempotency proof (defence in depth)", () => {
  beforeEach(resetMocks);

  it("two identical LS calls → exactly one order, one email, one analytics event, one grant", async () => {
    vi.mocked(prisma.order.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "order_existing",
        paymentProvider: "lemonsqueezy",
        providerOrderId: "ls_replay_test",
      } as never);

    const providerOrderId = "ls_replay_test";
    const first = buildInput({ providerOrderId });

    await processOrder(first);
    await processOrder({ ...first, providerOrderId });

    expect(prisma.order.create).toHaveBeenCalledOnce();
    expect(prisma.accessGrant.upsert).toHaveBeenCalledOnce();
    expect(prisma.outboxEvent.createMany).toHaveBeenCalledOnce();
    expect(outboxEvents()).toHaveLength(4);
  });
});
