/**
 * vitest.setup.ts
 *
 * Global polyfills + setup for ALL Vitest test files.
 *
 * ─── Why this file exists ────────────────────────────────
 *
 * jsdom (our `// @vitest-environment jsdom` env) does NOT
 * ship with `IntersectionObserver` or `ResizeObserver`. Any
 * Client Component that uses these classes — including the
 * reader surface's `TableOfContents` (active-section
 * tracking) — would crash at mount.
 *
 * Rather than inline the polyfill in every test file (brittle
 * — easy to forget for new tests), we register it ONCE here
 * via `vitest.config.ts`'s `setupFiles` entry.
 *
 * ─── Adding new browser-only APIs ────────────────────────
 *
 * When a new Client Component adopts a browser-only API
 * (ResizeObserver, MutationObserver, BroadcastChannel, etc.),
 * add a no-op stub for it here so jsdom tests don't crash.
 *
 * ─── Why no-op stubs are OK for unit tests ─────────────────
 *
 * Unit tests exercise the COMPONENT'S render lifecycle and
 * DOM bindings. They don't (yet) verify the observer-driven
 * behavior — that lives in Playwright e2e tests where the
 * real browser API is required. A no-op stub satisfies the
 * class API surface (`observe` / `disconnect` / `unobserve` /
 * `takeRecords` for `IntersectionObserver`) and lets the
 * mount complete cleanly.
 */

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Ensure DOM state never crosses test boundaries. Without this, jsdom
// suites accumulate prior renders and produce false duplicate-element
// failures that only appear in the full test run.
afterEach(cleanup);

// ─── IntersectionObserver stub ────────────────────────────
if (typeof globalThis.IntersectionObserver === "undefined") {
  class StubIntersectionObserver {
    readonly root: Element | null = null;
    readonly rootMargin = "";
    readonly thresholds: ReadonlyArray<number> = [];
    observe(): void {
      /* noop */
    }
    unobserve(): void {
      /* noop */
    }
    disconnect(): void {
      /* noop */
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  globalThis.IntersectionObserver =
    StubIntersectionObserver as unknown as typeof IntersectionObserver;
}

// ─── ResizeObserver stub ──────────────────────────────────
if (typeof globalThis.ResizeObserver === "undefined") {
  class StubResizeObserver {
    readonly callback: ResizeObserverCallback;
    readonly observationTargets: Element[] = [];
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(): void {
      /* noop */
    }
    unobserve(): void {
      /* noop */
    }
    disconnect(): void {
      /* noop */
    }
  }
  globalThis.ResizeObserver =
    StubResizeObserver as unknown as typeof ResizeObserver;
}
