/**
 * src/app/(locale)/[locale]/products/[slug]/layout.tsx
 *
 * Server Component shell for the public reader surface
 * (MCR Phase 1 — Notion-like content pages).
 *
 * ─── Why this is a layout (NOT a page wrapper) ───────────
 *
 * The layout owns the chrome around every page in the
 * product (max-width container, padding, theme background).
 * The sidebar itself is rendered BY THE PAGE
 * (`[pageSlug]/page.tsx`) because it depends on the current
 * page slug — Next.js App Router preserves the LAYOUT across
 * child navigation, and the page-level sidebar re-renders
 * on every navigation at zero cost (server component).
 *
 * Layout-level state that could be hoisted here (e.g.
 * `resolvePublishedContent` once + `useMemo` over the children)
 * is intentionally NOT done for v1: the page re-runs the
 * fetch in 1 SQL roundtrip (the established use case is
 * idempotent and the index is gold), and a future PR can
 * hoist this into a `cache()` or `unstable_cache` call when
 * performance warrants.
 *
 * ─── Why the layout does NOT render the sidebar ─────────
 *
 * The sidebar's `currentPageSlug` prop is page-specific.
 * Putting the sidebar at the layout level would either:
 *   (a) Render a perpetually-empty-highlighted sidebar
 *       (broken), OR
 *   (b) Require a client-side mechanism to read the current
 *       slug from `useParams()` and update a context — adds
 *       state where it isn't needed.
 *
 * The clean v1 contract: LAYOUT = chrome + container, PAGE
 * = sidebar (with correct current page) + content + TOC.
 */

export interface ReaderLayoutProps {
  children: React.ReactNode;
}

export default function ReaderLayout({ children }: ReaderLayoutProps) {
  return (
    <div
      data-testid="reader-shell"
      className="min-h-screen bg-cream-bg text-cream-text dark:bg-cream-dark-bg dark:text-cream-dark-text"
    >
      <main
        data-reader-sticky-header="true"
        className="mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-10"
      >
        {children}
      </main>
    </div>
  );
}
