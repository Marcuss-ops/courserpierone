import type {
  ActiveGrantRecord,
  OrderAccessRecord,
} from "../domain/access-decision";

export interface PostCheckoutSessionRecord {
  provider: string;
  providerOrderId: string;
}

/**
 * Persistence boundary for Identity & Access.
 *
 * Application and domain code depend on this contract only; Prisma and
 * post-checkout session storage are composed at the outer adapter boundary.
 */
export interface AccessRepository {
  resolveProductId(productIdOrSlug: string): Promise<string | null>;
  findProductCreator(productId: string): Promise<string | null>;
  isAdminUser(userId: string): Promise<boolean>;
  findActiveGrant(input: {
    userId?: string;
    sourceType?: string;
    sourceId?: string;
    productId: string;
  }): Promise<ActiveGrantRecord | null>;
  findLatestUserOrder(input: {
    userId: string;
    productId: string;
  }): Promise<OrderAccessRecord | null>;
  resolvePostCheckoutSession(
    token: string,
    productId: string,
  ): Promise<PostCheckoutSessionRecord | null>;
  findPostCheckoutOrder(input: {
    provider: string;
    providerOrderId: string;
    productId: string;
  }): Promise<OrderAccessRecord | null>;
}

/** @deprecated Use AccessRepository. Kept for the first-slice migration. */
export type ProductAccessPort = AccessRepository;
