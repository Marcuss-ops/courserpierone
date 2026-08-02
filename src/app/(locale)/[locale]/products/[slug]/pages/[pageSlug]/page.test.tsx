// @vitest-environment jsdom
/**
 * src/app/(locale)/[locale]/products/[slug]/pages/[pageSlug]/page.test.tsx
 *
 * Smoke test for the public reader page. Verifies the
 * page renders with:
 *   - data-testid="reader-page" root
 *   - page title from translation
 *   - sidebar present (current page highlighted)
 *   - TOC rendered when page has heading blocks
 *   - ReaderContent renders blocks
 *   - 404 (notFound) when pageSlug doesn't match any published page
 *
 * Mocks `resolvePublishedContent` via vi.mock to control
 * the data layer without a real DB connection. The
 * IntersectionObserver stub lives in the global
 * `vitest.setup.ts` (registered via `setupFiles`) so the
 * TOC's mount doesn't crash in jsdom — no per-test polyfill
 * noise here.
 */

// Mocks BEFORE component import.
const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
}));

vi.mock(
  "@/domains/catalog/content-pages/resolve-published-content",
  () => ({
    resolvePublishedContent: vi.fn(),
  }),
);

vi.mock(
  "@/domains/catalog/content-pages/prisma-resolve-published-content-repository",
  () => ({
    prismaResolvePublishedContentRepository: {},
  }),
);

// Mock the layout — vitest can't render the App Router
// layout chain from a unit test; render the page directly.
vi.mock("@/app/(locale)/[locale]/products/[slug]/layout.tsx", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Import AFTER mocks take effect.
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReaderPage from "@/app/(locale)/[locale]/products/[slug]/pages/[pageSlug]/page";
import { resolvePublishedContent } from "@/domains/catalog/content-pages/resolve-published-content";

// ─── Test fixtures ────────────────────────────────────────────

const VALID_DOC = {
  schemaVersion: 1 as const,
  blocks: [
    {
      id: "h-titolo",
      type: "heading" as const,
      props: { level: 1 as const },
      content: [{ type: "text" as const, text: "Titolo" }],
      position: 0,
    },
    {
      id: "p-body",
      type: "paragraph" as const,
      props: {},
      content: [{ type: "text" as const, text: "Contenuto del capitolo." }],
      position: 1,
    },
  ],
};

const PUBLISHED_PRODUCT = {
  id: "prod_1",
  slug: "product-slug",
  defaultLanguage: "it",
  publishedAt: new Date("2026-07-01T00:00:00.000Z"),
};

const PUBLISHED_PAGES = [
  {
    id: "page_1",
    parentId: null,
    slug: "intro",
    position: 1,
    title: "Introduzione",
    document: VALID_DOC,
    revision: 1,
    resolvedLocale: "it",
    publishedAt: new Date("2026-07-01T00:00:00.000Z"),
    isFallback: false,
  },
];

// ─── Mock reset ───────────────────────────────────────────────

beforeEach(() => {
  notFoundMock.mockClear();
  vi.mocked(resolvePublishedContent).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Happy path ───────────────────────────────────────────────

describe("ReaderPage — happy path", () => {
  it("renders the page chrome (testid, title, sidebar, TOC, content)", async () => {
    vi.mocked(resolvePublishedContent).mockResolvedValue({
      success: true,
      product: PUBLISHED_PRODUCT,
      pages: PUBLISHED_PAGES,
    });

    const jsx = await ReaderPage({
      params: { locale: "it", slug: "product-slug", pageSlug: "intro" },
    });
    render(jsx);

    expect(screen.getByTestId("reader-page")).toBeTruthy();
    expect(screen.getByTestId("reader-page-title").textContent).toBe(
      "Introduzione",
    );
    expect(screen.getByTestId("reader-sidebar")).toBeTruthy();
    expect(screen.getByTestId("reader-toc")).toBeTruthy();
    expect(screen.getByTestId("reader-content")).toBeTruthy();
  });

  it("highlights the matching page in the sidebar (current-page detection by slug)", async () => {
    vi.mocked(resolvePublishedContent).mockResolvedValue({
      success: true,
      product: PUBLISHED_PRODUCT,
      pages: PUBLISHED_PAGES,
    });
    const jsx = await ReaderPage({
      params: { locale: "it", slug: "product-slug", pageSlug: "intro" },
    });
    render(jsx);

    const current = screen.getByTestId("reader-sidebar-row-page_1");
    expect(current.getAttribute("data-current")).toBe("true");
  });

  it("renders TOC items when the page has heading blocks", async () => {
    vi.mocked(resolvePublishedContent).mockResolvedValue({
      success: true,
      product: PUBLISHED_PRODUCT,
      pages: PUBLISHED_PAGES,
    });
    const jsx = await ReaderPage({
      params: { locale: "it", slug: "product-slug", pageSlug: "intro" },
    });
    render(jsx);

    const tocLink = screen.getByTestId("reader-toc-link-h-titolo");
    expect(tocLink).toBeTruthy();
  });
});

// ─── 404 paths ────────────────────────────────────────────────

describe("ReaderPage — 404 paths", () => {
  it("calls notFound when the use case returns not_found (product unpublished)", async () => {
    vi.mocked(resolvePublishedContent).mockResolvedValue({
      success: false,
      reason: "not_found",
    });
    await expect(
      ReaderPage({
        params: { locale: "it", slug: "ghost", pageSlug: "intro" },
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("calls notFound when the pageSlug doesn't match any published page", async () => {
    vi.mocked(resolvePublishedContent).mockResolvedValue({
      success: true,
      product: PUBLISHED_PRODUCT,
      pages: PUBLISHED_PAGES,
    });
    await expect(
      ReaderPage({
        params: { locale: "it", slug: "product-slug", pageSlug: "ghost" },
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalledTimes(1);
  });

  it("calls notFound when the matched page has no document (translation missing)", async () => {
    vi.mocked(resolvePublishedContent).mockResolvedValue({
      success: true,
      product: PUBLISHED_PRODUCT,
      pages: [
        ...PUBLISHED_PAGES,
        {
          id: "page_no_doc",
          parentId: null,
          slug: "broken",
          position: 2,
          title: null,
          document: null,
          revision: null,
          resolvedLocale: null,
          publishedAt: null,
          isFallback: false,
        },
      ],
    });
    await expect(
      ReaderPage({
        params: { locale: "it", slug: "product-slug", pageSlug: "broken" },
      }),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("calls notFound when URL params are malformed", async () => {
    await expect(
      ReaderPage({
        params: { locale: "INVALID_LOCALE", slug: "x", pageSlug: "y" },
      }),
    ).rejects.toThrow("NOT_FOUND");
    expect(notFoundMock).toHaveBeenCalled();
  });
});
