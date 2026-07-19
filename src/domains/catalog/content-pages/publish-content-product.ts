/**
 * src/domains/catalog/content-pages/publish-content-product.ts
 *
 * Pure use case — ONE canonical entry point for "publish a
 * content product": validate the publish gate, transition the
 * product to `status = "published"`, set `publishedAt`, and
 * revalidate the navigation cache.
 *
 * ─── MCR Phase 1 — Notion-like pages feature ─────────────────────
 *
 * Orchestrates (in this exact order):
 *   1. GUARD       — defensive empty-string rejection for
 *                    actorId + productId. Collapsed to
 *                    `not_found`. No port calls.
 *   2. PRODUCT     — single port call to read
 *                    `{ creatorId, slug, status, publishedAt }`.
 *                    Null → `not_found`.
 *   3. OWNERSHIP   — strict creator check, gateable by the
 *                    route-layer `bypassOwnership` flag (admin
 *                    publish path). Mismatch → `forbidden`.
 *                    Defense in depth on top of the route's
 *                    `resolveCreatorProductAccess`.
 *   4. STATUS BRANCH
 *                    - `archived` → `archived_status`
 *                      (terminal state; no recovery).
 *                    - `published` → `already_published`
 *                      (idempotent retry; echo existing
 *                      publishedAt; NO re-write, NO
 *                      revalidate).
 *                    - `draft` → proceed to gate.
 *   5. GATE        — single port call to list every page +
 *                    its translation count. Aggregated check:
 *                    zero pages → `no_pages`; any page fails
 *                    both `status == 'published'` AND
 *                    `translationCount >= 1` → `gate_failed`
 *                    with the FULL list of issues (so the
 *                    editor sees ALL problems at once).
 *   6. APPLY       — single port call to transition the
 *                    product. The adapter issues
 *                    `UPDATE Product SET status='published',
 *                    publishedAt=$now WHERE id=$productId`.
 *   7. REVALIDATE  — single port call to invalidate the
 *                    navigation cache for the product's
 *                    slug. The default adapter wraps
 *                    `revalidateProduct(slug)` from
 *                    `src/lib/admin/revalidate-product.ts`.
 *   8. RETURN      — translate to the 7-branch discriminated
 *                    union. Success branch carries
 *                    `{ productId, slug, publishedAt,
 *                    revalidated: true }`.
 *
 * ─── Why pure (no Prisma import, no next/cache import) ──────────
 *
 * ADR-0016 §1 dep direction:
 *   - This file: Domain layer. NO `@prisma/client` import.
 *     NO `next/cache` import. NO cross-domain import of
 *     `resolveCreatorProductAccess`.
 *   - Persistence goes through `PublishContentProductPort`
 *     (declared in `./publish-content-product-types`).
 *   - The Prisma adapter lives in a sibling file in a follow-up
 *     commit; the route composition root wires the adapter.
 *   - The cache concern is a Next.js infra detail; the port
 *     isolates it for testability + portability.
 *
 * Test stub: `tests/publish-content-product.test.ts` builds an
 * in-memory implementation of the port (no Prisma or Next mock).
 *
 * ─── Why precedence is what it is ───────────────────────────────
 *
 * The 7-step ordering above does NOT match the strict textual
 * order of the user spec ("controlla le pagine → setta status →
 * rigenera cache"). The reordering is necessary for:
 *
 *   1. **Security** — `forbidden` must come BEFORE
 *      `already_published`. Otherwise a non-owner actor
 *      could probe a product's status by attempting publish
 *      and reading the response. The bypass flag is the
 *      correct escape (set by the route's admin resolver).
 *
 *   2. **Less work on retry** — `already_published` BEFORE
 *      gate evaluation. An already-live product doesn't need
 *      the (potentially expensive) page-list query. Skipping
 *      the gate on retry is correct semantically too — if
 *      the product was already live, the gate passed the
 *      previous time and we trust the existing state.
 *
 *   3. **Terminal-vs-idempotent states** — `archived`
 *      BEFORE `already_published`. A product that was
 *      published and then archived enters `archived_status`,
 *      not `already_published`. The audit signal is
 *      "this product is in a terminal state, you need an
 *      unarchive flow" — not "this was previously published".
 *
 * The aggregate `gate_failed` branch collects ALL issues in
 * one pass (linear scan). The use case does NOT short-circuit
 * on the first issue — the editor wants to see every problem
 * at once, not fix-then-retry-then-discover-another bug.
 *
 * ─── Why the cache port returns `revalidated: true` not "succeeded"
 *
 * The literal `revalidated: true` (instead of a generic
 * `succeeded: true`) reads more clearly at the success branch
 * — the caller can tell from the type that this use case ALSO
 * drives a cache invalidation side effect (the cache could
 * have been a separate step). Future use cases that don't
 * have a cache concern can use a different literal.
 */

