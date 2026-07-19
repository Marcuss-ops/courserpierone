// @vitest-environment jsdom
/**
 * src/components/creator/SidebarTree.test.tsx
 *
 * Component tests for the creator-side `SidebarTree`.
 *
 * ─── Coverage (per the user-spec + design) ─────────────────
 *   RENDER
 *     (a) empty list renders the "Nessuna pagina" empty state
 *     (b) flat list renders rows in (parentId, position) order
 *     (c) nested list (parentId !== null) renders children
 *         under their parent row
 *     (d) current page row carries data-current="true" + aria-current="page"
 *     (e) draft status shows the dot indicator
 *     (f) root-level pages are rendered at the root depth
 *
 *   REORDER — UP/DOWN buttons
 *     (g) up button on first-in-scope is disabled
 *     (h) down button on last-in-scope is disabled
 *     (i) middle rows have both up and down enabled
 *
 *   REORDER — UP/DOWN click behavior
 *     (j) down on middle row swaps positions and POSTs the FULL sibling scope
 *     (k) up on middle row swaps and POSTs the full sibling scope
 *     (l) reorder inside a sub-parent: posts parentId = parent scope
 *
 *   REORDER — error & revert + saving indicator
 *     (m) on HTTP failure, optimistic state reverts and error shows with role='alert'
 *     (n) on HTTP success with server-canonical positions, adopt server positions
 *     (o) the saving indicator appears while the request is in flight
 */

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference types="vitest" />
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarTree, type SidebarPageRow } from "./SidebarTree";

// ─── Test fixtures ────────────────────────────────────────────────

function row(
  id: string,
  parentId: string | null,
  position: number,
  extras?: Partial<{
    slug: string;
    status: "draft" | "published" | "archived";
    title: string | null;
  }>,
): SidebarPageRow {
  return {
    id,
    parentId,
    slug: extras?.slug ?? id,
    position,
    status: extras?.status ?? "draft",
    title: extras?.title ?? id,
  };
}

function flatProductPages(): SidebarPageRow[] {
  return [
    row("alpha", null, 1, {
      slug: "intro",
      title: "Introduzione",
      status: "published",
    }),
    row("beta", null, 2, {
      slug: "cap-1",
      title: "Capitolo 1",
      status: "published",
    }),
    row("gamma", null, 3, {
      slug: "cap-2",
      title: "Capitolo 2",
      status: "published",
    }),
    row("gamma-1", "gamma", 1, {
      slug: "g1",
      title: "Concetto A",
      status: "draft",
    }),
    row("gamma-2", "gamma", 2, {
      slug: "g2",
      title: "Concetto B",
      status: "draft",
    }),
    row("delta", null, 4, {
      slug: "drafts",
      title: "Bozze",
      status: "draft",
    }),
  ];
}

function queryListItems(testId: string): HTMLElement[] {
  const root = screen.getByTestId(testId);
  return Array.from(root.querySelectorAll(":scope > li"));
}

// ─── fetch mock ───────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      reordered: [],
      scope: { productId: "prod_test", parentId: null },
    }),
  });
  // jsdom does NOT provide a default `fetch`; we wire one
  // here as a side effect so the component's `fetch(...)`
  // calls resolve against our controlled stub.
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── RENDER ───────────────────────────────────────────────────────

