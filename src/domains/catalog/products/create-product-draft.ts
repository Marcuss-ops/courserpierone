/**
 * src/domains/catalog/products/create-product-draft.ts
 *
 * Pure use case — ONE canonical entry point for "bootstrap a new
 * Product draft with the document_course contentKind".
 *
 * ─── MCR Phase 1 — Notion-like pages feature, draft bootstrapper ─
 *
 * Orchestrates (in this exact order):
 *   1. GUARD       — defensive check that `actorId` is non-empty.
 *      Empty → typed `forbidden` denial (the route's
 *      `requireCreatorOrAdmin("create")` is the primary auth gate;
 *      this is belt-and-braces for an empty-string caller).
 *   2. PARSE       — validate `input.slug` against `contentSlugSchema`
 *      (lowercase alphanumeric + dashes, 3–64 chars). Invalid →
 *      typed `invalid_slug` denial carrying the ZodError.
 *   3. PERSIST     — delegate to `CreateProductDraftRepository.
 *      createProductDraft`. The adapter is responsible for:
 *        - Setting `creatorId = actorId` (NEVER from payload — the
 *          port contract types `actorId` separately so the adapter
 *          has no opportunity to misread it as a payload field).
 *        - Hardcoding `contentKind = "document_course"` and
 *          `status = "draft"` in the same SQL INSERT.
 *        - Catching P2002 from `@@unique` on Product.slug and
 *          returning `{ created: false, reason: "slug_taken" }`.
 *   4. RETURN      — translate the port's `created | !created` to
 *      the 4-branch domain discriminated union.
 *
 * ─── Why pure (no Prisma import) ─────────────────────────────────
 *
 * ADR-0016 §1 dep direction:
 *   - This file: Domain layer (use case). NO `@prisma/client` import.
 *   - Persistence goes through `CreateProductDraftRepository`
 *     (port, declared in `./create-product-draft-types`).
 *   - The Prisma adapter lives in a sibling file
 *     (`./prisma-create-product-draft-repository`) — shipped in
 *     this same PR per user spec ("repository port + adapter Prisma"),
 *     unlike the deferred-adapter pattern used for SaveContentDocument
 *     and CreateContentPage.
 *
 * Test stub: `tests/create-product-draft.test.ts` builds an
 * in-memory implementation of the port (no Prisma mock).
 *
 * ─── Why a 4-branch discriminated union ─────────────────────────
 *
 * Smaller than CreateContentPage (7 branches) because there are
 * fewer concerns: slug validation + uniqueness + actorId guard.
 * The route layers above can map:
 *   - `forbidden`     → 403 (defensive — primary gate is route-level)
 *   - `invalid_slug`  → 400 with ZodError issues for the form
 *   - `slug_taken`    → 409 with a "pick a different slug" toast
 *   - `success: true` → 201 with the ProductDraftRecord
 *
 * ─── `creatorId` from session (the spec's hard requirement) ──────
 *
 * The user spec is explicit: `creatorId` MUST come from the session,
 * NEVER from the payload. Three layers of enforcement:
 *   1. **Type system**: `CreateProductDraftInput` has NO `creatorId`
 *      field. The route cannot pass one through.
 *   2. **Use case forwarding**: this file forwards `actorId` to the
 *      port, and the port's input shape is
 *      `{ actorId, slug }` — same enforcement.
 *   3. **Prisma adapter field mapping**: `data: { creatorId: actorId,
 *      ... }` is the literal SQL column, sourced from the renamed
 *      `actorId` parameter. Not derived from any payload field.
 *
 * This is defense-in-depth: even if a future maintainer re-orders
 * the input shape, the type system rejects `creatorId` in the input.
 *
 * ─── `contentKind = "document_course"` is constant (not input) ────
 *
 * This use case is the BOOTSTRAPPER for the Notion-like content
 * tree. The contentKind is fixed to `"document_course"` per the
 * spec. Future use cases (`CreateVideoCourseDraft`, etc.) hardcode
 * their own kinds in separate functions. The constant
 * `PRODUCT_DRAFT_CONTENT_KIND` is exported from the types file for
 * grep-ability — the Prisma adapter writes this verbatim.
 */

import { z } from "zod";

import { contentSlugSchema } from "@/domains/catalog/content-type-registry";

import {
  type CreateProductDraftInput,
  type CreateProductDraftRepository,
  type CreateProductDraftResult,
} from "./create-product-draft-types";

/**
 * Dependency injection contract. The use case NEVER imports the
 * Prisma adapter directly; the route composition root wires it.
 *
 * `repo` is the only required dep in this PR.
 */
