/**
 * src/lib/commerce/orders/revoke-order.ts
 *
 * Atomic revocation of a (provider, providerOrderId) pair: flips the
 * matching `Order.status` AND the dual-written `AccessGrant.status`
 * together via `prisma.$transaction`.
 *
 * Symmetric to `complete-order.ts` (which is the create-side atom).
 *
 * Why a single $transaction:
 *   MCR Phase 2 invariant: an `Order.status` and its `AccessGrant.status`
 *   MUST agree (revoked when the order is no longer completed). The
 *   access resolver reads AccessGrant as its source of truth under
 *   `USE_ACCESS_GRANT_RESOLVER=true`, so a stale Order.status alone
 *   won't deny access. The two writes MUST be atomic; otherwise:
 *
 *     Order.status=refunded     ─┐  partial state if grant update fails
 *     AccessGrant.status=active ─┘
 *
 *   leaves the resolver granting access for an order that the
 *   provider has actually refunded.
 *
 * Idempotency model:
 *   - findMany's `status: "completed"` filter prevents the same revoke
 *     from re-listing an already-revoked order.
 *   - updateMany's `status: "active"` filter on the grant prevents
 *     double-revocation (revokedAt would otherwise be re-stamped).
 *   - The processedWebhook gate (in route.ts / idempotency.ts) prevents
 *     the entire handler from re-running on a redelivery — these
 *     within-handler guards are belt-and-suspenders.
 */

import { prisma } from "@/lib/db/prisma";

export type RevokeOrderStatus = "refunded" | "failed";

export interface RevokeOrderInput {
  paymentProvider: "lemonsqueezy";
  /**
   * Provider-side identifier. For `order_refunded` this is the LS
   * `order.id`. For `subscription_*` events this is the LS
   * `subscription.id` (which was stored on `Order.providerOrderId`
   * by `processOrder` at subscription_created time).
   */
  providerOrderId: string;
  /** Target `Order.status` after revocation. */
  orderStatus: RevokeOrderStatus;
}

export interface RevokeOrderResult {
  /** Number of orders (and grants, by atomicity) revoked. */
  count: number;
}

/**
 * Revoke all completed orders (and their dual-written AccessGrants)
 * matching `paymentProvider`+`providerOrderId`. Returns `{ count }`
 * where count==0 means a no-op (either never existed or already revoked).
 */
export async function revokeOrder(
  input: RevokeOrderInput,
): Promise<RevokeOrderResult> {
  const ordersToRevoke = await prisma.order.findMany({
    where: {
      paymentProvider: input.paymentProvider,
      providerOrderId: input.providerOrderId,
      status: "completed",
    },
    select: { id: true },
  });

  if (ordersToRevoke.length === 0) {
    return { count: 0 };
  }

  const orderInternalIds = ordersToRevoke.map((o) => o.id);

  // Single $transaction: Order.updateMany + AccessGrant.updateMany
  // are atomic. They MUST be — see file header for the invariant.
  await prisma.$transaction([
    prisma.order.updateMany({
      where: { id: { in: orderInternalIds } },
      data: { status: input.orderStatus },
    }),
    prisma.accessGrant.updateMany({
      where: {
        sourceType: "order",
        sourceId: { in: orderInternalIds },
        status: "active", // don't double-revoke: skip already-revoked grants
      },
      data: {
        status: "revoked",
        revokedAt: new Date(),
      },
    }),
  ]);

  return { count: orderInternalIds.length };
}
