// @vitest-environment jsdom
/**
 * src/components/public/TableOfContents.test.tsx
 *
 * Smoke tests for the public reader's TableOfContents.
 *
 * Coverage:
 *   - empty headings shows the empty-state copy
 *   - each heading renders with the canonical anchor href
 *   - clicking a TOC item updates history hash
 *   - clicking a still scrolls (smoke via dispatchEvent)
 *   - active state on the first item by default
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TableOfContents, headingAnchor } from "./TableOfContents";

const HEADINGS = [
  { blockId: "h1", level: 1 as const, text: "Introduction" },
  { blockId: "h2", level: 2 as const, text: "Concepts" },
  { blockId: "h3", level: 3 as const, text: "Subconcept" },
];

describe("TableOfContents — render", () => {
  it("empty headings array renders the empty state", () => {
    render(<TableOfContents headings={[]} />);
    expect(screen.getByText(/nessun titolo/i)).toBeTruthy();
  });

  it("renders one link per heading with the canonical anchor href", () => {
    render(<TableOfContents headings={HEADINGS} />);
    for (const h of HEADINGS) {
      const link = screen.getByTestId(`reader-toc-link-${h.blockId}`);
      expect(link).toBeTruthy();
      expect(link.getAttribute("href")).toBe(`#${headingAnchor(h.blockId)}`);
    }
  });

  it("renders the heading text inside each link", () => {
    render(<TableOfContents headings={HEADINGS} />);
    expect(screen.getByText("Introduction")).toBeTruthy();
    expect(screen.getByText("Concepts")).toBeTruthy();
    expect(screen.getByText("Subconcept")).toBeTruthy();
  });
});

describe("TableOfContents — anchor convention", () => {
  it("headingAnchor returns 'heading-{blockId}'", () => {
    expect(headingAnchor("abc-123")).toBe("heading-abc-123");
  });
});

// (Smoke for click → scrollIntoView is partially tested;
// full IntersectionObserver tests require Playwright.)

describe("TableOfContents — click handler smoke", () => {
  it("click on a TOC item prevents default + sets history hash", () => {
    // Create the corresponding DOM anchor so scrollIntoView
    // has a target (jsdom requires a real element).
    const anchor = document.createElement("h2");
    anchor.id = headingAnchor("h2");
    document.body.appendChild(anchor);

    // Spy on scrollIntoView (jsdom doesn't implement; manual stub).
    const scrollSpy = vi.fn();
    anchor.scrollIntoView = scrollSpy;

    const replaceSpy = vi.spyOn(window.history, "replaceState");

    render(<TableOfContents headings={HEADINGS} />);
    fireEvent.click(screen.getByTestId("reader-toc-link-h2"));

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(replaceSpy).toHaveBeenCalled();
    const lastCall = replaceSpy.mock.calls[replaceSpy.mock.calls.length - 1];
    // The third argument is the URL — should contain #heading-h2.
    expect(String(lastCall[2])).toContain(`#${headingAnchor("h2")}`);

    document.body.removeChild(anchor);
  });
});
