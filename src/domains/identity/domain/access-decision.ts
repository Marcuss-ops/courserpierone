import type { ProductAccessReason } from "./access-reasons";

export interface ProductAccessResult {
  hasAccess: boolean;
  reason: ProductAccessReason;
  productId: string;
  orderId: string | null;
  pendingOrderOwnerId?: string | null;
}

export interface ResolveProductAccessInput {
  userId?: string;
  userRole?: string;
  productId: string;
  provider?: string;
  providerOrderId?: string;
  internalOrderId?: string;
}

export interface ActiveGrantRecord {
  id: string;
  sourceType: string | null;
  sourceId: string | null;
}

export interface OrderAccessRecord {
  id: string;
  status: string;
  userId: string | null;
}

export function allowFromGrant(
  productId: string,
  grant: ActiveGrantRecord,
): ProductAccessResult {
  return {
    hasAccess: true,
    reason: "active_purchase",
    productId,
    orderId: grant.sourceType === "order" ? grant.sourceId : null,
  };
}

export function allowAsAdmin(productId: string): ProductAccessResult {
  return { hasAccess: true, reason: "active_purchase", productId, orderId: null };
}

export function deny(
  reason: ProductAccessReason,
  productId: string,
): ProductAccessResult {
  return { hasAccess: false, reason, productId, orderId: null };
}

export function denyForOrder(
  productId: string,
  order: OrderAccessRecord,
): ProductAccessResult {
  if (order.status === "pending") {
    return {
      hasAccess: false,
      reason: "payment_pending",
      productId,
      orderId: order.id,
      pendingOrderOwnerId: order.userId,
    };
  }
  if (order.status === "refunded") {
    return { hasAccess: false, reason: "refunded", productId, orderId: order.id };
  }
  return deny("not_purchased", productId);
}
