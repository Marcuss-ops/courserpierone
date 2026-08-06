/**
 * Compatibility helper for legacy analytics payloads.
 *
 * The canonical analytics contract is:
 *   - AnalyticEvent.productId         = Product.id
 *   - AnalyticEvent.productSlug       = Product.slug
 *   - AnalyticEvent.providerProductId = provider product/variant ID
 *
 * Older browser producers sent Product.slug in `productId`. The write route
 * uses this predicate only to separate those legacy values from internal IDs.
 */
const CUID_SHAPE = /^c[a-z0-9]{20,}$/i;

export function isCuidShape(value: string | null | undefined): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  return CUID_SHAPE.test(value);
}
