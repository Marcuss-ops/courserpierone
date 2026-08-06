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
