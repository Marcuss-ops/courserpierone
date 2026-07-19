/**
 * src/domains/catalog/products/create-product-draft-types.ts
 *
 * Domain types + port contract for `CreateProductDraft` (MCR Phase 1 —
 * Notion-like pages feature, draft bootstrapper).
 *
 * ─── Architecture (per ADR-0016 §1 dep direction) ──────────────
 *
 * This file lives at the Domain layer. It declares:
 *   1. The use-case input shape (`CreateProductDraftInput`).
 *   2. The discriminated-union result (`CreateProductDraftResult`)
 *      — 4 exhaustive branches mirroring the watchlist pattern.
 *   3. The persistence port (`CreateProductDraftRepository`) —
 *      pure TypeScript interface; the Prisma adapter lives in a
 *      sibling file (this PR ships BOTH, unlike SaveContentDocument
 *      and CreateContentPage which deferred the adapter).
 *
 * ─── Why a 4-branch discriminated union ──────────────────────────
 *
 * The denials are typed returns, not AppError throws — same reason
 * as SaveContentDocument: the route's `apiErrorResponse` mapper
 * stays branchless on the happy path, and the editor UI gets
 * precise signals (e.g. "this slug is taken, pick another" without
 * string-matching on exception messages).
 *
 *   - `forbidden`       — actorId is empty (defensive; the route's
 *     `requireCreatorOrAdmin("create")` is the primary auth gate).
 *   - `invalid_slug`    — slug failed `contentSlugSchema` regex;
 *     `error` is the ZodError for form diagnostics.
 *   - `slug_taken`      — DB `@@unique` on Product.slug caught the
 *     collision (P2002 from Prisma). The DB is the SSOT for
 *     slug uniqueness — we don't pre-check (TOCTOU).
 *   - `success: true`   — returns the canonical `ProductDraftRecord`.
 *
 * ─── `creatorId` from session, NEVER from payload ─────────────────
 *
 * The Product schema has `creatorId String` (REQUIRED post-fase 4
 * hardening, ON DELETE RESTRICT). The user spec mandates that this
 * field comes from the SESSION, not the JSON body. Defense in depth:
 *
 *   - The TypeScript input shape does NOT include `creatorId`. The
 *     caller cannot forge one through the type system.
 *   - The route layer extracts `actorId` from `getServerUser()` and
 *     forwards it as a SEPARATE field on the use-case input.
 *   - The use case forwards `actorId` (NOT `input.slug.creatorId`
 *     or anything payload-derived) to the port's
 *     `createProductDraft` method.
 *   - The Prisma adapter writes `creatorId: actorId` on the Product
 *     row in the same SQL INSERT that sets the slug — single
 *     statement, no race window where a creator could be reassigned.
 *
 * If a future route forwards a `creatorId` from the request body,
 * the type system rejects the call site (TS2339). A defense-in-depth
 * `if (!actorId) return { reason: "forbidden" }` guard inside the
 * use case is belt-and-braces for an empty string.
 *
 * ─── `contentKind = "document_course"` is HARDCODED ───────────────
 *
 * This use case boots a Notion-like content tree. The contentKind
 * is fixed to `"document_course"` (one of the registered kinds in
 * `@/domains/catalog/content-type-registry`). Future use cases
 * (CreateProductDraftVideoCourse, etc.) are separate use cases
 * that hardcode their own kind string. The TypeScript input shape
 * has no `contentKind` field — the caller cannot request a
 * different kind via this entry point.
 *
 * ─── Prisma adapter constraint reasoning ──────────────────────────
 *
 * Slug uniqueness relies on `Product.slug @unique` (DB-level). The
 * adapter catches the resulting `Prisma.PrismaClientKnownRequestError`
 * with code `P2002` and translates it to `{ reason: "slug_taken" }`.
 * Single source of truth for uniqueness is the DB constraint — the
 * use case does NOT pre-check.
 */

import { z } from "zod";

// ─── Use case input ──────────────────────────────────────────────

