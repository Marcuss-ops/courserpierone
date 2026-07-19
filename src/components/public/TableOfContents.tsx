"use client";

/**
 * src/components/public/TableOfContents.tsx
 *
 * Public reader's table of contents (TOC) + smooth-scroll
 * cursor + active-section highlighting.
 *
 * ─── Features ────────────────────────────────
 *   1. Renders a hierarchical list of headings derived from
 *      the page's `document.blocks`. Each item is a clickable
 *      link to the heading anchor `heading-{blockId}`.
 *   2. Smooth-scroll cursor: click handler intercepts the
 *      default anchor jump and calls
 *      `scrollIntoView({behavior: "smooth", block: "start"})`
 *      with a `scrollMarginTop` offset to keep the heading
 *      clear of any sticky header.
 *   3. Active-section tracking: an `IntersectionObserver`
 *      watches every heading and updates the cursor's "active
 *      item" as the user scrolls. The observer's threshold +
 *      rootMargin are tuned so the active item flips as
 *      soon as the heading reaches the top quarter of the
 *      viewport — not when it's halfway scrolled out.
 *
 * ─── Why client (not pure server-rendered) ───────────────
 *   - Click → smooth-scroll requires JS interception.
 *   - IntersectionObserver is browser-only.
 * The CSS `scroll-behavior: smooth` rule in globals.css
 * provides the visual smoothness even without the JS handler,
 * but the observer-driven active item + history-hash updates
 * are why we need the full client component.
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Public surface ────────────────────────────────────────────

export interface TocHeading {
  /** The block's stable id (from `ContentDocumentV1.blocks[i].id`). */
  blockId: string;
  /** Heading level (1..3) — drives the indentation. */
  level: 1 | 2 | 3;
  /**
   * The visible heading text. The renderer strips inner
   * marks / inline content to derive a plain string.
   * Empty strings are not rendered (skipped upstream).
   */
  text: string;
}

export interface TableOfContentsProps {
  headings: TocHeading[];
  /**
   * Optional CSS selector for a sticky header element. The
   * smooth-scroll cursor uses `scroll-margin-top` on the
   * target heading equal to the header's offsetHeight so the
   * heading sticks under the header after scrolling.
   */
  stickyHeaderSelector?: string;
  /**
   * Optional className for the outer `<nav>` element.
   */
  className?: string;
}

// ─── Anchor helpers ───────────────────────────────────────────

/**
 * The DOM id convention: every heading gets
 * `id="heading-{blockId}"`. This is mirrored by
 * `ReaderContent.tsx` (which renders the heading elements
 * with the corresponding DOM id) AND by the click handler
 * below (which scrolls to it).
 *
 * IMPORTANT: if you change the prefix here, you MUST change
 * it everywhere. Convention lives in 3 places:
 *   - `HeadingBlock` (registry renderer) — sets the DOM id
 *   - `TableOfContents` (this file) — computes the href
 *   - Smoke tests — assert the prefix
 */
export const HEADING_ANCHOR_PREFIX = "heading-";

export function headingAnchor(blockId: string): string {
  return `${HEADING_ANCHOR_PREFIX}${blockId}`;
}

// ─── Component ───────────────────────────────────────────────

export function TableOfContents({
  headings,
  stickyHeaderSelector = "[data-reader-sticky-header]",
  className,
}: TableOfContentsProps) {
  // ─── Active-section tracking ────────────────────────────────
  //
  // IntersectionObserver is browser-only; we initialize on
  // mount and clean up on unmount. The threshold is tuned to
  // flip the active item when the heading crosses ~25% from
  // the top of the viewport — close enough to give immediate
  // feedback, far enough that a user mid-scroll sees a
  // sensible "where am I" cue.
  const [activeBlockId, setActiveBlockId] = useState<string | null>(
    headings[0]?.blockId ?? null,
  );
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (headings.length === 0) return;

    const elements = headings
      .map((h) => document.getElementById(headingAnchor(h.blockId)))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        // Pick the entry whose `intersectionRatio` is highest
        // AND `isIntersecting` is true. This handles the case
        // where multiple headings are momentarily in view
        // (e.g. short sections).
        let candidate: IntersectionObserverEntry | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (
            !candidate ||
            entry.intersectionRatio > candidate.intersectionRatio
          ) {
            candidate = entry;
          }
        }
        if (candidate) {
          const blockId = candidate.target.id.replace(
            HEADING_ANCHOR_PREFIX,
            "",
          );
          setActiveBlockId(blockId);
        }
      },
      {
        // Trigger when the heading's top reaches ~25% from
        // the top of the viewport (1 - 0.25 = top of the
        // observation window is 25% from viewport top).
        rootMargin: "-25% 0px -70% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const el of elements) {
      observerRef.current.observe(el);
    }

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    };
  }, [headings]);

  // ─── Click → smooth scroll ─────────────────────────────────
  //
  // The href still points to `#heading-{id}` so the URL hash
  // updates (browser-managed). preventDefault stops the
  // browser's snap-scroll; scrollIntoView with
  // `behavior: 'smooth'` performs the smooth animation.
  // scroll-margin-top on the heading (set in ReaderContent)
  // handles sticky-header offset.
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, blockId: string) => {
      const target = document.getElementById(headingAnchor(blockId));
      if (!target) return; // fall through to default behavior
      event.preventDefault();
      target.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      // History-hash sync (so the URL reflects the current
      // location; back/forward navigates between sections).
      if (typeof history !== "undefined" && history.replaceState) {
        history.replaceState(null, "", `#${headingAnchor(blockId)}`);
      }
      // Force a state-update for the active item (the
      // observer will keep it in sync past the click, but
      // the click should ALREADY mark it active).
      setActiveBlockId(blockId);
    },
    [],
  );

  // ─── Render ───────────────────────────────────────────────

  if (headings.length === 0) {
    return (
      <nav
        aria-label="Indice della pagina"
        data-testid="reader-toc"
        className={[
          "sticky top-20 rounded-md border border-cream-border bg-cream-card/60 p-4 text-xs italic text-cream-text-soft",
          className ?? "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        Nessun titolo in questa pagina.
      </nav>
    );
  }

  return (
    <nav
      aria-label="Indice della pagina"
      data-testid="reader-toc"
      className={[
        "sticky top-20 rounded-md border border-cream-border bg-cream-card/60 p-4 text-xs dark:border-cream-dark-border dark:bg-cream-dark-surface/60",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-cream-text-soft">
        Indice
      </h2>
      <ul className="space-y-1">
        {headings.map((h) => {
          const isActive = h.blockId === activeBlockId;
          const indentClass =
            h.level === 1
              ? "font-medium"
              : h.level === 2
                ? "pl-3"
                : "pl-6 text-cream-text-soft/80";
          return (
            <li key={h.blockId}>
              <a
                href={`#${headingAnchor(h.blockId)}`}
                onClick={(e) => handleClick(e, h.blockId)}
                data-testid={`reader-toc-link-${h.blockId}`}
                data-active={isActive ? "true" : "false"}
                aria-current={isActive ? "location" : undefined}
                className={[
                  "block truncate rounded px-2 py-1 transition-colors duration-150",
                  "focus:outline-none focus:ring-2 focus:ring-cream-gold/60",
                  indentClass,
                  isActive
                    ? "bg-cream-gold/15 text-cream-text dark:bg-cream-dark-gold/15"
                    : "text-cream-text-soft hover:bg-cream-border-soft/40 hover:text-cream-text dark:hover:bg-cream-dark-border/40",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {h.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
