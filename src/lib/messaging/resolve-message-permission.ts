/**
 * Compatibility shim for the Messaging authorization contract.
 *
 * New cross-domain authorization lives in Identity & Access:
 * `accessPolicy.canMessage({ actorId, targetId, productId })`.
 * This export remains temporarily so existing Messaging routes can migrate
 * without a flag day. It intentionally contains no Prisma or Commerce import.
 */

import { accessPolicy } from "@/domains/identity";
import type { CanMessageResult } from "@/domains/identity";

export type MessagingPermission = CanMessageResult;

export interface ResolveMessagingPermissionInput {
  actorId: string;
  targetId: string;
  productId: string;
}

/** Stable Messaging reason names retained for API compatibility. */
export const MessagingDenyReason = {
  SelfMessage: "self_message_blocked",
  ProductNotFound: "product_not_found",
  /** @deprecated Product.creatorId is required by the database contract. */
  NoCreatorForProduct: "no_creator_for_product",
  NotCreatorStudentPair: "not_creator_student_pair",
  /** @deprecated Use NoValidAccessGrant. */
  NoCompletedOrderForStudent: "no_completed_order_for_student",
  NoValidAccessGrant: "no_valid_access_grant",
} as const;

export async function resolveMessagingPermission(
  input: ResolveMessagingPermissionInput,
): Promise<MessagingPermission> {
  return accessPolicy.canMessage(input);
}
