/**
 * src/domains/catalog/content-pages/list-creator-pages-types.ts
 *
 * Domain types + port contract for `listCreatorPages` (MCR Phase 1 —
 * Notion-like content pages feature, creator-side SIDEBAR counterpart
 * to `resolvePublishedContent`).
 *
 * ─── Architecture (per ADR-0016 §1 dep direction) ──────────────
 *
 * Declares, at the Domain layer:
 *   1. `ListCreatorPagesInput`   — use case input.
 *   2. `ListCreatorPagesPageRow` — per-page DTO returned in the
 *      success branch (the canonical "sidebar row" shape).
 *   3. `ListCreatorPagesResult`  — discriminated union result
 *      (3 branches: success | not_found | forbidden).
 *   4. `ListCreatorPagesPort`     — persistence port with two
 *      methods: confirm product ownership + return the flat
 *      list of every ContentPage with its default-language
 *      title denormalized.
 *
 * ─── Creator-only concerns (vs `resolvePublishedContent`) ───────
 *
 * Compared to the public-read use case:
 *   - Authentication is REQUIRED. `actorId` is supplied and the
 *     use case verifies `actorId === product.creatorId`. Cross-
 *     product pages are forbidden defensively.
 *   - The list covers EVERY page (draft + published + archived),
 *     not just published. This is the sidebar for the EDITOR
 *     surface — the creator needs to see what's pending, what
 *     shipped, and what's hidden.
 *   - The default-language title is denormalized via a LATERAL
 *     join so the sidebar can render without N+1 roundtrips.
 *     This is the design choice from the prior tree-thinking
 *     (Option A: server-side flat list + client-side tree via
 *     Map). It mirrors how `resolvePublishedContent`'s port
 *     returns `PublishedPageRow[]` with the resolved locale's
 *     title denormalized.
 *
 * ─── No `tree` field on the row (deliberate choice) ────────────
 *
 * `parentId` is the only structural relationship exposed.
 * Building the tree is the CLIENT's responsibility — see
 * `src/components/creator/SidebarTree.tsx::buildTree` (the
 * `Map<id, SidebarNode>` pattern, O(N) construction). This
 * keeps the Domain layer agnostic of UI rendering strategies
 * (the public site might prefer a different layout than the
 * editor surface).
 *
 * ─── Status validation posture ─────────────────────────────────
 *
 * `status` is a string (NOT a Prisma enum and NOT a Zod enum
 * here). The values live in `contentPageStatusSchema` from
 * `create-content-page-types.ts`; we re-use the same
 * TS-narrowing but allow any string on reads (defensive: a
 * legacy row with an unknown status shouldn't crash the
 * sidebar). The TypeScript-side narrowing happens at the
 * ContentPageStatus union type.
 */

import type { PageStatus } from "./create-content-page-types";

// Re-export for downstream consumers (Prisma adapter carries
// the same canonical union; importing it from this module
// keeps the Domain surface cohesive).
export type { PageStatus };

// ─── Use case input ──────────────────────────────────────────────

/**
 * Input to `listCreatorPages`.
 *
 * Field-by-field:
 *   - `actorId`   — User.id of the calling creator. The use
 *     case verifies `actorId === product.creatorId` (strict-
 *     owner-only mirror of the create/rename/reorder pattern).
 *   - `productId` — Product whose pages are being listed. The
 *     upstream `/creator` layout has already verified the actor
 *     can see this product; the use case re-checks ownership
 *     for defense in depth.
 *
 * Pagination: not in v1. Implied cap: 1000 pages per product
 * (matches `REORDER_BATCH_MAX`). Future PRs add a `cursor`
 * input when products exceed this.
 */
export interface ListCreatorPagesInput {
  actorId: string;
  productId: string;
}

// ─── Per-row DTO ─────────────────────────────────────────────────

/**
 * One page in the flat list.
 *
 * `title` is the default-language title (denormalized via
 * LATERAL join). `null` when:
 *   - No translation row exists for the default locale yet
 *     (newly created page; the editor will autosave one via
 *     SaveContentDocument), OR
 *   - The row's title failed a sanity regex (corrupted; adapter
 *     surfaces `null` defensively).
 *
 * `defaultLanguage` is echoed so the sidebar can fall back to
 * the slug when a per-product localization differs (forward
 * convenience — the sidebar currently always uses
 * `Product.defaultLanguage`, but the row shape preserves the
 * option to render per-row locale badges in the future).
 */
