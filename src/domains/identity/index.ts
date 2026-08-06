import { createPrismaAccessRepository } from "./adapters/prisma-product-access-adapter";
import { readCheckoutSession } from "@/lib/commerce/access/checkout-token";
import { canMessage as canMessageUseCase } from "./application/can-message";
import type { CanMessageInput, CanMessageResult } from "./domain/access-policy";
import {
  resolveProductAccess as resolveProductAccessUseCase,
  type AccessRequest,
  type ProductAccessResult,
} from "./application/resolve-product-access";

const prismaAccessRepository = createPrismaAccessRepository(async (token, productId) => {
  const session = await readCheckoutSession(token, { productId });
  return session
    ? { provider: session.provider, providerOrderId: session.providerOrderId }
    : null;
});

export function resolveProductAccess(input: AccessRequest): Promise<ProductAccessResult> {
  return resolveProductAccessUseCase(input, { port: prismaAccessRepository });
}

/** Public cross-domain authorization contract. */
export const accessPolicy = {
  canMessage(input: CanMessageInput): Promise<CanMessageResult> {
    return canMessageUseCase(input, { repository: prismaAccessRepository });
  },
} as const;

export const canMessage = accessPolicy.canMessage;

export { AccessPolicyReason, evaluateCanMessage } from "./domain/access-policy";
export type { CanMessageInput, CanMessageResult } from "./domain/access-policy";
export type {
  ProductAccessReason,
  AccessRequest,
  AdminAccessRequest,
  AuthenticatedAccessRequest,
  PostCheckoutAccessRequest,
  ProductAccessResult,
} from "./application/resolve-product-access";
