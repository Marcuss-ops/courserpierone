/**
 * src/lib/analytics/ssot-identifier.ts
 *
 * MCR Step 11 — Single source of truth for the analytics identifier
 * convention (`AnalyticEvent.productId` is `Product.slug`, NEVER
 * `Product.id` cuid).
 *
 * Why a shared module here instead of an inline constant per route?
 *   - The `CUID_SHAPE` regex was originally inlined in BOTH the
 *     dashboard and the funnel route. Two copies already smell — a
 *     third will appear the moment per-channel funnel ships.
 *   - Centralizes the kebab-case-slug trust assumption in one
 *     documented place (the docstring below) so future readers
 *     don't silently weaken it.
 *   - Provides the only place to add a regression test for the
 *     shape-detection logic itself (the route tests cover the
 *     400-status surface; the module test covers the predicate).
 *
 * Trust assumption (intentional, documented):
 *   Real Product.slug values in this codebase are kebab-case
 *   (`[a-z0-9-]+` with hyphens), e.g. "amish-secrets",
 *   "test-course", "lumio". They never look like a Prisma cuid
 *   (which has no hyphens). A slug like "complete2026supersale25off"
 *   (21+ chars of pure alphanumerics starting with 'c') WOULD be
 *   misclassified as a cuid and rejected by any guard that uses
 *   `isCuidShape`. Risk is theoretical — the product creation
 *   pipeline (see src/app/api/products/route.ts) does not enforce
 *   kebab-case at the DB level, but the existing products in
 *   production are all kebab-case.
 *
 * If the codebase ever introduces raw-alphanumeric slugs, the
 * caller should switch to a stricter check (e.g. require the
 * slug input to match `/^[a-z0-9-]+$/` explicitly) instead of
 * using this heuristic.
 *
 * Heuristic: cuid v1/v2 starts with `c` and is followed by ≥20
 * alphanumerics. Slugs in this codebase always contain a hyphen,
 * which the `[a-z0-9]` character class excludes.
 */
const CUID_SHAPE = /^c[a-z0-9]{20,}$/i;

export function isCuidShape(value: string | null | undefined): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  return CUID_SHAPE.test(value);
}
