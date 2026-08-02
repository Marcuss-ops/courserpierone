// size-budget-exempt — one cohesive publish contract; ADR-0016 §1.
/** Domain input, outcomes and infrastructure contract for publishing a product.
 * The gate requires each page to be published and have at least one translation.
 * The use case is idempotent: an already-published product keeps its timestamp.
 */

/**
 * The status literal set as used by the use case. Mirrors the
 * product schema comment (`draft | published | archived`).
 * NB: kept as a string union (NOT Prisma enum) per the
 * ADR-0017 dep policy + the project's convention of
 * validated-app-side string columns.
 */
export type ProductPublishStatus = "draft" | "published" | "archived";

// ─── Use case input ──────────────────────────────────────────────

/**
 * Input to `publishContentProduct`.
 *
 * Field-by-field:
 *   - `actorId`         — User.id of the calling actor. The use
 *     case re-checks ownership (unless `bypassOwnership` is set
 *     by the route).
 *   - `productId`       — Product to publish. The ID space is
 *     validated pure-string (no shape schema — the GUARD step
 *     uses the same `!input.actorId || !input.productId` pattern
 *     as rename/reorder).
 *   - `bypassOwnership`  — Optional flag. SET BY THE ROUTE LAYER
 *     when its resolver (`resolveCreatorProductAccess`) returns
 *     `source: "admin"`. When `true`, the inline owner check
 *     is skipped (admin can publish any product). When `false`
 *     or omitted, the inline check enforces strict owner-only
 *     access — same posture as rename/reorder. Inline source is
 *     the use case body; the flag is the route's
 *     `resolveCreatorProductAccess`-derived signal.
 *   - `now`             — Testable clock injection. Defaults to
 *     `new Date()` at the use case body. Used both for the
 *     `applyPublishTransition` write AND as a fallback for the
 *     `already_published` branch when the product's stored
 *     `publishedAt` is null (soft anomaly).
 *
 * The input does NOT accept:
 *   - `actorRole`       — the route-layer resolver decides
 *     bypassOwnership; the use case neither reads nor trusts
 *     actor role.
 *   - `slug` or `creatorId` — those are read fresh from the
 *     product row in the same port call (`findProductForPublishGate`).
 *     The caller never supplies them stale.
 *   - `status` — the transition is a one-way `draft → published`
 *     action; the caller never asks "publish me to status X".
 */
export interface PublishContentProductInput {
  actorId: string;
  productId: string;
  bypassOwnership?: boolean;
  now?: Date;
}

// ─── Gate issue type ─────────────────────────────────────────────

/**
 * Per-issue sub-shape inside the `gate_failed` branch. The
 * `reason` literal distinguishes:
 *   - `"draft"`          — page status is still "draft" (must
 *                          transition to "published" first,
 *                          presumably via a future
 *                          `publishContentPage` use case that
 *                          mirrors this one for pages).
 *   - `"no_translation"` — published status BUT zero translation
 *                          rows. The page has no content in any
 *                          locale. Creator must call
 *                          `saveContentDocument` (which upserts
 *                          the translation row) before retrying.
 */
export type PublishGateIssueReason = "draft" | "no_translation";

/**
 * One gate failure. The aggregate list in the
 * `gate_failed` branch carries one of these per failing page.
 * Multiple issues per page are possible (e.g., a draft page with
 * zero translations emits TWO issues — one `draft`, one
 * `no_translation`).
 */
export interface PublishGateIssue {
  pageId: string;
  reason: PublishGateIssueReason;
}

// ─── Discriminated union result ──────────────────────────────────

