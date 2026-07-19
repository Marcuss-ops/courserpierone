/**
 * Tests for src/lib/commerce/checkout/create-checkout.ts
 *
 * Step 10 — Centralize the "published products only" rule in the
 * checkout use case. These tests cover:
 *   - SSOT gate: draft / archived / missing product denial
 *   - Performance: only `status` is selected (no full-row read)
 *   - Side-effect ordering: no `AbandonedCheckout` write on denial
 *   - Provider NOT invoked when gate fires
 *   - Success path: published + lemonVariantId → session URL returned,
 *     abandoned-cart write fires AFTER provider call
 *   - Error class: ProductNotPublishedError is a CheckoutError
 *     subclass so apiErrorResponse surfaces a 400 with code
 *     "PRODUCT_NOT_PUBLISHED"
 *   - Existing pricing fallback: published + no lemonVariantId → still
 *     throws CheckoutError (regression-guard for the unchanged
 *     fallthrough branch)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, mockRegistryCreate } = vi.hoisted(() => {
  const mockPrisma = {
    product: { findUnique: vi.fn() },
    abandonedCheckout: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  };
  const mockRegistryCreate = vi.fn();
  return { mockPrisma, mockRegistryCreate };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/commerce/payments/init", () => ({
  paymentProviderRegistry: {
    get: () => ({
      createCheckout: mockRegistryCreate,
    }),
  },
}));

import { CheckoutService } from "./create-checkout";
import {
  CheckoutError,
  NotFoundError,
  ProductNotPublishedError,
} from "@/lib/errors";

const PRODUCT_ID = "prod-1";
const VARIANT_ID = "var-1";
const USER_EMAIL = "buyer@test.com";

const baseInput = {
  product: { id: PRODUCT_ID, slug: "course-a" },
  pricing: { lemonVariantId: VARIANT_ID },
  locale: "it-it",
  userEmail: USER_EMAIL,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CheckoutService.createCheckout — product.status SSOT gate", () => {
  it("denies with ProductNotPublishedError when status='draft'", async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ status: "draft" });

    const svc = new CheckoutService();
    await expect(svc.createCheckout(baseInput)).rejects.toThrow(
      ProductNotPublishedError,
    );

    // Defense: provider MUST NOT have been called and no side-effect fired.
    expect(mockRegistryCreate).not.toHaveBeenCalled();
    expect(mockPrisma.abandonedCheckout.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.abandonedCheckout.create).not.toHaveBeenCalled();
    expect(mockPrisma.abandonedCheckout.update).not.toHaveBeenCalled();
  });

  it("denies with ProductNotPublishedError when status='archived'", async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ status: "archived" });

    const svc = new CheckoutService();
    await expect(svc.createCheckout(baseInput)).rejects.toThrow(
      ProductNotPublishedError,
    );
    expect(mockRegistryCreate).not.toHaveBeenCalled();
  });

  it("denies with NotFoundError when product is missing (race condition catch)", async () => {
    // Re-read returns null: product was deleted between the route's
    // load and the orchestrator's defensive re-read. Fail closed —
    // never invoke provider or write abandoned-cart row.
    mockPrisma.product.findUnique.mockResolvedValue(null);

    const svc = new CheckoutService();
    await expect(svc.createCheckout(baseInput)).rejects.toThrow(NotFoundError);
    expect(mockRegistryCreate).not.toHaveBeenCalled();
    expect(mockPrisma.abandonedCheckout.create).not.toHaveBeenCalled();
  });

  it("queries only the status field (minimal select projection)", async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ status: "published" });
    mockRegistryCreate.mockResolvedValue({
      url: "https://ls.test/checkout/abc",
      provider: "lemonsqueezy",
    });
    mockPrisma.abandonedCheckout.findFirst.mockResolvedValue(null);
    mockPrisma.abandonedCheckout.create.mockResolvedValue({});

    const svc = new CheckoutService();
    await svc.createCheckout(baseInput);

    expect(mockPrisma.product.findUnique).toHaveBeenCalledWith({
      where: { id: PRODUCT_ID },
      select: { status: true },
    });
    expect(mockPrisma.product.findUnique).toHaveBeenCalledTimes(1);
  });

  it("succeeds and returns the session when product.status='published'", async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ status: "published" });
    mockRegistryCreate.mockResolvedValue({
      url: "https://ls.test/checkout/abc",
      provider: "lemonsqueezy",
    });
    mockPrisma.abandonedCheckout.findFirst.mockResolvedValue(null);
    mockPrisma.abandonedCheckout.create.mockResolvedValue({});

    const svc = new CheckoutService();
    const session = await svc.createCheckout(baseInput);

    expect(session).toEqual({
      url: "https://ls.test/checkout/abc",
      provider: "lemonsqueezy",
    });

    // Side-effect ordering: provider first, THEN abandoned-cart write.
    expect(mockRegistryCreate).toHaveBeenCalledTimes(1);
    expect(mockPrisma.abandonedCheckout.create).toHaveBeenCalledTimes(1);
  });

  it("does not track abandoned cart when guard fires (no side-effect on denial)", async () => {
    // Regression guard: the previous orchestrator wrote AbandonedCheckout
    // rows even for unpublished products. Stress-test the new ordering:
    // guard fires → throw → NO side-effect row.
    mockPrisma.product.findUnique.mockResolvedValue({ status: "draft" });

    const svc = new CheckoutService();
    await expect(svc.createCheckout(baseInput)).rejects.toThrow(
      ProductNotPublishedError,
    );
    expect(mockPrisma.abandonedCheckout.create).not.toHaveBeenCalled();
    expect(mockPrisma.abandonedCheckout.update).not.toHaveBeenCalled();
    expect(mockPrisma.abandonedCheckout.findFirst).not.toHaveBeenCalled();
  });

  it("throws CheckoutError when published but no lemonVariantId (regression-guard)", async () => {
    // Pre-Step-10 fallthrough branch unchanged: published product
    // without an LS variant still throws CheckoutError with the
    // "nessun metodo di pagamento" diagnostic.
    mockPrisma.product.findUnique.mockResolvedValue({ status: "published" });

    const svc = new CheckoutService();
    await expect(
      svc.createCheckout({ ...baseInput, pricing: { lemonVariantId: null } }),
    ).rejects.toThrow(CheckoutError);
    expect(mockRegistryCreate).not.toHaveBeenCalled();
  });

  it("does not call abandonedCart.* when userEmail is undefined (existing fast-path)", async () => {
    mockPrisma.product.findUnique.mockResolvedValue({ status: "published" });
    mockRegistryCreate.mockResolvedValue({
      url: "https://ls.test/checkout/abc",
      provider: "lemonsqueezy",
    });

    const svc = new CheckoutService();
    await svc.createCheckout({ ...baseInput, userEmail: undefined });

    // Even on success path: no abandoned-cart row if userEmail is missing
    // (anonymous checkout — the cron worker has nothing to email).
    expect(mockPrisma.abandonedCheckout.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.abandonedCheckout.create).not.toHaveBeenCalled();
    expect(mockPrisma.abandonedCheckout.update).not.toHaveBeenCalled();
  });
});

describe("ProductNotPublishedError — class hierarchy", () => {
  it("extends CheckoutError (downstream apiErrorResponse compatibility)", () => {
    const err = new ProductNotPublishedError();
    expect(err).toBeInstanceOf(CheckoutError);
    expect(err.code).toBe("PRODUCT_NOT_PUBLISHED");
    expect(err.statusCode).toBe(400);
    expect(err.isOperational).toBe(true);
  });

  it("default message is the Italian UX copy used by the public route", () => {
    const err = new ProductNotPublishedError();
    expect(err.message).toMatch(/non.*disponibile/i);
  });

  it("accepts a custom message (orchestrator can override diagnostics)", () => {
    const err = new ProductNotPublishedError("Custom diagnostic");
    expect(err.message).toBe("Custom diagnostic");
    expect(err.code).toBe("PRODUCT_NOT_PUBLISHED");
  });
});