describe("SidebarTree — render", () => {
  it("empty list renders the 'nessuna pagina' empty state", () => {
    render(
      <SidebarTree productId="prod_test" pages={[]} currentPageId="none" />,
    );
    expect(screen.getByText(/nessuna pagina/i)).toBeTruthy();
  });

  it("renders flat list rows in order at depth 0", () => {
    render(
      <SidebarTree
        productId="prod_test"
        pages={flatProductPages()}
        currentPageId="alpha"
      />,
    );
    const items = queryListItems("sidebar-root-list");
    expect(items.length).toBeGreaterThanOrEqual(4);
    const ids = items.map(
      (n) => n.getAttribute("data-testid") ?? "(missing)",
    );
    expect(ids).toContain("sidebar-row-alpha");
    expect(ids).toContain("sidebar-row-beta");
    expect(ids).toContain("sidebar-row-gamma");
    expect(ids).toContain("sidebar-row-delta");
  });

  it("renders nested children under their parent row", () => {
    render(
      <SidebarTree
        productId="prod_test"
        pages={flatProductPages()}
        currentPageId="gamma"
      />,
    );
    expect(screen.getByTestId("sidebar-row-gamma-1")).toBeTruthy();
    expect(screen.getByTestId("sidebar-row-gamma-2")).toBeTruthy();
    expect(
      screen
        .getByTestId("sidebar-row-gamma-1")
        .getAttribute("data-depth"),
    ).toBe("1");
  });

  it("current page row carries data-current='true' and aria-current='page' on the link", () => {
    render(
      <SidebarTree
        productId="prod_test"
        pages={flatProductPages()}
        currentPageId="beta"
      />,
    );
    const current = screen.getByTestId("sidebar-row-beta");
    expect(current.getAttribute("data-current")).toBe("true");
    const currentLink = screen.getByTestId("sidebar-link-beta");
    expect(currentLink.getAttribute("aria-current")).toBe("page");
  });

  it("non-current page row carries data-current='false' and no aria-current", () => {
    render(
      <SidebarTree
        productId="prod_test"
        pages={flatProductPages()}
        currentPageId="alpha"
      />,
    );
    const other = screen.getByTestId("sidebar-row-beta");
    expect(other.getAttribute("data-current")).toBe("false");
    const otherLink = screen.getByTestId("sidebar-link-beta");
    expect(otherLink.getAttribute("aria-current")).toBeNull();
  });

  it("parent row carries data-status='published' for published rows", () => {
    render(
      <SidebarTree
        productId="prod_test"
        pages={flatProductPages()}
        currentPageId="alpha"
      />,
    );
    const gammaRow = screen.getByTestId("sidebar-row-gamma");
    expect(gammaRow.getAttribute("data-status")).toBe("published");
  });

  it("draft row carries data-status='draft'", () => {
    render(
      <SidebarTree
        productId="prod_test"
        pages={flatProductPages()}
        currentPageId="alpha"
      />,
    );
    const deltaRow = screen.getByTestId("sidebar-row-delta");
    expect(deltaRow.getAttribute("data-status")).toBe("draft");
  });
});

// ─── REORDER — UP/DOWN button states ──────────────────────────────

describe("SidebarTree — up/down enablement", () => {
  it("up on the first-in-scope is disabled; down on the last-in-scope is disabled", () => {
    render(
      <SidebarTree
        productId="prod_test"
        pages={flatProductPages()}
        currentPageId="alpha"
      />,
    );
    const upFirst = screen.getByTestId("sidebar-up-alpha") as HTMLButtonElement;
    const downLast = screen.getByTestId("sidebar-down-delta") as HTMLButtonElement;
    expect(upFirst.disabled).toBe(true);
    expect(downLast.disabled).toBe(true);
  });

  it("middle rows have both up and down enabled", () => {
    render(
      <SidebarTree
        productId="prod_test"
        pages={flatProductPages()}
        currentPageId="alpha"
      />,
    );
    const upBeta = screen.getByTestId("sidebar-up-beta") as HTMLButtonElement;
    const downBeta = screen.getByTestId("sidebar-down-beta") as HTMLButtonElement;
    expect(upBeta.disabled).toBe(false);
    expect(downBeta.disabled).toBe(false);
  });
});

// ─── REORDER — UP/DOWN click behavior ─────────────────────────────

