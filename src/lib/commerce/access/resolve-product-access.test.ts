import { describe, expect, it, vi } from "vitest";

const { mockResolveProductAccess } = vi.hoisted(() => ({
  mockResolveProductAccess: vi.fn(),
}));

vi.mock("@/domains/identity", () => ({
  resolveProductAccess: mockResolveProductAccess,
}));

import { resolveProductAccess } from "./resolve-product-access";

describe("legacy access import compatibility", () => {
  it("re-exports the canonical Identity resolver without exposing order-ID inputs", async () => {
    mockResolveProductAccess.mockResolvedValue({
      hasAccess: true,
      reason: "active_purchase",
      productId: "product-1",
    });

    await resolveProductAccess({
      kind: "authenticated",
      userId: "user-1",
      productId: "product-1",
    });

    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      kind: "authenticated",
      userId: "user-1",
      productId: "product-1",
    });
  });

  it("supports admin requests through the compatibility import", async () => {
    mockResolveProductAccess.mockResolvedValue({
      hasAccess: true,
      reason: "active_purchase",
      productId: "product-1",
    });

    await resolveProductAccess({
      kind: "admin",
      adminId: "admin-1",
      productId: "product-1",
    });

    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      kind: "admin",
      adminId: "admin-1",
      productId: "product-1",
    });
  });

  it("supports post-checkout requests only through an opaque token", async () => {
    mockResolveProductAccess.mockResolvedValue({
      hasAccess: true,
      reason: "active_purchase",
      productId: "product-1",
    });

    await resolveProductAccess({
      kind: "post_checkout",
      token: "opaque-session-id",
      productId: "product-1",
    });

    expect(mockResolveProductAccess).toHaveBeenCalledWith({
      kind: "post_checkout",
      token: "opaque-session-id",
      productId: "product-1",
    });
  });
});