/**
 * Seven exhaustive outcomes:
 *   - `success: true` — product transitioned to published;
 *     `productId` + `slug` echo for the audit log; `publishedAt`
 *     is the NEW post-transition timestamp (= `input.now` or the
 *     adapter's `applyPublishTransition` return); `revalidated:
 *     true` confirms the cache invalidation port was called.
 *   - `success: false` (6 reason branches)
 *     - `not_found`            — Product doesn't exist OR
 *       defensive empty `actorId`/`productId`.
 *     - `forbidden`            — actorId !== product.creatorId
 *       AND `bypassOwnership` not set. Defense-in-depth check
 *       on top of the route layer's admin resolver.
 *     - `archived_status`      — Product.status = "archived".
 *       Cannot directly publish from archived; unarchive is a
 *       separate use case (future PR).
 *     - `already_published`    — Product.status = "published".
 *       Carries the EXISTING `publishedAt` so the caller can
 *       surface "you published on X" instead of falsely rewriting
 *       the timestamp. Short-circuits BEFORE gate evaluation +
 *       apply + revalidate.
 *     - `no_pages`             — Gate failure: zero pages in the
 *       product. Special-cased (not folded into `gate_failed`)
 *       so the editor UI shows "add a page first" instead of
 *       an empty issues list.
 *     - `gate_failed`          — Gate failure: aggregate list of
 *       per-page issues. `issues[]` may contain either of
 *       `draft | no_translation` for the same page (rare but
 *       possible); the list preserves the order of pages
 *       encountered so the editor UI can render them in tree
 *       order.
 *
 * Precedence (top-to-bottom in the result type, top wins at
 * runtime):
 *   1. `not_found`             (existence check first)
 *   2. `forbidden`             (defense-in-depth on top of route)
 *   3. `archived_status`       (terminal state, can't recover)
 *   4. `already_published`     (idempotency; skips gate)
 *   5. `no_pages` / `gate_failed` (gate validation)
 *   6. `success`               (apply + cache + return)
 *
 * Branching to `archived_status` BEFORE `already_published` is
 * intentional: a product archived after publish re-entered
 * `archived_status` cannot be re-published without an unarchive
 * step, even if its `publishedAt` is non-null. The current
 * product view shows "archived" (terminal), not "previously
 * published, currently archived".
 */
export type PublishContentProductResult =
  | {
      success: true;
      productId: string;
      slug: string;
      publishedAt: Date;
      revalidated: true;
    }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "forbidden" }
  | { success: false; reason: "archived_status" }
  | {
      success: false;
      reason: "already_published";
      publishedAt: Date;
    }
  | {
      success: false;
      reason: "no_pages";
      productId: string;
    }
  | {
      success: false;
      reason: "gate_failed";
      issues: PublishGateIssue[];
    };

/**
 * Stable string union of denial reasons. The const+type merged
 * binding pattern (matches `ReorderContentPagesDenialReason` etc.)
 * unifies the literal at call sites without an additional
 * discriminator duplication.
 */
export const PublishContentProductDenialReason = {
  NotFound: "not_found",
  Forbidden: "forbidden",
  ArchivedStatus: "archived_status",
  AlreadyPublished: "already_published",
  NoPages: "no_pages",
  GateFailed: "gate_failed",
} as const;

export type PublishContentProductDenialReason =
  (typeof PublishContentProductDenialReason)[keyof typeof PublishContentProductDenialReason];

// ─── Per-page DTO read by the gate port ──────────────────────────

/**
 * One page row materialised by `listContentPagesWithTranslationCounts`.
 * The adapter satisfies this with a single query (LEFT JOIN +
 * COUNT subquery); the use case reads the materialized shape.
 *
 * `translationCount` is the COUNT of `ContentPageTranslation`
 * rows for that page. Pages with `translationCount === 0`
 * fail the gate with `no_translation`.
 */
export interface PublishGatePageSummary {
  pageId: string;
  /** Page status. Only "draft" / "published" are valid for a
   *  gate candidate (a page deleted at the DB level is gone;
   *  pages in any other status are out of scope for v1). */
  status: "draft" | "published";
  translationCount: number;
}

// ─── Port contract ───────────────────────────────────────────────

