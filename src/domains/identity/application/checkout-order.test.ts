import { describe, expect, it, vi } from "vitest";
import { findCompletedCheckoutOrder } from "./checkout-order";
import type { AccessRepository } from "../ports/access-repository";

function repositoryWithOrders(
  orders: ({ id: string; status: string; userId: string | null } | null)[],
): AccessRepository {
  return {
    findPostCheckoutOrder: vi.fn(async () => orders.shift() ?? null),
    findProduct: vi.fn(),
    resolveProductId: vi.fn(),
    findProductCreator: vi.fn(),
    isAdminUser: vi.fn(),
    findActiveGrant: vi.fn(),
    findLatestUserOrder: vi.fn(),
    resolvePostCheckoutSession: vi.fn(),
  };
}

describe("findCompletedCheckoutOrder", () => {
  it("returns a completed order immediately", async () => {
    const repository = repositoryWithOrders([{ id: "order-1", status: "completed", userId: null }]);

    await expect(
      findCompletedCheckoutOrder("product-1", "provider-1", { repository }),
    ).resolves.toEqual({ id: "order-1", status: "completed", userId: null });
    expect(repository.findPostCheckoutOrder).toHaveBeenCalledOnce();
  });

  it("retries while the webhook order is still pending", async () => {
    const repository = repositoryWithOrders([
      { id: "order-1", status: "pending", userId: null },
      { id: "order-1", status: "completed", userId: null },
    ]);

    await expect(
      findCompletedCheckoutOrder("product-1", "provider-1", { repository }),
    ).resolves.toMatchObject({ status: "completed" });
    expect(repository.findPostCheckoutOrder).toHaveBeenCalledTimes(2);
  });

  it("returns null after all attempts remain incomplete", async () => {
    vi.useFakeTimers();
    const repository = repositoryWithOrders([
      { id: "order-1", status: "pending", userId: null },
      { id: "order-1", status: "pending", userId: null },
      { id: "order-1", status: "pending", userId: null },
      { id: "order-1", status: "pending", userId: null },
      { id: "order-1", status: "pending", userId: null },
    ]);

    const result = findCompletedCheckoutOrder("product-1", "provider-1", { repository });
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBeNull();
    expect(repository.findPostCheckoutOrder).toHaveBeenCalledTimes(5);
    vi.useRealTimers();
  });
});