/**
 * Input to the `createProductDraft` use case.
 *
 * Field-by-field:
 *   - `actorId`   — User.id from the authenticated session. Forwarded
 *     by the route layer from `getServerUser()` (NOT from the
 *     request body). Empty → typed `forbidden` denial. The Prisma
 *     adapter uses this value AS-IS as `Product.creatorId`.
 *   - `slug`      — Per-platform-unique slug. Validated via
 *     `contentSlugSchema` (lowercase alphanumeric + dashes, 3–64
 *     chars).
 *
 * NOT in the input (intentionally — type-system enforced):
 *   - `creatorId`       — derived from `actorId` (NEVER from payload).
 *   - `contentKind`     — hardcoded `"document_course"` in the use case.
 *   - `status`          — implicit `"draft"` (matches DB default).
 *   - `templateId`      — DB default `"lumio"`.
 *   - `defaultLanguage` — DB default `"it"`.
 *   - `price`           — DB default `0`.
 *   - `currency`        — DB default `"eur"`.
 *   - `coverUrl`        — DB default `null`.
 *   - `lemonVariantId`  — DB default `null`.
 *
 * Adding optional fields above is a future-PR concern; v1 keeps the
 * surface minimal — bootstrapper returns a scaffold that subsequent
 * use cases (UpdateProductDraft, CreateTranslation) populate.
 */
export interface CreateProductDraftInput {
  actorId: string;
  slug: string;
}

// ─── Discriminated union result ──────────────────────────────────

/**
 * Four exhaustive outcomes:
 *   - `success: true`       — scaffolded; the returned
 *     `product: ProductDraftRecord` carries the SERVER-ASSIGNED
 *     `id`, the GIVEN `slug`, the SESSION-DERIVED `creatorId`, and
 *     the HARDCODED `contentKind = "document_course"`.
 *   - `success: false` (3 denial branches)
 *     - `forbidden`        — actorId empty (defensive).
 *     - `invalid_slug`     — slug failed Zod regex; `error` is the
 *       ZodError for the form to highlight.
 *     - `slug_taken`       — DB `@@unique` on Product.slug caught
 *       the collision; the adapter surfaces P2002 as this reason.
 */
export type CreateProductDraftResult =
  | { success: true; product: ProductDraftRecord }
  | { success: false; reason: "forbidden" }
  | { success: false; reason: "invalid_slug"; error: z.ZodError }
  | { success: false; reason: "slug_taken" };

/**
 * Stable string union of denial reasons — mirrors the
 * `SaveContentDocumentDenialReason` / `CreateContentPageDenialReason`
 * pattern. Callers SHOULD compare via the typed `reason` field.
 */
export const CreateProductDraftDenialReason = {
  Forbidden: "forbidden",
  InvalidSlug: "invalid_slug",
  SlugTaken: "slug_taken",
} as const;

export type CreateProductDraftDenialReason =
  (typeof CreateProductDraftDenialReason)[keyof typeof CreateProductDraftDenialReason];

// ─── Product record (return shape on success) ─────────────────────

/**
 * Canonical read-shape returned by the port on a successful
 * bootstrapper. Mirrors the `Product` Prisma model — the route
 * can hand the response straight back to the client.
 *
 * `contentKind` is included so the UI can branch on it without a
 * separate fetch (caller-side dynamic dispatch).
 */
export interface ProductDraftRecord {
  id: string;
  slug: string;
  creatorId: string;
  contentKind: string;
  status: string;
  defaultLanguage: string;
  price: number;
  currency: string;
  coverUrl: string | null;
  templateId: string;
  lemonVariantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Port contract ───────────────────────────────────────────────

/**
 * Persistence port for the product-draft bootstrapper.
 *
 * One method:
 *   1. `createProductDraft` — atomic write with the SESSION-DERIVED
 *      `actorId` as `creatorId`, HARDCODED `contentKind = "document_course"`,
 *      and `@@unique`-enforced slug uniqueness. The adapter is
 *      responsible for:
 *        - Setting `creatorId = actorId` (NEVER from payload — the
 *          port contract doesn't expose `creatorId` as an input
 *          field, only `actorId` which it renames internally).
 *        - Catching P2002 from the slug unique constraint and
 *          returning `{ created: false, reason: "slug_taken" }`.
 *        - Setting `status = "draft"`, `contentKind = "document_course"`
 *          as part of the single SQL INSERT.
 *
 * The dependency direction (Domain → Port) matches ADR-0016 §1;
 * the Prisma adapter lives in a sibling file and is registered
 * by the route's composition root.
 */
export interface CreateProductDraftRepository {
  createProductDraft(input: {
    actorId: string;
    slug: string;
  }): Promise<
    | { created: true; product: ProductDraftRecord }
    | { created: false; reason: "slug_taken" }
  >;
}

/**
 * Hardcoded contentKind for this entry point. Exposed as a constant
 * (not a parameter) to make the intent explicit at call sites and
 * for grep-ability. The Prisma adapter writes this verbatim into
 * `Product.contentKind`.
 */
export const PRODUCT_DRAFT_CONTENT_KIND = "document_course" as const;
