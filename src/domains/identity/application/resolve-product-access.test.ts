import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveProductAccess,
  type ProductAccessResult,
} from "./resolve-product-access";
import type { AccessRepository } from "../ports/access-repository";

const PRODUCT_ID = "product-1";
const PRODUCT_SLUG = "course-one";
const USER_ID = "user-1";
const ORDER_ID = "order-1";

function createPort(): AccessRepository {
  return {
    resolveProductId: vi.fn().mockResolvedValue(PRODUCT_ID),
    findProductCreator: vi.fn().mockResolvedValue(null),
    isAdminUser: vi.fn().mockResolvedValue(false),
    findActiveGrant: vi.fn().mockResolvedValue(null),
    findLatestUserOrder: vi.fn().mockResolvedValue(null),
    resolvePostCheckoutSession: vi.fn().mockResolvedValue({ provider: "lemonsqueezy", providerOrderId: "ls-order-1" }),
    findPostCheckoutOrder: vi.fn().mockResolvedValue(null),
  };
}

function expectDenied(result: ProductAccessResult, reason: string) {
  expect(result.hasAccess).toBe(false);
  expect(result.reason).toBe(reason);
}

describe("Identity resolveProductAccess use case", () => {
  let port: AccessRepository;

  beforeEach(() => {
    port = createPort();
  });

  it("fails closed on an empty product without calling the port", async () => {
    const result = await resolveProductAccess(
      { kind: "authenticated", userId: USER_ID, productId: "" },
      { port },
    );
    expectDenied(result, "not_purchased");
    expect(port.resolveProductId).not.toHaveBeenCalled();
    expect(port.findActiveGrant).not.toHaveBeenCalled();
  });

  it("resolves an authenticated slug before checking the active grant", async () => {
    vi.mocked(port.findActiveGrant).mockResolvedValue({
      id: "grant-1",
      sourceType: "order",
      sourceId: ORDER_ID,
    });

    const result = await resolveProductAccess(
      { kind: "authenticated", userId: USER_ID, productId: PRODUCT_SLUG },
      { port },
    );
    expect(result).toMatchObject({
      hasAccess: true,
      reason: "active_purchase",
      productId: PRODUCT_ID,
    });
    expect(port.resolveProductId).toHaveBeenCalledWith(PRODUCT_SLUG);
  });

  it("denies a forged admin request when the principal is not an admin", async () => {
    const result = await resolveProductAccess(
      { kind: "admin", adminId: "forged-user", productId: PRODUCT_ID },
      { port },
    );
    expectDenied(result, "not_purchased");
    expect(port.isAdminUser).toHaveBeenCalledWith("forged-user");
    expect(port.findActiveGrant).not.toHaveBeenCalled();
  });

  it("applies the verified admin request rule before grant and order reads", async () => {
    vi.mocked(port.isAdminUser).mockResolvedValue(true);
    const result = await resolveProductAccess(
      { kind: "admin", adminId: "admin-1", productId: PRODUCT_SLUG },
      { port },
    );
    expect(result).toMatchObject({
      hasAccess: true,
      reason: "active_purchase",
      productId: PRODUCT_ID,
    });
    expect(port.isAdminUser).toHaveBeenCalledWith("admin-1");
    expect(port.findActiveGrant).not.toHaveBeenCalled();
    expect(port.findLatestUserOrder).not.toHaveBeenCalled();
  });

  it("classifies an authenticated missing grant from the latest order", async () => {
    vi.mocked(port.findLatestUserOrder).mockResolvedValue({
      id: ORDER_ID,
      status: "pending",
      userId: USER_ID,
    });
    const result = await resolveProductAccess(
      { kind: "authenticated", userId: USER_ID, productId: PRODUCT_ID },
      { port },
    );
    expect(result).toMatchObject({
      hasAccess: false,
      reason: "payment_pending",
      pendingOrderOwnerId: USER_ID,
    });
  });

  it("resolves post-checkout access through the opaque token contract", async () => {
    vi.mocked(port.findPostCheckoutOrder).mockResolvedValue({
      id: ORDER_ID,
      status: "completed",
      userId: null,
    });
    vi.mocked(port.findActiveGrant).mockResolvedValue({
      id: "grant-1",
      sourceType: "order",
      sourceId: ORDER_ID,
    });

    const result = await resolveProductAccess(
      { kind: "post_checkout", token: "opaque-jti", productId: PRODUCT_ID },
      { port },
    );

    expect(result).toMatchObject({ hasAccess: true, reason: "active_purchase", productId: PRODUCT_ID });
    expect(result).not.toHaveProperty("orderId");
    expect(port.resolvePostCheckoutSession).toHaveBeenCalledWith("opaque-jti", PRODUCT_ID);
    expect(port.findPostCheckoutOrder).toHaveBeenCalledWith({
      provider: "lemonsqueezy",
      providerOrderId: "ls-order-1",
      productId: PRODUCT_ID,
    });
    expect(port.findActiveGrant).toHaveBeenCalledWith({
      sourceType: "order",
      sourceId: ORDER_ID,
      productId: PRODUCT_ID,
    });
  });

  it("denies an unknown post-checkout token without a grant lookup", async () => {
    vi.mocked(port.resolvePostCheckoutSession).mockResolvedValue(null);
    const result = await resolveProductAccess(
      { kind: "post_checkout", token: "unknown", productId: PRODUCT_ID },
      { port },
    );
    expectDenied(result, "order_not_found");
    expect(port.findActiveGrant).not.toHaveBeenCalled();
  });
});
