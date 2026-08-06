import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveProductAccess,
  type ProductAccessResult,
} from "./resolve-product-access";
import type { ProductAccessPort } from "../ports/product-access-port";

const PRODUCT_ID = "product-1";
const PRODUCT_SLUG = "course-one";
const USER_ID = "user-1";
const ORDER_ID = "order-1";

function createPort(): ProductAccessPort {
  return {
    resolveProductId: vi.fn().mockResolvedValue(PRODUCT_ID),
    findProductCreator: vi.fn().mockResolvedValue(null),
    findActiveGrant: vi.fn().mockResolvedValue(null),
    findLatestUserOrder: vi.fn().mockResolvedValue(null),
    findAnonymousOrder: vi.fn().mockResolvedValue(null),
  };
}

function expectDenied(result: ProductAccessResult, reason: string) {
  expect(result.hasAccess).toBe(false);
  expect(result.reason).toBe(reason);
}

describe("Identity resolveProductAccess use case", () => {
  let port: ProductAccessPort;

  beforeEach(() => {
    port = createPort();
  });

  it("fails closed on an empty product without calling the port", async () => {
    const result = await resolveProductAccess({ userId: USER_ID, productId: "" }, { port });
    expectDenied(result, "not_purchased");
    expect(port.resolveProductId).not.toHaveBeenCalled();
    expect(port.findActiveGrant).not.toHaveBeenCalled();
  });

  it("resolves slugs before checking the active grant", async () => {
    vi.mocked(port.findActiveGrant).mockResolvedValue({
      id: "grant-1",
      sourceType: "order",
      sourceId: ORDER_ID,
    });

    const result = await resolveProductAccess({ userId: USER_ID, productId: PRODUCT_SLUG }, { port });
    expect(result).toMatchObject({ hasAccess: true, reason: "active_purchase", productId: PRODUCT_ID, orderId: ORDER_ID });
    expect(port.resolveProductId).toHaveBeenCalledWith(PRODUCT_SLUG);
  });

  it("keeps the cuid fast path and skips product resolution", async () => {
    const cuid = "c123456789012345678901234";
    vi.mocked(port.findActiveGrant).mockResolvedValue({ id: "grant-1", sourceType: "bundle", sourceId: "bundle-1" });

    const result = await resolveProductAccess({ userId: USER_ID, productId: cuid }, { port });
    expect(result).toMatchObject({ hasAccess: true, productId: cuid, orderId: null });
    expect(port.resolveProductId).not.toHaveBeenCalled();
  });

  it("applies the admin domain rule before grant and order reads", async () => {
    const result = await resolveProductAccess({ userId: USER_ID, userRole: "admin", productId: PRODUCT_SLUG }, { port });
    expect(result).toMatchObject({ hasAccess: true, reason: "active_purchase", productId: PRODUCT_ID, orderId: null });
    expect(port.findActiveGrant).not.toHaveBeenCalled();
    expect(port.findLatestUserOrder).not.toHaveBeenCalled();
  });

  it("classifies a missing session grant from the latest order", async () => {
    vi.mocked(port.findLatestUserOrder).mockResolvedValue({ id: ORDER_ID, status: "pending", userId: USER_ID });
    const result = await resolveProductAccess({ userId: USER_ID, productId: PRODUCT_ID }, { port });
    expect(result).toMatchObject({ hasAccess: false, reason: "payment_pending", orderId: ORDER_ID, pendingOrderOwnerId: USER_ID });
  });

  it("uses provider-scoped anonymous order access and requires an order grant", async () => {
    vi.mocked(port.findAnonymousOrder).mockResolvedValue({ id: ORDER_ID, status: "completed", userId: null });
    vi.mocked(port.findActiveGrant).mockResolvedValue({ id: "grant-1", sourceType: "order", sourceId: ORDER_ID });

    const result = await resolveProductAccess({
      productId: PRODUCT_ID,
      provider: "lemonsqueezy",
      providerOrderId: "ls-order-1",
    }, { port });

    expect(result).toMatchObject({ hasAccess: true, reason: "active_purchase", orderId: ORDER_ID });
    expect(port.findAnonymousOrder).toHaveBeenCalledWith({
      productId: PRODUCT_ID,
      provider: "lemonsqueezy",
      providerOrderId: "ls-order-1",
      internalOrderId: undefined,
    });
    expect(port.findActiveGrant).toHaveBeenCalledWith({ sourceType: "order", sourceId: ORDER_ID, productId: PRODUCT_ID });
  });

  it("fails closed when provider order identity has no provider", async () => {
    const result = await resolveProductAccess({ productId: PRODUCT_ID, providerOrderId: "ls-order-1" }, { port });
    expectDenied(result, "order_not_found");
    expect(port.findAnonymousOrder).toHaveBeenCalled();
  });
});
