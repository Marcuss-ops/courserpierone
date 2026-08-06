import type { Prisma } from "@prisma/client";
import { isCuidShape } from "./ssot-identifier";

/**
 * Canonical product identity carried by analytics events.
 *
 * - productId: internal Product.id (Prisma primary key)
 * - productSlug: public Product.slug used by URLs and funnel queries
 * - providerProductId: external provider product/variant identifier
 */
export interface AnalyticsProductIdentity {
  productId?: string | null;
  productSlug?: string | null;
  providerProductId?: string | null;
}

/**
 * Build a filter that reads both normalized rows and historical rows where
 * the slug was incorrectly stored in AnalyticEvent.productId.
 */
export function buildAnalyticsProductWhere(
  identity: AnalyticsProductIdentity,
): Prisma.AnalyticEventWhereInput {
  const clauses: Prisma.AnalyticEventWhereInput[] = [];

  if (identity.productId) {
    clauses.push({ productId: identity.productId });
    // Older dashboard/funnel callers passed the public slug as `productId`.
    // Preserve that alias only for non-CUID values; a canonical internal ID
    // must never be compared against the public-slug column.
    if (!isCuidShape(identity.productId)) {
      clauses.push({ productSlug: identity.productId });
    }
  }
  if (identity.productSlug) {
    clauses.push({ productSlug: identity.productSlug });
    // Compatibility with pre-normalization events.
    clauses.push({ productId: identity.productSlug });
  }
  const providerClause = identity.providerProductId
    ? { providerProductId: identity.providerProductId }
    : null;

  if (clauses.length === 0) {
    return providerClause ? providerClause : {};
  }

  const productClause = { OR: clauses };
  return providerClause
    ? { AND: [productClause, providerClause] }
    : productClause;
}