import {
  PublishContentProductDenialReason, // value+type merged binding — used as Reason.X in return branches; the bottom re-export doesn't bring it into local scope
  type PublishContentProductInput,
  type PublishContentProductPort,
  type PublishContentProductResult,
  type PublishGateIssue,
} from "./publish-content-product-types";

/**
 * Dependency injection contract. The use case NEVER imports
 * the Prisma adapter directly; the route composition root
 * wires it.
 */
export interface PublishContentProductDeps {
  port: PublishContentProductPort;
}

/**
 * Publish a content product.
 *
 * Returns the discriminated-union outcome. Never throws on
 * soft validation / ownership / gate failures (caller matches
 * on `success` boolean + `reason` literal). The port layer
 * is responsible for swallowing cache infra errors
 * (revalidate failures don't block the domain outcome).
 *
 * Error surface (NEVER thrown from soft branches):
 *   - `not_found`           — defensive empty inputs OR
 *     product doesn't exist.
 *   - `forbidden`           — actorId !== product.creatorId
 *     AND `bypassOwnership` not set. Defense in depth on top
 *     of the route layer's `resolveCreatorProductAccess`.
 *   - `archived_status`     — Product.status = "archived";
 *     unarchive is a separate future use case.
 *   - `already_published`   — Product.status = "published";
 *     echoes the existing `publishedAt` so the caller can
 *     surface "you published on X" without a re-write.
 *   - `no_pages`            — Gate failure: zero pages in
 *     product.
 *   - `gate_failed`         — Gate failure: aggregate list of
 *     per-page issues (status='draft' OR translationCount=0).
 *
 * Programmer-error paths (the caller has a bug):
 *   - Port throws on `applyPublishTransition` retry conflict
 *     (e.g., the row was deleted between the gate check and
 *     the UPDATE; surfaced as a thrown error through the
 *     route layer's error boundary).
 *   - Port throws on `revalidateNavigation`. The adapter
 *     contract says "log + swallow" — this should never
 *     reach the use case body, but defense in depth notes
 *     that a buggy adapter that DOES throw would surface
 *     as a thrown error (route layer 500).
 */
