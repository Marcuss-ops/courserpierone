import { evaluateCanMessage, type CanMessageInput, type CanMessageResult } from "../domain/access-policy";
import type { AccessRepository } from "../ports/access-repository";

export interface CanMessageDeps {
  repository: AccessRepository;
}

/**
 * Authorizes creator↔student messaging without exposing Commerce internals to
 * Messaging. The repository is the only persistence dependency.
 */
export async function canMessage(
  input: CanMessageInput,
  deps: CanMessageDeps,
): Promise<CanMessageResult> {
  if (input.actorId === input.targetId) {
    return evaluateCanMessage({
      ...input,
      creatorId: null,
      hasCustomerAccess: false,
    });
  }

  const creatorId = await deps.repository.findProductCreator(input.productId);
  if (!creatorId) {
    return evaluateCanMessage({
      ...input,
      creatorId: null,
      hasCustomerAccess: false,
    });
  }

  const customerId = input.actorId === creatorId ? input.targetId : input.actorId;
  const targetIsCreator = input.targetId === creatorId;
  const actorIsCreator = input.actorId === creatorId;
  const hasPair = actorIsCreator !== targetIsCreator;

  if (!hasPair) {
    return evaluateCanMessage({
      ...input,
      creatorId,
      hasCustomerAccess: false,
    });
  }

  const access = await deps.repository.findActiveGrant({
    userId: customerId,
    productId: input.productId,
  });

  return evaluateCanMessage({
    ...input,
    creatorId,
    hasCustomerAccess: Boolean(access),
  });
}

export type { CanMessageInput, CanMessageResult } from "../domain/access-policy";
