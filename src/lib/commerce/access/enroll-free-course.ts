/**
 * src/lib/commerce/access/enroll-free-course.ts
 *
 * Phase 2 — Free layer + retention. Step 1 of 5 in the Phase 2
 * sequencing (per Coursyy plan ADR-0016):
 *   feat(access)     : free enrollment         ← this file (commit 1/5)
 *   feat(learning)   : continue watching       (commit 2/5)
 *   feat(learning)   : watchlist               (commit 3/5)
 *   feat(notifications): new-content alerts   (commit 4/5)
 *   feat(discovery)  : next-course suggester   (commit 5/5)
 *
 * Goal: ONE canonical use case for "enroll this user in this free
 * course" — replaces the inline `try/catch prisma.accessGrant.upsert`
 * side-effect that lived inside AccessGate (Step 8 refactor). Idempotent
 * via AccessGrant's `@@unique([sourceType, sourceId, productId])`:
 * the composite key naturally dedupes concurrent retries. Defense-in-
 * depth: refuses to enroll on a paid course even if the caller skipped
 * the isFreeCourse pre-check.
 *
 * Why a use case and not a route-only handler:
 * - The same logic will be invoked from (a) the POST /api/access/enroll-free
 *   route (this commit), (b) the existing AccessGate (future refactor —
 *   migrate side-effect in commit 2 or later), and (c) the watchlist +
 *   continue-watching features (commits 2-5 of Phase 2). Centralizing
 *   prevents re-implementation of the upsert key + idempotency contract
 *   in three places.
 *
 * Pattern source: `processOrder` in src/lib/commerce/orders/complete-order.ts.
 *   - Read product by slug or id.
 *   - Verify eligibility (price=0 + slug in FREE_COURSE_SLUGS).
 *   - 2-query pattern: findFirst (alreadyEnrolled signal) + upsert
 *     (atomic write). Yields unambiguous alreadyEnrolled flag without
 *     timestamp heuristics (Prisma's @updatedAt behavior on empty
 *     updates is not formally specified, so a delta-based heuristic
 *     was fragile — see the post-fix §Review note below).
 *
 * Idempotency contract:
 *   - The `@@unique([sourceType, sourceId, productId])` index on
 *     AccessGrant makes concurrent upserts safe (Prisma atomic path).
 *   - `alreadyEnrolled: true` is set if a row pre-existed BEFORE the
 *     upsert call. Re-engagement: the upsert refreshes `status='active'`
 *     and clears `revokedAt` deliberately — free-course re-enrollment
 *     after revocation (admin refunded, self-unenroll, etc.) is
 *     supported. If the caller needs different semantics (e.g., paid-
 *     course upsert should NOT reactivate revoked grants), add an
 *     options flag here and propagate to the upsert `update` clause.
 *
 * Post-fix §Review (commit-time annotation):
 *   v1.0 (commit-time author) had 2 BLOCKERs flagged by code-reviewer:
 *     (a) `update: {}` left revoked grants revoked — replaced with
 *         explicit `update: { status: 'active', revokedAt: null }`.
 *     (b) `alreadyEnrolled` was a `getTime` delta heuristic against
 *         Prisma's `@updatedAt` behavior with `update: {}` — replaced
 *         with explicit pre-check findFirst (deterministic, +1 query).
 *     Plus the TS errors (TS2345 AppError signature; TS2339 .getTime
 *     narrowing) clarified as a side-effect of the heuristic remove.
 */

import { prisma } from "@/lib/db/prisma";
import { isFreeCourse } from "@/lib/courses/is-free-course";
import { AppError } from "@/lib/errors";

/** Verdict discriminated union — mirrors resolveProductAccess shape. */
export type EnrollFreeCourseResult =
  | { enrolled: true; grantId: string; alreadyEnrolled: boolean }
  | { enrolled: false; reason: EnrollDenialReason };

export const EnrollDenialReason = {
  /** Caller asked for a product that doesn't exist. */
  ProductNotFound: "product_not_found",
} as const;

export type EnrollDenialReason =
  (typeof EnrollDenialReason)[keyof typeof EnrollDenialReason];