export async function publishContentProduct(
  input: PublishContentProductInput,
  deps: PublishContentProductDeps,
): Promise<PublishContentProductResult> {
  // ─── 1. GUARD — defensive empty-input rejection ───────────────
  //
  // The route layer (session middleware) is the primary gate;
  // an empty actorId can only reach here via a future caller
  // that bypasses the route. We refuse rather than forge an
  // identity from empty string. The same collapse for
  // productId (no info leak about which field was blank).
  //
  // `bypassOwnership` is OPT-IN: omitting it preserves the
  // strict creator check.
  if (!input.actorId || !input.productId) {
    return {
      success: false,
      reason: PublishContentProductDenialReason.NotFound,
    };
  }

  // ─── 2. PRODUCT — fetch owner + status + slug + publishedAt ─
  //
  // Single read combining the four values we need for steps
  // 3 + 4. Returns null when the product doesn't exist →
  // collapsed `not_found` denial.
  const productCtx = await deps.port.findProductForPublishGate({
    productId: input.productId,
  });
  if (!productCtx) {
    return {
      success: false,
      reason: PublishContentProductDenialReason.NotFound,
    };
  }

  // ─── 3. OWNERSHIP — strict creator check, bypassable ────────
  //
  // `bypassOwnership` is set by the route layer when its
  // access resolver returned `source: "admin"`. Without the
  // flag we enforce the strict creator-only check — same
  // posture as rename/reorder's inline check. This is defense
  // in depth: if the route forgot to set the flag (bug), the
  // use case still vetoes non-owner actors.
  //
  // We DON'T short-circuit on `forbidden` with the same
  // productCtx — the read above is non-secrets and the
  // ownership check doesn't leak new info.
  if (
    !input.bypassOwnership &&
    productCtx.creatorId !== input.actorId
  ) {
    return {
      success: false,
      reason: PublishContentProductDenialReason.Forbidden,
    };
  }

  // ─── 4. STATUS BRANCH — archived / published / draft ───────
  //
  // Order: archived BEFORE published. A product that was
  // published and then archived enters the terminal
  // `archived_status` branch (not `already_published`). The
  // audit signal is "this product is archived, unarchive
  // first", not "this product was previously published" —
  // the difference matters for ops.
  if (productCtx.status === "archived") {
    return {
      success: false,
      reason: PublishContentProductDenialReason.ArchivedStatus,
    };
  }
  if (productCtx.status === "published") {
    // Idempotent retry: echo the EXISTING publishedAt. NEVER
    // re-write (would pollute analytics). NEVER re-call
    // revalidate (would thrash the cache).
    //
    // Fallback: legacy/anomaly rows with `publishedAt = null`
    // (e.g., the column was just added and a row was promoted
    // out-of-band; or a previous soft bug). We coalesce onto
    // `input.now` rather than fabricate a separate "synthetic"
    // timestamp — the route layer's mirror of input.now shows
    // up in the same audit log entry as the publish request.
    return {
      success: false,
      reason: PublishContentProductDenialReason.AlreadyPublished,
      publishedAt:
        productCtx.publishedAt ?? input.now ?? new Date(),
    };
  }

  // ─── 5. GATE — every page must be published + have translation ─
  //
  // Single port call to fetch every page + its translation
  // count. The full list is returned; we walk it linearly to
  // collect issues (no short-circuit — UX wants ALL problems
  // at once).
  const pages = await deps.port.listContentPagesWithTranslationCounts({
    productId: input.productId,
  });

  // Special case: zero pages. Distinct from `gate_failed` with
  // an empty issues list because the editor UX says "add a
  // page first" not "zero issues, ready to publish". The
  // `productId` echo helps the route's audit log pinpoint
  // which product was attempted on an empty-content draft.
  if (pages.items.length === 0) {
    return {
      success: false,
      reason: PublishContentProductDenialReason.NoPages,
      productId: input.productId,
    };
  }

  // Aggregate issuance scan. Issues may include MULTIPLE per
  // page (a draft page with zero translations emits two
  // issues — `draft` AND `no_translation`). The list preserves
  // the order of pages encountered (the adapter's ORDER BY
  // `position`) so the editor UI can render in tree order.
  const issues: PublishGateIssue[] = [];
  for (const p of pages.items) {
    if (p.status !== "published") {
      issues.push({ pageId: p.pageId, reason: "draft" });
    }
    if (p.translationCount === 0) {
      issues.push({ pageId: p.pageId, reason: "no_translation" });
    }
  }
  if (issues.length > 0) {
    return {
      success: false,
      reason: PublishContentProductDenialReason.GateFailed,
      issues,
    };
  }

  // ─── 6. APPLY — atomic transition (status + publishedAt set) ──
  //
  // Clock resolved ONCE here and forwarded to both the port
  // (for the DB write) AND carried forward to the success
  // branch. Injectable for deterministic tests.
  const now = input.now ?? new Date();
  const transition = await deps.port.applyPublishTransition({
    productId: input.productId,
    now,
  });

  // ─── 7. REVALIDATE — invalidates Next.js cache for the slugs ─
  //
  // Uses the SLUG from the original gate check (NOT the
  // adapter's return; the adapter's slug should be identical
  // but the gate check is the authoritative source for "what
  // the publish CTA said it was publishing"). The adapter
  // wraps `revalidateProduct(slug)` and swallows + logs
  // internal errors (Next.js revalidate can throw on bad
  // locale config — the contract is "never throws out of
  // the port").
  await deps.port.revalidateNavigation({ slug: productCtx.slug });

  // ─── 8. RETURN — success branch with echo for the audit log ──
  return {
    success: true,
    productId: input.productId,
    slug: productCtx.slug,
    publishedAt: transition.publishedAt,
    revalidated: true,
  };
}

/**
 * Re-export the discriminated union + reason enum + port types
 * so callers can import everything they need from
 * `./publish-content-product` (single canonical entry point,
 * mirrors the rename-content-page + reorder-content-pages
 * re-export pattern).
 *
 * The merged-binding form is used for
 * `PublishContentProductDenialReason` (it's BOTH a const and
 * a type alias under the same identifier — same TS2300
 * workaround documented in the prior PRs).
 */
export {
  PublishContentProductDenialReason, // value+type merged binding
} from "./publish-content-product-types";
export type {
  // type-only names
  PublishContentProductPort,
  PublishContentProductResult,
  PublishContentProductInput,
  PublishGateIssue,
  PublishGateIssueReason,
  PublishGatePageSummary,
  ProductPublishStatus,
} from "./publish-content-product-types";
