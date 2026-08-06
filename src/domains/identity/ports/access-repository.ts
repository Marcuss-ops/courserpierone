import type {
  ActiveGrantRecord,
  OrderAccessRecord,
} from "../domain/access-decision";

/**
 * Persistence boundary for Identity & Access.
 *
 * Application and domain code depend on this contract only; Prisma is wired in
 * the adapter layer.
 */
export interface AccessRepository {
  resolveProductId(productIdOrSlug: string): Promise<string | null>;
  findProductCreator(productId: string): Promise<string | null>;
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
  findAnonymousOrder(input: {
    productId: string;
    provider?: string;
    providerOrderId?: string;
    internalOrderId?: string;
  }): Promise<OrderAccessRecord | null>;
}

/** @deprecated Use AccessRepository. Kept for the first-slice migration. */
export type ProductAccessPort = AccessRepository;
