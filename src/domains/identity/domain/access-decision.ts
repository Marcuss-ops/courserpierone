import type { ProductAccessReason } from "./access-reasons";

export interface ProductReference {
  id: string;
  slug: string;
}

export interface ProductAccessResult {
  hasAccess: boolean;
  reason: ProductAccessReason;
  productId: string;
  pendingOrderOwnerId?: string | null;
}

export interface AuthenticatedAccessRequest {
  kind: "authenticated";
  userId: string;
  productId: string;
}

export interface AdminAccessRequest {
  kind: "admin";
  adminId: string;
  productId: string;
}

export interface PostCheckoutAccessRequest {
  kind: "post_checkout";
  /** Opaque short-lived checkout-session identifier, never an order ID. */
  token: string;
  productId: string;
}

export type AccessRequest =
  | AuthenticatedAccessRequest
  | AdminAccessRequest
  | PostCheckoutAccessRequest;

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
  _grant: ActiveGrantRecord,
): ProductAccessResult {
  return {
    hasAccess: true,
    reason: "active_purchase",
    productId,
  };
}

export function allowAsAdmin(productId: string): ProductAccessResult {
  return { hasAccess: true, reason: "active_purchase", productId };
}

export function deny(
  reason: ProductAccessReason,
  productId: string,
): ProductAccessResult {
  return { hasAccess: false, reason, productId };
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
      pendingOrderOwnerId: order.userId,
    };
  }
  if (order.status === "refunded") {
    return { hasAccess: false, reason: "refunded", productId };
  }
  return deny("not_purchased", productId);
}
