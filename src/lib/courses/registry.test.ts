/**
 * src/lib/courses/registry.test.ts
 *
 * Unit tests for the bundled/user-published split helpers exposed via
 * `src/lib/courses/registry.ts`. The registry barrel re-exports from
 * `courses.config.ts` (the root source-of-truth); this test stub-feeds
 * mixed-kind fixtures via `vi.mock` so we can exercise the filter +
 * lookup semantics without mutating the real (empty) registry.
 *
 * ─── Coverage matrix ─────────────────────────────────────────────
 *
 *   1. BUNDLED_COURSES excludes user-published entries.
 *   2. ACTIVE_BUNDLED_COURSES excludes user-published + inactive.
 *   3. ACTIVE_COURSES alias == ACTIVE_BUNDLED_COURSES (legacy compat).
 *   4. isBundledCourse(slug) — true for bundled, false for user-published.
 *   5. isBundledCourse(slug) — true for unknown slug (treat as bundled
 *      to preserve the "absent = bundled" default behavior).
 *   6. getBundledSlugs() returns bundled-only slug list.
 *   7. findCourseMeta returns the entry regardless of kind (raw catalog view).
 *   8. DEFAULT_LANDING_SLUG uses COURSES[0] (legacy behavior).
 *   9. ACTIVE_BUNDLED_COURSES preserves insertion order.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

// Stub `courses.config.ts` BEFORE importing the registry so the
// registry module picks up our mixed-kind fixtures during its
// top-level evaluation (the registry re-exports bound constants).
vi.mock("../../../courses.config", () => {
  const COURSES = [
    {
      slug: "alpha",
      title: "Alpha bundled",
      tagline: "first bundled",
      templateId: "lumio",
      coverImage: "/alpha.jpg",
      locales: ["it", "en"],
      status: "active",
    },
    {
      slug: "bravo",
      title: "Bravo bundled (draft)",
      tagline: "draft bundled",
      templateId: "h612",
      coverImage: "/bravo.jpg",
      locales: ["it"],
      status: "draft",
    },
    {
      slug: "charlie",
      title: "Charlie user-published",
      tagline: "creator-driven",
      templateId: "horizon",
      coverImage: "/charlie.jpg",
      locales: ["en"],
      status: "active",
      kind: "user-published",
    },
    {
      slug: "delta",
      title: "Delta bundled",
      tagline: "second bundled",
      templateId: "lumio",
      coverImage: "/delta.jpg",
      locales: ["it", "en"],
      status: "active",
    },
  ];

  const isBundledCourse = (slug: string) =>
    COURSES.find((c) => c.slug === slug)?.kind !== "user-published";
  const BUNDLED_COURSES = COURSES.filter((c) => c.kind !== "user-published");
  const ACTIVE_BUNDLED_COURSES = BUNDLED_COURSES.filter((c) => c.status === "active");
  const ACTIVE_COURSES = ACTIVE_BUNDLED_COURSES; // back-compat alias
  const DEFAULT_LANDING_SLUG = COURSES[0]?.slug ?? "default-slug";
  const findCourseMeta = (slug: string) =>
    COURSES.find((c) => c.slug === slug) ?? null;

  return {
    COURSES,
    BUNDLED_COURSES,
    ACTIVE_BUNDLED_COURSES,
    ACTIVE_COURSES,
    DEFAULT_LANDING_SLUG,
    findCourseMeta,
    isBundledCourse,
  };
});

// Imports AFTER the mock is registered (vitest hoists `vi.mock`,
// but explicit ordering reads better).
const {
  COURSES,
  BUNDLED_COURSES,
  ACTIVE_BUNDLED_COURSES,
  ACTIVE_COURSES,
  DEFAULT_LANDING_SLUG,
  findCourseMeta,
  isBundledCourse,
  getBundledSlugs,
  getActiveSlugs,
  getAllSlugs,
  getCoursesByStatus,
  isRegisteredCourse,
} = await import("./registry");

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────

describe("registry — bundled-only filtering (Phase 3 split)", () => {
  it("1. BUNDLED_COURSES excludes user-published entries", () => {
    const bundledSlugs = BUNDLED_COURSES.map((c) => c.slug);
    expect(bundledSlugs).toEqual(["alpha", "bravo", "delta"]);
    expect(bundledSlugs).not.toContain("charlie");
  });

  it("2. ACTIVE_BUNDLED_COURSES excludes user-published + inactive", () => {
    const activeBundledSlugs = ACTIVE_BUNDLED_COURSES.map((c) => c.slug);
    expect(activeBundledSlugs).toEqual(["alpha", "delta"]);
    expect(activeBundledSlugs).not.toContain("bravo"); // draft
    expect(activeBundledSlugs).not.toContain("charlie"); // user-published
  });

  it("3. ACTIVE_COURSES alias equals ACTIVE_BUNDLED_COURSES (back-compat)", () => {
    expect(ACTIVE_COURSES).toEqual(ACTIVE_BUNDLED_COURSES);
  });

  it("4. isBundledCourse returns false for user-published slugs", () => {
    expect(isBundledCourse("charlie")).toBe(false);
    expect(isBundledCourse("alpha")).toBe(true);
    expect(isBundledCourse("bravo")).toBe(true);
    expect(isBundledCourse("delta")).toBe(true);
  });

  it("5. isBundledCourse returns true for unknown slugs (absent = bundled default)", () => {
    // The Phase 3 split treats absence as bundled: a slug that is
    // not registered at all is NOT user-published, so it falls through
    // as bundled. This preserves the "absent entry kind" default
    // behavior for backward-compat callers.
    expect(isBundledCourse("not-registered")).toBe(true);
  });
});

describe("registry — slug-list helpers", () => {
  it("6. getBundledSlugs returns bundled-only slug list", () => {
    expect(getBundledSlugs()).toEqual(["alpha", "bravo", "delta"]);
  });

  it("getActiveSlugs returns active-bundled-only slug list (matches ACTIVE_BUNDLED_COURSES)", () => {
    expect(getActiveSlugs()).toEqual(ACTIVE_BUNDLED_COURSES.map((c) => c.slug));
    expect(getActiveSlugs()).toEqual(["alpha", "delta"]);
  });

  it("getAllSlugs returns EVERY registered slug regardless of kind", () => {
    expect(getAllSlugs()).toEqual(["alpha", "bravo", "charlie", "delta"]);
  });

  it("getCoursesByStatus returns status map for the FULL catalog", () => {
    expect(getCoursesByStatus()).toEqual({
      alpha: "active",
      bravo: "draft",
      charlie: "active",
      delta: "active",
    });
  });

  it("isRegisteredCourse returns true for any registered slug (bundled OR user-published)", () => {
    expect(isRegisteredCourse("alpha")).toBe(true);
    expect(isRegisteredCourse("charlie")).toBe(true);
    expect(isRegisteredCourse("not-registered")).toBe(false);
  });
});

describe("registry — raw catalog lookups (kind-agnostic)", () => {
  it("7. findCourseMeta returns the entry regardless of kind", () => {
    const alpha = findCourseMeta("alpha");
    expect(alpha?.slug).toBe("alpha");
    expect(alpha?.kind).toBeUndefined(); // bundled (kind absent)

    const charlie = findCourseMeta("charlie");
    expect(charlie?.slug).toBe("charlie");
    expect(charlie?.kind).toBe("user-published");
  });

  it("8. DEFAULT_LANDING_SLUG uses COURSES[0] (legacy behavior, regardless of kind)", () => {
    expect(DEFAULT_LANDING_SLUG).toBe(COURSES[0]?.slug);
    expect(DEFAULT_LANDING_SLUG).toBe("alpha");
  });

  it("9. ACTIVE_BUNDLED_COURSES preserves insertion order (not re-sorted by status)", () => {
    // alpha (active) before delta (active), with bravo (draft) filtered out.
    expect(ACTIVE_BUNDLED_COURSES.map((c) => c.slug)).toEqual(["alpha", "delta"]);
  });
});