export interface ListCreatorPagesPageRow {
  id: string;
  parentId: string | null;
  slug: string;
  position: number;
  status: PageStatus;
  title: string | null;
  defaultLanguage: string;
  updatedAt: Date;
}

// ─── Discriminated union result ──────────────────────────────────

/**
 * Three exhaustive outcomes:
 *   - `success: true`              — flat list of every page,
 *     ordered (parentId, position) as the adapter returns it.
 *   - `success: false` reason: `"not_found"`  — product missing
 *     OR empty actorId / productId inputs (collapsed for no
 *     info leak about which field was blank).
 *   - `success: false` reason: `"forbidden"`  — product exists
 *     but the actorId isn't the product's creator. The SSOT
 *     resolver also computes this from the same inputs; both
 *     paths return the same typed signal so the route layer
 *     stays branchless on the happy path.
 */
export type ListCreatorPagesResult =
  | { success: true; pages: ListCreatorPagesPageRow[] }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "forbidden" };

/**
 * Stable string union of denial reasons. Mirrors the merged-
 * binding const+type pattern used across the content-pages
 * use cases. Callers SHOULD use the `reason` field of the
 * result (typed check); this const exists for hard-coded
 * literals in route mappings.
 */
export const ListCreatorPagesDenialReason = {
  NotFound: "not_found",
  Forbidden: "forbidden",
} as const;

export type ListCreatorPagesDenialReason =
  (typeof ListCreatorPagesDenialReason)[keyof typeof ListCreatorPagesDenialReason];

// ─── Port contract ───────────────────────────────────────────────

/**
 * Persistence port for the creator-siderbar list flow.
 *
 * Two methods:
 *   1. `findProductOwner`            — single read resolving
 *      `{ creatorId, defaultLanguage }`. Returns `null` for a
 *      missing product. The defaultLanguage resolution is
 *      co-located here (instead of a third method) because the
 *      adapter typically issues a single SELECT that already
 *      returns these two fields.
 *   2. `listContentPagesWithDefaultTitle` — single SQL
 *      roundtrip that returns a flat array of every
 *      ContentPage owned by the product, with the default-
 *      language translation's `title` denormalized via a
 *      LATERAL join (LEFT JOIN with `take: 1` filtered by
 *      locale). The adapter is responsible for ordering —
 *      `(parentId NULLS FIRST, position ASC)` — so the
 *      client-side tree builder is deterministic without
 *      re-sorting.
 *
 * The dependency direction (Domain → Port) matches ADR-0016
 * §1; the Prisma adapter lives in a sibling file in this same
 * commit, registered by the page.tsx composition root.
 */
export interface ListCreatorPagesPort {
  /**
   * Combined read of the product's owner + defaultLocale.
   *
   * Returns `null` when the product doesn't exist → use case
   * returns `not_found`.
   *
   * Implementation hint for the Prisma adapter:
   *
   *   ```
   *   prisma.product.findUnique({
   *     where: { id: productId },
   *     select: { creatorId: true, defaultLanguage: true },
   *   })
   *   ```
   */
  findProductOwner(input: {
    productId: string;
  }): Promise<{ creatorId: string; defaultLanguage: string } | null>;

  /**
   * List every ContentPage of the product with the default-
   * language translation title denormalized.
   *
   * Per-row resolution rule: for each ContentPage, return the
   * first translation whose `locale === defaultLanguage`.
   * When no row exists, `title` is `null` (NOT omitted — the
   * sidebar needs the page metadata to render the slot).
   *
   * Implementation hint for the Prisma adapter (single
   * roundtrip with a sub-select):
   *
   *   ```
   *   prisma.contentPage.findMany({
   *     where: { productId },
   *     orderBy: [{ parentId: "asc" }, { position: "asc" }],
   *     select: {
   *       id: true,
   *       parentId: true,
   *       slug: true,
   *       position: true,
   *       status: true,
   *       updatedAt: true,
   *       translations: {
   *         where: { locale: defaultLanguage },
   *         take: 1,
   *         select: { title: true },
   *       },
   *     },
   *   })
   *   ```
   *
   * `status` is read verbatim from the DB column string; the
   * adapter does NOT validate against `contentPageStatusSchema`
   * (read-side, defensive: a legacy row with an unknown status
   * should not crash the sidebar). The TS union narrows at the
   * type level when assertions succeed; otherwise the adapter
   * falls back to `"draft"` as the safest default.
   */
  listContentPagesWithDefaultTitle(input: {
    productId: string;
    defaultLanguage: string;
  }): Promise<{ items: ListCreatorPagesPageRow[] }>;
}