export interface CreateProductDraftDeps {
  repo: CreateProductDraftRepository;
}

/**
 * Bootstrap a new Product draft.
 *
 * Returns the discriminated-union outcome. Never throws on soft
 * validation / actorId-guard / slug-uniqueness failures (caller
 * matches on the `success` boolean + `reason` literal).
 *
 * Concurrency / uniqueness contract:
 *   - The DB `@@unique` on Product.slug is the SSOT for slug
 *     uniqueness. The adapter catches P2002 and returns
 *     `slug_taken`. No TOCTOU pre-check in the use case.
 *
 * `creatorId` contract:
 *   - The route layer MUST extract `actorId` from `getServerUser()`
 *     and forward it. A request-body `creatorId` field is ignored
 *     (it's not in the input shape at all — TS rejects it).
 *   - Empty `actorId` triggers the `forbidden` defensive guard.
 *
 * Error surface (NEVER thrown from soft branches):
 *   - `forbidden`    — actorId empty (route-level role gate is the
 *     primary defense; this guard is belt-and-braces).
 *   - `invalid_slug` — slug failed Zod schema; `error` is the
 *     ZodError for form-level diagnostics.
 *   - `slug_taken`   — DB unique-constraint violation surfaced as
 *     P2002 from the adapter.
 */
export async function createProductDraft(
  input: CreateProductDraftInput,
  deps: CreateProductDraftDeps,
): Promise<CreateProductDraftResult> {
  // ─── 1. GUARD — defensive actorId check (the route is the real gate)
  //
  // The route layer's `requireCreatorOrAdmin("create")` is the
  // primary auth gate. If somehow a caller (cron replay, queue
  // worker, future GraphQL/RPC) reaches this use case without an
  // actorId, we refuse to forge one from the payload — we just deny.
  // This is the EMPTY-STRING case (the route can never produce a
  // missing-but-non-empty actorId); null/undefined would have been
  // caught at the type system already.
  if (!input.actorId) {
    return { success: false, reason: "forbidden" };
  }

  // ─── 2. PARSE — validate slug against Zod ──────────────────────
  //
  // Use the SAFE variant so we return a typed denial branch instead
  // of throwing through the route's error boundary.
  const slugResult = contentSlugSchema.safeParse(input.slug);
  if (!slugResult.success) {
    return {
      success: false,
      reason: "invalid_slug",
      error: new z.ZodError(slugResult.error.issues),
    };
  }

  // ─── 3. PERSIST — atomic create with creatorId from session ────
  //
  // The adapter is responsible for:
  //   (a) writing `creatorId: actorId` to the DB row — NO derivation
  //       from any payload field; the port contract types `actorId`
  //       as the only "identity" field on the input
  //   (b) hardcoding `contentKind = "document_course"` and
  //       `status = "draft"` in the same SQL INSERT
  //   (c) catching P2002 from @@unique(slug) → slug_taken
  //
  // NOTE on the `actorId` field name in this call: it matches the
  // input shape parameter. Inside the adapter, this value is
  // assigned to `Product.creatorId`. The renaming happens INSIDE
  // the adapter, NOT in this use case — `actorId` is the canonical
  // use-case-layer name (matches SaveContentDocument / CreateContentPage).
  const portResult = await deps.repo.createProductDraft({
    actorId: input.actorId,
    slug: slugResult.data,
  });

  // ─── 4. RETURN — translate port outcome to domain result ──────
  if (!portResult.created) {
    return { success: false, reason: "slug_taken" };
  }

  return { success: true, product: portResult.product };
}

/**
 * Re-export the discriminated union + reason enum so callers can
 * import everything they need from `./create-product-draft`
 * (single canonical entry point, mirrors the save-content-document
 * + create-content-page re-export pattern).
 *
 * The merged-binding form is used for `CreateProductDraftDenialReason`
 * (it's BOTH a const and a type alias under the same identifier).
 */
export {
  CreateProductDraftDenialReason, // re-exports value + type (merged binding)
} from "./create-product-draft-types";
export type {
  // type-only names
  CreateProductDraftInput,
  CreateProductDraftRepository,
  CreateProductDraftResult,
  ProductDraftRecord,
} from "./create-product-draft-types";

/**
 * Re-export the contentKind constant for grep-ability at call
 * sites. The Prisma adapter uses this verbatim; tests can assert
 * on it without re-typing the string.
 */
export { PRODUCT_DRAFT_CONTENT_KIND } from "./create-product-draft-types";
