import type {
  ActiveGrantRecord,
  OrderAccessRecord,
} from "../domain/access-decision";

export interface ProductAccessPort {
  resolveProductId(productIdOrSlug: string): Promise<string | null>;
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