/**
 * Persistence + cache port for the publish use case. Four methods
 * mapping to the orchestration's 4 phases:
 *
 *   1. `findProductForPublishGate`        — read the product
 *      ownership + status + slug + existing publishedAt in
 *      one trip. Used by steps 2-4 of the orchestration.
 *
 *   2. `listContentPagesWithTranslationCounts` — fetch every
 *      page + its translation count for gate evaluation.
 *      Used by step 5 of the orchestration.
 *
 *   3. `applyPublishTransition`           — atomic UPDATE
 *      `Product SET status='published', publishedAt=$now WHERE
 *      id=$productId`. Used by step 6.
 *
 *   4. `revalidateNavigation`             — cache invalidation.
 *      Used by step 7. The default adapter mirrors
 *      `revalidateProduct(slug)` from
 *      `src/lib/admin/revalidate-product.ts`. Cache errors are
 *      caught + logged by the adapter (NOT thrown); a cache
 *      glitch never blocks the success outcome. Audit signals
 *      surface via the adapter's log.
 *
 * The Prisma adapter lives in a sibling file (separate commit).
 */
export interface PublishContentProductPort {
  /**
   * Single read combining ownership + status + slug +
   * existing publishedAt. Returns null if Product doesn't
   * exist. The publishedAt field is read for the
   * `already_published` idempotency branch (echo the existing
   * timestamp on retry, NEVER re-write it).
   */
  findProductForPublishGate(input: {
    productId: string;
  }): Promise<
    | {
        creatorId: string;
        slug: string;
        status: ProductPublishStatus;
        publishedAt: Date | null;
      }
    | null
  >;

  /**
   * List every page in the product with its translation count.
   *
   * Implementation guide for the adapter:
   *   ```
   *   SELECT cp.id, cp.status,
   *     (SELECT COUNT(*) FROM "ContentPageTranslation"
   *      WHERE pageId = cp.id) AS translationCount
   *   FROM "ContentPage" cp
   *   WHERE cp.productId = $1
   *   ORDER BY cp."position" ASC
   *   ```
   *
   * The full list is returned even for large products (cap:
   * 1000 pages per product — matches the reorder guard). The
   * use case walks every row to detect gate failures.
   */
  listContentPagesWithTranslationCounts(input: {
    productId: string;
  }): Promise<{ items: PublishGatePageSummary[] }>;

  /**
   * Atomic transition. The adapter issues a single UPDATE:
   *
   *   ```
   *   UPDATE "Product"
   *   SET status = 'published', "publishedAt" = $now
   *   WHERE id = $productId
   *   ```
   *
   * Optional transaction wrapper (`$transaction`) is at the
   * adapter's discretion — single-row UPDATE doesn't strictly
   * need one, but the call is marked "transition" for audit
   * clarity. Returns the post-update `publishedAt` (= the
   * use case-supplied clock; tests rely on this for
   * determinism).
   */
  applyPublishTransition(input: {
    productId: string;
    now: Date;
  }): Promise<{
    publishedAt: Date;
    slug: string;
  }>;

  /**
   * Cache invalidation. The default adapter wraps
   * `revalidateProduct(slug)` (locale-iterated
   * `revalidatePath(/{locale}/{slug}, "page")`). The adapter
   * swallows errors per the established pattern in
   * `src/lib/admin/revalidate-product.ts` — revalidate
   * failures are observable via the adapter's log AND the
   * existing `try/catch console.error`. The port contract
   * returns `{ revalidated: true }` on completion.
   *
   * The use case calls this AFTER
   * `applyPublishTransition` returns. If revalidate throws
   * (which it shouldn't per the adapter contract), the use
   * case surfaces a programmer-error via the route layer's
   * caller (NOT a soft denial — cache is not part of the
   * domain rule).
   */
  revalidateNavigation(input: { slug: string }): Promise<{
    revalidated: true;
  }>;
}
