/**
 * src/app/(locale)/[locale]/products/[slug]/pages/[pageSlug]/page.tsx
 *
 * Public reader page (MCR Phase 1 — Notion-like content
 * pages feature). Renders a single published page with:
 *   - `ReaderContent` (blocks rendered via BLOCK_REGISTRY)
 *   - `TableOfContents` (derived from heading blocks)
 *   - `ReaderSidebar` (passed from the parent layout)
 *
 * ─── Data flow (per ADR-0016 §1) ────────────────────────────
 *   1. The parent layout (`[slug]/layout.tsx`) fetches
 *      `resolvePublishedContent({slug, locale})` ONCE.
 *   2. This page receives the resolved `pages` flat list
 *      via... wait; in this codebase the layout does NOT
 *      pass server data through React props (App Router
 *      layouts DELEGATE data fetching to children OR
 *      cache via `cache()`).
 *
 * ─── Choice: re-fetch OR cache ─────────────────────────────
 *   For v1 simplicity, this page re-fetches via
 *   `resolvePublishedContent(...)` directly. The use case
 *   is idempotent and the SQL is one roundtrip with an
 *   `@@index([productId, parentId, position])`. The
 *   duplication is bounded by 1 query per page navigation
 *   — acceptable for v1. Future PRs hoist the cache into
 *   `unstable_cache` (or Prisma's middleware) when needed.
 */

import { notFound } from "next/navigation";

import { TableOfContents } from "@/components/public/TableOfContents";
import { ReaderContent } from "@/components/public/ReaderContent";
import { ReaderSidebar } from "@/components/public/ReaderSidebar";
import { deriveToc } from "@/components/public/derive-toc";
import type { TocHeading } from "@/components/public/TableOfContents";
import { resolvePublishedContent } from "@/domains/catalog/content-pages/resolve-published-content";
import { prismaResolvePublishedContentRepository } from "@/domains/catalog/content-pages/prisma-resolve-published-content-repository";

// ─── Props ───────────────────────────────────────────────────

export interface ReaderPageProps {
  params: { locale: string; slug: string; pageSlug: string };
}

// ─── Server Component ──────────────────────────────────────

export default async function ReaderPage({ params }: ReaderPageProps) {
  // ─── Validate URL params ──────────────────────────────────
  // Same regexes as the public API + the layout.
  const LOCALE_TAG_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
  const PRODUCT_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
  const PAGE_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

  if (
    !LOCALE_TAG_PATTERN.test(params.locale) ||
    !PRODUCT_SLUG_PATTERN.test(params.slug) ||
    !PAGE_SLUG_PATTERN.test(params.pageSlug)
  ) {
    notFound();
  }

  // ─── Fetch + filter for the current page ─────────────────
  //
  // The use case returns the FULL list of published pages;
  // we filter to the one matching `pageSlug`. If the product
  // exists but the page is missing OR unpublished, we 404.
  // The use case's collapsed `not_found` already handles
  // "product unpublished" — but a published product with no
  // matching page is the new failure mode handled here.
  const result = await resolvePublishedContent(
    { slug: params.slug, locale: params.locale },
    { port: prismaResolvePublishedContentRepository },
  );

  if (!result.success) {
    notFound();
  }

  const currentPage = result.pages.find((p) => p.slug === params.pageSlug);
  if (!currentPage || currentPage.document === null) {
    // Page missing OR document null (corrupted/translation
    // missing) — both collapse to a public 404 to avoid
    // leaking the existence of an unpublished/orphan page.
    notFound();
  }

  // ─── Derive TOC ─────────────────────────────────────────
  //
  // Pure function. Server-rendered to avoid client-side
  // computation. Output is the array of `TocHeading`
  // rows that the `TableOfContents` Client Component
  // renders with smooth-scroll cursor behavior.
  const headings: TocHeading[] = deriveToc(currentPage.document);

  // ─── Sidebar data ──────────────────────────────────────
  //
  // Drop the document field from each page — the sidebar
  // doesn't render content bodies, just the navigation
  // surface. This keeps the SSR payload minimal.
  const sidebarPages = result.pages.map((p) => ({
    id: p.id,
    parentId: p.parentId,
    slug: p.slug,
    position: p.position,
    title: p.title,
  }));

  // ─── Render ────────────────────────────────────────────
  //
  // Layout (from `layout.tsx`)
  //   ┌────────────────────────────────────────────┐
  //   │ sidebar   │ header (sticky)                  │
  //   └────────────────────────────────────────────┘
  //
  // Page (this file)
  //   ┌────────────────────────────────────────────┐
  //   │ TOC (sticky, left column on desktop)        │
  //   │ ReaderContent (main column, right)          │
  //   └────────────────────────────────────────────┘

  return (
    <div
      data-testid="reader-page"
      data-product-slug={params.slug}
      data-locale={params.locale}
      data-page-slug={currentPage.slug}
      data-page-id={currentPage.id}
      data-is-fallback={currentPage.isFallback ? "true" : "false"}
    >
      <ReaderSidebar
        productSlug={params.slug}
        locale={params.locale}
        currentPageSlug={currentPage.slug}
        pages={sidebarPages}
      />
      <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_220px]">
        <div>
          {currentPage.isFallback && (
            <p
              data-testid="reader-fallback-notice"
              className="mb-6 rounded-md border border-cream-gold/40 bg-cream-gold/10 px-3 py-2 text-xs text-cream-espresso dark:bg-cream-dark-gold/10 dark:text-cream-dark-text"
              role="status"
            >
              La versione in {currentPage.resolvedLocale ?? "italiano"} è
              mostrata perché la traduzione richiesta non è ancora
              disponibile.
            </p>
          )}

          <header className="mb-8 border-b border-cream-border pb-6 dark:border-cream-dark-border">
            <h1
              data-testid="reader-page-title"
              className="font-serif text-3xl font-semibold tracking-tight text-cream-espresso dark:text-cream-dark-text"
            >
              {currentPage.title ?? currentPage.slug}
            </h1>
          </header>

          <ReaderContent document={currentPage.document} />
        </div>
        <aside className="md:sticky md:top-20 md:self-start">
          <TableOfContents
            headings={headings}
            stickyHeaderSelector="[data-reader-sticky-header]"
          />
        </aside>
      </div>
    </div>
  );
}