export interface EnrollFreeCourseInput {
  /** User.id (Postgres cuid). Required — falsy values refused defensively. */
  userId: string;
  /** Product slug (canonical accession key, matches `[locale]/[slug]` URLs). */
  productSlug: string;
}

/**
 * Enroll a user in a free course.
 *
 * Idempotency contract:
 *   - The `@@unique([sourceType, sourceId, productId])` index on AccessGrant
 *     makes concurrent calls (refresh, retry, double-click) safe: the
 *     upsert hits the unique key with `update: { status: 'active' }`,
 *     naturally re-activating any previously-revoked grant on the
 *     same sourceId.
 *   - `alreadyEnrolled` flag is determined by an explicit pre-check
 *     (`prisma.accessGrant.findFirst` on the unique key) — not from
 *     Prisma's row-timestamp heuristic.
 *
 * Errors:
 *   - `AppError('NOT_FREE_COURSE', 422)` if product exists but the
 *     `isFreeCourse(slug, price)` defense-in-depth check fails.
 *
 * Caller responsibility:
 *   - Caller MUST verify `userId` is authenticated. The use case refuses
 *     empty `userId` defensively (returns denial reason=ProductNotFound,
 *     coalescing with legitimate "not found" to avoid leaking existence
 *     of free vs paid products to guests).
 */
export async function enrollFreeCourse(
  input: EnrollFreeCourseInput,
): Promise<EnrollFreeCourseResult> {
  // ── Defensive input guards ───────────────────────────────────
  if (!input.userId || !input.productSlug) {
    return { enrolled: false, reason: EnrollDenialReason.ProductNotFound };
  }

  const { userId, productSlug } = input;

  // ── Resolve product (slug is the canonical accession key) ───
  const product = await prisma.product.findFirst({
    where: {
      OR: [{ slug: productSlug }, { id: productSlug }],
    },
    select: { id: true, slug: true, price: true },
  });

  if (!product) {
    return { enrolled: false, reason: EnrollDenialReason.ProductNotFound };
  }

  // ── Eligibility check (defense-in-depth) ────────────────────
  // The AccessGate + video stream + ebook routes already gate on
  // `isFreeCourse(slug, price)`. Server-side routes MUST re-verify
  // because they can be called directly (curl / POST without RSC
  // gate). A product published with `price > 0` STAYS gated even if
  // its slug is mis-typed into FREE_COURSE_SLUGS (the helper requires
  // BOTH conditions).
  if (!isFreeCourse(product.slug, product.price)) {
    throw new AppError(
      `Product ${product.slug} is not in the FREE_COURSE_SLUGS list or has price > 0`,
      { code: "NOT_FREE_COURSE", statusCode: 422 },
    );
  }

  // ── 2-query pattern: pre-check + upsert ─────────────────────
  // Replaces the previous Prisma-upsert timestamp-heuristic which was
  // uncertain about `@updatedAt` behavior on empty `update: {}` clauses.
  // Deterministic +1 round-trip on cold-path, OK cost for free-enrollment
  // (1 call/user per course, never in a hot loop).
  const sourceId = `free_enrollment:${userId}:${product.id}`;

  const existing = await prisma.accessGrant.findFirst({
    where: {
      sourceType: "free_enrollment",
      sourceId,
      productId: product.id,
    },
    select: { id: true },
  });
  const alreadyEnrolled = !!existing;

  // Upsert deliberately reactivates previously-revoked grants on the
  // same sourceId. Free-course re-enrollment is intended to be
  // self-service. If a future Phase requires different semantics
  // (e.g., admin revocation is permanent), add an `options` flag and
  // branch the `update` clause accordingly.
  const grant = await prisma.accessGrant.upsert({
    where: {
      sourceType_sourceId_productId: {
        sourceType: "free_enrollment",
        sourceId,
        productId: product.id,
      },
    },
    create: {
      userId,
      productId: product.id,
      sourceType: "free_enrollment",
      sourceId,
      status: "active",
    },
    update: { status: "active", revokedAt: null },
    select: { id: true },
  });

  return {
    enrolled: true,
    grantId: grant.id,
    alreadyEnrolled,
  };
}
