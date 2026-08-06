import { createPrismaAccessRepository } from "./adapters/prisma-product-access-adapter";
import {
  findCompletedCheckoutOrder,
  type FindCompletedCheckoutOrderDeps,
} from "./application/checkout-order";
import { readCheckoutSession } from "./application/checkout-token";
import { requireAdmin as requireAdminUseCase } from "./application/require-admin";
import { canMessage as canMessageUseCase } from "./application/can-message";
import type { NextResponse } from "next/server";
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

export function resolveProductReference(productIdOrSlug: string) {
  return prismaAccessRepository.findProduct(productIdOrSlug);
}

export function findCompletedProviderOrder(productId: string, providerOrderId: string) {
  const deps: FindCompletedCheckoutOrderDeps = { repository: prismaAccessRepository };
  return findCompletedCheckoutOrder(productId, providerOrderId, deps);
}

/** Public cross-domain authorization contract. */
export const accessPolicy = {
  canMessage(input: CanMessageInput): Promise<CanMessageResult> {
    return canMessageUseCase(input, { repository: prismaAccessRepository });
  },
} as const;

export const canMessage = accessPolicy.canMessage;

export function requireAdmin(): Promise<NextResponse | null> {
  return requireAdminUseCase();
}

export {
  CHECKOUT_SESSION_COOKIE,
  CHECKOUT_TOKEN_TTL_SECONDS,
  CheckoutTokenError,
  consumeCheckoutToken,
  consumeRegisteredCheckoutToken,
  deriveCheckoutJti,
  issueCheckoutToken,
  readCheckoutSession,
  registerCheckoutToken,
  setCheckoutSessionCookie,
  verifyCheckoutToken,
} from "./application/checkout-token";

export type {
  CheckoutTokenErrorCode,
  CheckoutTokenPayload,
  IssueCheckoutTokenInput,
  ProductBinding,
} from "./application/checkout-token";

export {
  AccessPolicyReason,
  evaluateCanMessage,
} from "./domain/access-policy";
export {
  evaluateAccess,
  evaluatePolicy,
} from "./domain/access-policies";
export type {
  AccessContext,
  AccessDecision,
  AccessDenyReason,
  AccessAllowReason,
  AccessPolicy,
} from "./domain/access-policies";
export type { CanMessageInput, CanMessageResult } from "./domain/access-policy";
export type {
  ProductAccessReason,
  AccessRequest,
  AdminAccessRequest,
  AuthenticatedAccessRequest,
  PostCheckoutAccessRequest,
  ProductAccessResult,
} from "./application/resolve-product-access";
export type { ProductReference } from "./domain/access-decision";
