/**
 * src/domains/catalog/product-documents/prisma-resolve-product-document-repository.ts
 *
 * Prisma adapter for `ResolveProductDocumentPort` (MCR Phase 2).
 * Mirrors the pattern of `prisma-resolve-published-content-repository.ts`:
 *
 *   - The port contract is the published surface (Domain → Port).
 *     This file is the implementation (Prisma), wired in the
 *     composition root (route / data fetcher).
 *   - The adapter NEVER imports the use case; the use case imports
 *     the port ONLY. Bidirectionality would break ADR-0016 §1.
 *   - No business logic: locale chain construction, status filtering,
 *     `isFallback` computation, document narrowing → ALL live in the
 *     port contract + use case, NOT here. The adapter just reads.
 *
 * ─── Strategy: 2-Q sequential lookup ─────────────────────────────
 *
 * The adapter performs two Prisma calls:
 *
 *   (1) `prisma.product.findFirst({ where: { slug, status: "published" },
 *        select: { id, defaultLanguage } })` — the "no leak" gate.
 *        Returns null for both "no product" and "product not
 *        published" — port contract collapses both.
 *
 *   (2) For each locale in the chain `[requested, default]` (de-duped,
 *        in order), `prisma.productDocument.findFirst` — first match
 *        wins. Sequential 2-Q lookup is acceptable for the read path
 *        (most products have ONE document row, the default; the
 *        primary hop rarely matches without a deliberate locale
 *        request).
 *
 *   A single-query CTE with `array_position()` ORDER BY would be
 *   marginally faster but more brittle (raw SQL is hard to review,
 *   harder to mock at unit-test boundaries); out of scope for MVP.
 *
 * ─── Document narrowing (defensive read) ────────────────────────
 *
 * JSONB columns hydrate as `Prisma.JsonValue` (the broad union
 * `string | number | boolean | null | JsonObject | JsonArray`).
 * We narrow to `ContentDocumentV1` via `isContentDocumentV1`
 * (defined in `src/domains/catalog/blocks/document.ts`):
 *
 *   - `isContentDocumentV1(value)` returns `true` iff `value` is a
 *     valid `ContentDocumentV1` AND contains no free HTML.
 *   - On narrowing FAILURE → `document: null` (the use case
 *     collapses this to `not_found`). Same defensive posture as
 *     `prisma-resolve-published-content-repository`.
 *
 * `plainText` and `revision` are kept verbatim (the use case
 * surfaces them as-is, even when `document: null`). The use case
 * is the one that decides to collapse, not us.
 */

import type { PrismaClient } from "@prisma/client";

import { isContentDocumentV1 } from "@/domains/catalog/blocks/document";
import type {
  ProductDocumentRow,
  ResolveProductDocumentPort,
} from "./resolve-product-document-types";

/**
 * Adapter factory — takes the shared Prisma instance, returns
 * a port implementation. Composition root wires this in.
 *
 * No memoization here: the use case + port contract treat each
 * call as a fresh read; call-site caching (Next.js fetch cache,
 * Redis) is the route layer's responsibility.
 */
export function prismaResolveProductDocumentRepository(
  prisma: PrismaClient,
): ResolveProductDocumentPort {
  return {
    async findPublishedProductDocumentBySlug({ slug, requestedLocale }) {
      // ─── (1) Read the published product metadata ──────────────
      //
      // The `status: "published"` filter is baked into the SQL —
      // no need to call and then filter downstream. This is the
      // mechanical implementation of the no-info-leak collapse.
      const product = await prisma.product.findFirst({
        where: { slug, status: "published", deletedAt: null },
        select: { id: true, defaultLanguage: true },
      });
      if (!product) return null;

      // ─── (2) Build the locale chain ──────────────────────────
      //
      // Two-hop max:
      //   chain[0] = requestedLocale  (when defined)
      //   chain[1] = product.defaultLanguage
      //
      // When the requested locale equals the default, the chain
      // has ONE unique entry — de-duped below.
      const fallback = product.defaultLanguage;
      const primary = requestedLocale;
      const chain = primary && primary !== fallback
        ? [primary, fallback] as const
        : [fallback] as const;

      // ─── (3) Sequential findFirst on the chain ───────────────
      //
      // First match wins. The SELECT casts `document` through
      // `isContentDocumentV1` defensively — on narrowing failure,
      // `document` is `null` (the use case collapses).
      let row: ProductDocumentRow | null = null;
      let matchedLocale: string | null = null;

      for (const locale of chain) {
        const candidate = await prisma.productDocument.findFirst({
          where: { productId: product.id, locale },
          select: {
            id: true,
            productId: true,
            locale: true,
            document: true,
            plainText: true,
            revision: true,
          },
        });

        if (!candidate) {
          // This hop missed; try the next. NO early exit — keep
          // iterating until we exhaust the chain.
          continue;
        }

        // Narrow `document` to `ContentDocumentV1`. On failure,
        // we surface `document: null` here and `matchedLocale: null`
        // effectively (the use case collapses to not_found).
        const narrowedDocument = isContentDocumentV1(candidate.document)
          ? candidate.document
          : null;

        // If the document narrowed to null, we treat this hop as
        // a miss and continue the chain. This handles the rare
        // case where the locale hop matched BUT the JSON is
        // corrupted — we don't want the success branch to flow
        // through with a malformed document.
        if (narrowedDocument === null) {
          continue;
        }

        row = {
          id: candidate.id,
          productId: candidate.productId,
          locale: candidate.locale,
          document: narrowedDocument,
          plainText: candidate.plainText,
          revision: candidate.revision,
        };
        matchedLocale = candidate.locale;
        break;
      }

      return {
        productId: product.id,
        defaultLanguage: product.defaultLanguage,
        row,
        matchedLocale,
      };
    },
  };
}
