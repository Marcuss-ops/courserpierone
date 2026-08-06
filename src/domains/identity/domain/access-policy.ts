import type { ActiveGrantRecord, OrderAccessRecord, ProductAccessResult } from "./access-decision";

export const AccessPolicyReason = {
  SelfMessage: "self_message_blocked",
  ProductNotFound: "product_not_found",
  NotCreatorStudentPair: "not_creator_student_pair",
  NoValidAccessGrant: "no_valid_access_grant",
} as const;

export type AccessPolicyReason = (typeof AccessPolicyReason)[keyof typeof AccessPolicyReason];

export interface CanMessageInput {
  actorId: string;
  targetId: string;
  productId: string;
}

export interface CanMessageResult {
  allowed: boolean;
  creatorId?: string;
  customerId?: string;
  productId: string;
  reason?: AccessPolicyReason;
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
  reason: ProductAccessResult["reason"],
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

/**
 * Pure policy for the creator↔student messaging relationship.
 * Product ownership and grant state are supplied by the application service.
 */
export function evaluateCanMessage(
  input: CanMessageInput & { creatorId: string | null; hasCustomerAccess: boolean },
): CanMessageResult {
  const { actorId, targetId, productId, creatorId, hasCustomerAccess } = input;

  if (actorId === targetId) {
    return { allowed: false, productId, reason: AccessPolicyReason.SelfMessage };
  }
  if (!creatorId) {
    return { allowed: false, productId, reason: AccessPolicyReason.ProductNotFound };
  }

  const actorIsCreator = actorId === creatorId;
  const targetIsCreator = targetId === creatorId;
  if (actorIsCreator === targetIsCreator) {
    return {
      allowed: false,
      creatorId,
      productId,
      reason: AccessPolicyReason.NotCreatorStudentPair,
    };
  }

  const customerId = actorIsCreator ? targetId : actorId;
  if (!hasCustomerAccess) {
    return {
      allowed: false,
      creatorId,
      customerId,
      productId,
      reason: AccessPolicyReason.NoValidAccessGrant,
    };
  }

  return { allowed: true, creatorId, customerId, productId };
}
