import { prismaAccessRepository } from "./adapters/prisma-product-access-adapter";
import { canMessage as canMessageUseCase } from "./application/can-message";
import type { CanMessageInput, CanMessageResult } from "./domain/access-policy";
import {
  resolveProductAccess as resolveProductAccessUseCase,
  type ProductAccessResult,
  type ResolveProductAccessInput,
} from "./application/resolve-product-access";

export function resolveProductAccess(input: ResolveProductAccessInput): Promise<ProductAccessResult> {
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
  ProductAccessResult,
  ResolveProductAccessInput,
} from "./application/resolve-product-access";