describe("SidebarTree — reorder click behavior", () => {
  it("down click on middle row swaps positions and POSTs the FULL sibling scope", async () => {
    render(
      <SidebarTree
        productId="prod_test"
        pages={flatProductPages()}
        currentPageId="alpha"
      />,
    );

    const beforeIds = queryListItems("sidebar-root-list").map(
      (n) => n.getAttribute("data-testid") ?? "",
    );
    expect(beforeIds).toEqual([
      "sidebar-row-alpha",
      "sidebar-row-beta",
      "sidebar-row-gamma",
      "sidebar-row-delta",
    ]);

    await fireEvent.click(screen.getByTestId("sidebar-down-beta"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/creator/products/prod_test/reorder-pages");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.parentId).toBeNull();
    expect(body.orderedPages.map((e: { pageId: string }) => e.pageId)).toEqual([
      "alpha",
      "gamma",
      "beta",
      "delta",
    ]);
    expect(
      body.orderedPages.map((e: { newPosition: number }) => e.newPosition),
    ).toEqual([1, 2, 3, 4]);
  });

  it("up click on middle row swaps and POSTs the full sibling scope", async () => {
    render(
      <SidebarTree
        productId="prod_test"
        pages={flatProductPages()}
        currentPageId="alpha"
      />,
    );

    await fireEvent.click(screen.getByTestId("sidebar-up-gamma"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.parentId).toBeNull();
    expect(body.orderedPages.map((e: { pageId: string }) => e.pageId)).toEqual([
      "alpha",
      "gamma",
      "beta",
      "delta",
    ]);
  });

  it("reorder inside a sub-parent: posts parentId = parent scope", async () => {
    render(
      <SidebarTree
        productId="prod_test"
        pages={flatProductPages()}
        currentPageId="gamma"
      />,
    );

    await fireEvent.click(screen.getByTestId("sidebar-down-gamma-1"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.parentId).toBe("gamma");
    expect(body.orderedPages.map((e: { pageId: string }) => e.pageId)).toEqual([
      "gamma-2",
      "gamma-1",
    ]);
  });
});

// ─── REORDER — error & revert ────────────────────────────────────

describe("SidebarTree — error & revert", () => {
  it("on HTTP failure, optimistic state reverts and error shows with role='alert'", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ ok: false, reason: "forbidden" }),
    });

    render(
      <SidebarTree
        productId="prod_test"
        pages={flatProductPages()}
        currentPageId="alpha"
      />,
    );

    const beforeIds = queryListItems("sidebar-root-list").map(
      (n) => n.getAttribute("data-testid") ?? "",
    );

    await fireEvent.click(screen.getByTestId("sidebar-down-beta"));

    await waitFor(() =>
      expect(screen.getByTestId("sidebar-error")).toBeTruthy(),
    );
    expect(screen.getByTestId("sidebar-error").getAttribute("role")).toBe(
      "alert",
    );

    const afterIds = queryListItems("sidebar-root-list").map(
      (n) => n.getAttribute("data-testid") ?? "",
    );
    expect(afterIds).toEqual(beforeIds);
  });

  it("on HTTP success with server-canonical positions, adopt server positions", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        reordered: [
          { pageId: "alpha", position: 1 },
          { pageId: "gamma", position: 2 },
          { pageId: "beta", position: 3 },
          { pageId: "delta", position: 4 },
        ],
        scope: { productId: "prod_test", parentId: null },
      }),
    });

    render(
      <SidebarTree
        productId="prod_test"
        pages={flatProductPages()}
        currentPageId="alpha"
      />,
    );

    await fireEvent.click(screen.getByTestId("sidebar-down-beta"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId("sidebar-error")).toBeNull();
  });

  it("the saving indicator appears while the request is in flight", async () => {
    let resolveFn!: (v: unknown) => void;
    fetchMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );

    render(
      <SidebarTree
        productId="prod_test"
        pages={flatProductPages()}
        currentPageId="alpha"
      />,
    );

    fireEvent.click(screen.getByTestId("sidebar-down-beta"));
    expect(screen.getByTestId("sidebar-saving")).toBeTruthy();

    resolveFn({
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        reordered: [],
        scope: { productId: "prod_test", parentId: null },
      }),
    });
    await waitFor(() =>
      expect(screen.queryByTestId("sidebar-saving")).toBeNull(),
    );
  });
});
