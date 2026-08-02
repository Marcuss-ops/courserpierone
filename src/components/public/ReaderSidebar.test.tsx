// @vitest-environment jsdom
/**
 * src/components/public/ReaderSidebar.test.tsx
 *
 * Smoke tests for the public reader's sidebar Server
 * Component. Pure rendering — verifies the tree builder
 * integration (via the shared `buildTree` utility) works
 * for the read-only surface.
 *
 * Coverage:
 *   - empty pages list shows the "nessuna pagina" empty state
 *   - flat pages list renders root rows
 *   - page with children renders both the parent row AND
 *     the children header
 *   - current-page row carries data-current="true" +
 *     aria-current="page"
 *   - non-current row carries data-current="false"
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReaderSidebar, type ReaderSidebarPageRow } from "./ReaderSidebar";

function page(
  id: string,
  parentId: string | null,
  position: number,
  extras: Partial<{ slug: string; title: string | null; status: "draft" | "published" | "archived" }>,
): ReaderSidebarPageRow {
  return {
    id,
    parentId,
    position,
    slug: extras.slug ?? id,
    title: extras.title ?? id,
    status: extras.status ?? "published",
  };
}

describe("ReaderSidebar — render", () => {
  it("empty list renders the empty state", () => {
    render(
      <ReaderSidebar
        productSlug="prod_x"
        locale="it"
        currentPageSlug="(none)"
        pages={[]}
      />,
    );
    expect(screen.getByText(/nessuna pagina pubblicata/i)).toBeTruthy();
  });

  it("renders flat root pages", () => {
    render(
      <ReaderSidebar
        productSlug="prod_x"
        locale="it"
        currentPageSlug="a"
        pages={[
          page("a", null, 1, { slug: "intro", title: "Intro" }),
          page("b", null, 2, { slug: "body", title: "Body" }),
        ]}
      />,
    );
    const rootList = screen.getByTestId("reader-sidebar-root-list");
    const rowIds = Array.from(rootList.querySelectorAll(":scope > li"))
      .map((n) => n.getAttribute("data-testid") ?? "");
    expect(rowIds).toEqual(["reader-sidebar-row-a", "reader-sidebar-row-b"]);
    const directChildren = rootList.querySelectorAll(":scope > li").length;
    expect(directChildren).toBe(2);
  });

  it("renders nested children under their parent row", () => {
    render(
      <ReaderSidebar
        productSlug="prod_x"
        locale="it"
        currentPageSlug="a"
        pages={[
          page("a", null, 1, { slug: "intro", title: "Intro" }),
          page("a-1", "a", 1, { slug: "sub-1", title: "Sub 1" }),
          page("a-2", "a", 2, { slug: "sub-2", title: "Sub 2" }),
        ]}
      />,
    );
    expect(screen.getByTestId("reader-sidebar-row-a-1")).toBeTruthy();
    expect(screen.getByTestId("reader-sidebar-row-a-2")).toBeTruthy();
    expect(screen.getByTestId("reader-sidebar-children-a")).toBeTruthy();
  });
});

describe("ReaderSidebar — current page highlight", () => {
  it("current row carries data-current='true' + aria-current='page'", () => {
    render(
      <ReaderSidebar
        productSlug="prod_x"
        locale="it"
        currentPageSlug="b"
        pages={[
          page("a", null, 1, { slug: "a", title: "A" }),
          page("b", null, 2, { slug: "b", title: "B" }),
        ]}
      />,
    );
    const current = screen.getByTestId("reader-sidebar-row-b");
    expect(current.getAttribute("data-current")).toBe("true");
    expect(
      screen
        .getByTestId("reader-sidebar-link-b")
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("non-current row carries data-current='false'", () => {
    render(
      <ReaderSidebar
        productSlug="prod_x"
        locale="it"
        currentPageSlug="a"
        pages={[
          page("a", null, 1, { slug: "a", title: "A" }),
          page("b", null, 2, { slug: "b", title: "B" }),
        ]}
      />,
    );
    const other = screen.getByTestId("reader-sidebar-row-b");
    expect(other.getAttribute("data-current")).toBe("false");
  });
});
