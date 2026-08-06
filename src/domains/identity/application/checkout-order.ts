import type { OrderAccessRecord } from "../domain/access-decision";
import type { AccessRepository } from "../ports/access-repository";

const ORDER_LOOKUP_ATTEMPTS = 5;
const ORDER_LOOKUP_DELAY_MS = 500;

export interface FindCompletedCheckoutOrderDeps {
  repository: AccessRepository;
}

/**
 * Resolve the provider callback's completed order without exposing Prisma to
 * an HTTP route. The retry is intentionally part of this application use case
 * because the provider redirect may race webhook persistence.
 */
export async function findCompletedCheckoutOrder(
  productId: string,
  providerOrderId: string,
  deps: FindCompletedCheckoutOrderDeps,
): Promise<OrderAccessRecord | null> {
  for (let attempt = 0; attempt < ORDER_LOOKUP_ATTEMPTS; attempt += 1) {
    const order = await deps.repository.findPostCheckoutOrder({
      productId,
      provider: "lemonsqueezy",
      providerOrderId,
    });
    if (order?.status === "completed") return order;
    if (attempt < ORDER_LOOKUP_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, ORDER_LOOKUP_DELAY_MS));
    }
  }
  return null;
}
