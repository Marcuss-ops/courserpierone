/**
 * src/domains/catalog/content-pages/publish-content-product-types.ts
 *
 * Domain types + port contract for `publishContentProduct`
 * (MCR Phase 1 — Notion-like content pages feature).
 *
 * The canonical "go-live" action for a content product: validates
 * the publish gate, transitions `Product.status = "published"` +
 * sets `Product.publishedAt`, and triggers the navigation cache
 * invalidation.
 *
 * ─── Architecture (per ADR-0016 §1 dep direction) ──────────────
 *
 * Declares, at the Domain layer:
 *   1. `PublishContentProductInput`  — use case input.
 *   2. `PublishContentProductResult` — discriminated union result.
 *   3. `PublishContentProductPort`   — persistence + cache port
 *      with 4 methods (find gate context, list pages with
 *      translation counts, apply transition, revalidate cache).
 *
 * ─── The publish gate (the spec's hard requirement) ────────────
 *
 * Spec (Italian): "controlla che tutte le pagine abbiano almeno
 * una traduzione published".
 *
 * Implemented as: EVERY page in the product must satisfy BOTH:
 *   (a) `ContentPage.status === "published"` — the page itself
 *       has been published.
 *   (b) `ContentPageTranslation` row count for that page ≥ 1 —
 *       the page has at least ONE translation row.
 *
 * `ContentPageTranslation` has NO separate status column — a
 * translation is implicitly "published" when its parent page is
 * `status = "published"`. Therefore the existence check alone is
 * sufficient ("did the creator WRITE at least one translation
 * for this page?"); we don't translate-check the row's status.
 *
 * BOTH check types are aggregated into a SINGLE
 * `gate_failed { issues[] }` branch so the editor sees ALL
 * problems at once (UX optimization). The use case does NOT
 * short-circuit on the first failure — it walks the entire page
 * list and reports every issue.
 *
 * ─── Idempotency ("already_published" branch) ──────────────────
 *
 * Spec (Italian): "setta `Product.status = "published"` e
 * `publishedAt`".
 *
 * If the product is ALREADY `status = "published"`, the use case
 * returns `already_published { publishedAt }` carrying the
 * EXISTING timestamp. We deliberately do NOT re-write
 * `publishedAt` (would skew analytics + scheduled-publish
 * timestamps) and we do NOT re-call `revalidateNavigation`
 * (would thrash the Next.js cache needlessly).
 *
 * Two alternatives considered:
 *   (a) Re-write publishedAt + revalidate on every call. Rejected:
 *       pollutes analytics ("re-publish on 2026-07-19" overwrites
 *       the original 2026-04-01 go-live); thrashes the cache.
 *   (b) Always return `success` (call it idempotent). Rejected:
 *       hides the "this was already live" audit signal that ops
 *       uses to detect duplicate publish attempts (e.g. UI bugs,
 *       double-click submit).
 *
 * (b) chosen: a separate explicit branch preserves the audit
 * signal WITHOUT polluting the data.
 *
 * ─── The owner-vs-admin allow-source distinction ───────────────
 *
 * The use case supports TWO allow sources inline:
 *   1. `actorId === product.creatorId` (the canonical owner
 *      publish path; mirrors rename/reorder's inline check).
 *   2. `input.bypassOwnership === true` from the route layer
 *      (admin publish path; honored when route-layer's
 *      `resolveCreatorProductAccess` returns `source: "admin"`).
 *
 * The flag is the route layer's contract: the route verifies
 * "is this actor an admin via the resolver?" and forwards the
 * boolean. The use case itself does NOT import
 * `resolveCreatorProductAccess` — cross-domain imports belong
 * to the route/adapter layer per ADR-0016 §1. This keeps the
 * domain rule trivially testable (the use case is pure).
 *
 * `bypassOwnership` is OPT-IN: omitting it preserves the strict
 * creator-only check (defense in depth — same posture as
 * rename/reorder). An admin who does NOT set the flag gets
 * `forbidden` from the inline check (which is strictly correct —
 * the route's responsibility is to either veto admin access
 * before calling OR set the bypass flag).
 *
 * ─── The cache regen port (separates infra from domain) ────────
 *
 * Spec (Italian): "rigenera la cache di navigazione".
 *
 * `revalidateNavigation({ slug })` is the port method whose
 * default adapter wraps `revalidateProduct(slug)` from
 * `src/lib/admin/revalidate-product.ts` (locale-iterated
 * `revalidatePath(/{locale}/{slug}, "page")`). The use case
 * does NOT import `next/cache` directly — the cache concern is
 * a Next.js infra detail the port isolates for:
 *
 *   - Testability — stub `revalidateNavigation` in unit tests.
 *   - Portability — the same domain rule works in non-Next runtimes.
 *   - Failure isolation — adapter catches + logs cache errors
 *     (mirrors the existing `try/catch` in `revalidate-product.ts`)
 *     without failing the success outcome. Cache glitches are
 *     observable via the adapter's log; analytics dashboards
 *     see a successful publish.
 *
 * ─── Why `Product.publishedAt` was added to the schema ─────────
 *
 * Migration: `20260719200000_add_product_published_at` (same PR).
 *
 * ContentPage already has `publishedAt DateTime?` (used by
 * `saveContentDocument`'s publish-status transition). The
 * Product-level field mirrors that pattern for go-live
 * timestamps — independent of `status` (matches the same
 * scheduled-publish-ready comment as ContentPage's).
 *
 * Alternatives considered:
 *   (a) Repurpose `updatedAt`. Rejected: pollutes metadata
 *       ("updatedAt" would also bump on title renames +
 *       product catalog edits — the publish go-live is a
 *       distinct lifecycle event worth its own column).
 *   (b) Use a separate `PublishEvent` table (audit log style).
 *       Rejected: overkill for a single timestamp; the
 *       denormalized column is enough for analytics + sorting.
 *   (c) Derive `publishedAt` from a derived materialized view.
 *       Rejected: over-engineered; the raw column is O(1) to read.
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
