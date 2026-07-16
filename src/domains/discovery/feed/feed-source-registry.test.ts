/**
 * src/domains/discovery/feed/feed-source-registry.test.ts
 *
 * Unit tests for the Feed Source Registry singleton (Courssy).
 *
 * Mirror pattern from `agent-registry.test.ts`:
 *   - per-test `_resetFeedSourceRegistryForTests()` clears state
 *   - coverage: register happy path, idempotency throw, get/has/list
 *     snapshot, readonly view, escape hatch, brand safety
 */

import { describe, it, expect, beforeEach } from "vitest";

import {
  FEED_SOURCE_KINDS,
  FEED_SOURCE_REGISTRY,
  _resetFeedSourceRegistryForTests,
  asFeedSourceId,
  getFeedSource,
  isFeedSourceRegistered,
  listFeedSourceIds,
  listFeedSources,
  registerFeedSource,
  type FeedSourceDescriptor,
  type FeedSourceId,
} from "./feed-source-registry";

// ─── Test helpers ─────────────────────────────────────────────────

function mkDescriptor(
  overrides: Partial<FeedSourceDescriptor> = {},
): FeedSourceDescriptor {
  return {
    id: asFeedSourceId("test-source"),
    kind: "lesson" as const,
    displayLabel: "Test Source",
    enabled: true,
    fetch: async () => [],
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

beforeEach(() => {
  _resetFeedSourceRegistryForTests();
});

describe("registerFeedSource \u2014 happy path", () => {
  it("registers a source and is retrievable via getFeedSource", () => {
    const d = mkDescriptor({ id: asFeedSourceId("s1") });
    registerFeedSource(d);
    expect(getFeedSource(asFeedSourceId("s1"))).toBe(d);
  });

  it("isFeedSourceRegistered returns true for registered sources", () => {
    registerFeedSource(mkDescriptor({ id: asFeedSourceId("s1") }));
    expect(isFeedSourceRegistered(asFeedSourceId("s1"))).toBe(true);
  });

  it("isFeedSourceRegistered returns false for unknown sources", () => {
    expect(isFeedSourceRegistered(asFeedSourceId("nope"))).toBe(false);
  });

  it("registerFeedSource throws on duplicate id", () => {
    registerFeedSource(mkDescriptor({ id: asFeedSourceId("s1") }));
    expect(() =>
      registerFeedSource(mkDescriptor({ id: asFeedSourceId("s1") })),
    ).toThrow(/already registered/);
  });

  it("supports hot-add (multiple sources at startup or runtime)", () => {
    registerFeedSource(mkDescriptor({ id: asFeedSourceId("a") }));
    registerFeedSource(mkDescriptor({ id: asFeedSourceId("b") }));
    registerFeedSource(mkDescriptor({ id: asFeedSourceId("c") }));
    expect(FEED_SOURCE_REGISTRY.size).toBe(3);
  });
});

describe("list / snapshot shape", () => {
  it("returns empty snapshot when registry is empty", () => {
    expect(listFeedSourceIds()).toEqual([]);
    expect(listFeedSources()).toEqual([]);
  });

  it("returns sources in registration order", () => {
    registerFeedSource(mkDescriptor({ id: asFeedSourceId("a") }));
    registerFeedSource(mkDescriptor({ id: asFeedSourceId("b") }));
    registerFeedSource(mkDescriptor({ id: asFeedSourceId("c") }));
    expect(listFeedSourceIds()).toEqual([
      asFeedSourceId("a"),
      asFeedSourceId("b"),
      asFeedSourceId("c"),
    ]);
  });

  it("snapshot is decoupled from live registry mutations", () => {
    registerFeedSource(mkDescriptor({ id: asFeedSourceId("a") }));
    const snap = listFeedSourceIds();
    registerFeedSource(mkDescriptor({ id: asFeedSourceId("b") }));
    expect(snap).toEqual([asFeedSourceId("a")]); // snap unchanged
    expect(FEED_SOURCE_REGISTRY.size).toBe(2); // live updated
  });
});

describe("FEED_SOURCE_REGISTRY \u2014 readonly view", () => {
  it("get/has/values/size work through the readonly view", () => {
    const d = mkDescriptor({ id: asFeedSourceId("s1") });
    registerFeedSource(d);
    expect(FEED_SOURCE_REGISTRY.has(asFeedSourceId("s1"))).toBe(true);
    expect(FEED_SOURCE_REGISTRY.get(asFeedSourceId("s1"))).toBe(d);
    expect(Array.from(FEED_SOURCE_REGISTRY.values())).toEqual([d]);
    expect(FEED_SOURCE_REGISTRY.size).toBe(1);
  });
});

describe("_resetFeedSourceRegistryForTests \u2014 escape hatch", () => {
  it("clears the registry", () => {
    registerFeedSource(mkDescriptor({ id: asFeedSourceId("a") }));
    registerFeedSource(mkDescriptor({ id: asFeedSourceId("b") }));
    expect(FEED_SOURCE_REGISTRY.size).toBe(2);
    _resetFeedSourceRegistryForTests();
    expect(FEED_SOURCE_REGISTRY.size).toBe(0);
    expect(listFeedSourceIds()).toEqual([]);
  });

  it("allows re-registration of the SAME id after reset", () => {
    registerFeedSource(mkDescriptor({ id: asFeedSourceId("a") }));
    _resetFeedSourceRegistryForTests();
    expect(() =>
      registerFeedSource(mkDescriptor({ id: asFeedSourceId("a") })),
    ).not.toThrow();
  });
});

describe("FEED_SOURCE_KINDS enum coverage", () => {
  it("contains exactly 6 reserved source kinds", () => {
    expect(FEED_SOURCE_KINDS.length).toBe(6);
    expect(new Set(FEED_SOURCE_KINDS).size).toBe(6);
  });

  it("all kinds are valid FeedSourceKind strings", () => {
    expect(FEED_SOURCE_KINDS).toContain("continue_learning");
    expect(FEED_SOURCE_KINDS).toContain("lesson");
    expect(FEED_SOURCE_KINDS).toContain("community_post");
    expect(FEED_SOURCE_KINDS).toContain("free_course");
    expect(FEED_SOURCE_KINDS).toContain("premium_course");
    expect(FEED_SOURCE_KINDS).toContain("creator_update");
  });
});

describe("FeedSourceId brand \u2014 compile-time safety", () => {
  it("asFeedSourceId produces a value usable as FeedSourceId", () => {
    const id: FeedSourceId = asFeedSourceId("my-source");
    registerFeedSource(mkDescriptor({ id }));
    expect(isFeedSourceRegistered(id)).toBe(true);
  });
});
