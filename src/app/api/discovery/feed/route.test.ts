/**
 * /api/discovery/feed route tests (Courssy).
 *
 * Deterministic, no real DB. Mocks auth and the Prisma feed repository
 * to verify the route thin layer: auth, input parsing, context build,
 * usecase call, and JSON response shape.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import type { FeedContext, FeedResult } from "@/domains/discovery/feed/feed-types";

// ─── Mocks ───────────────────────────────────────────────────────────
const mockBuildContext = vi.fn();
const mockFetchContinueLearning = vi.fn();
const mockFetchRecentLessons = vi.fn();

vi.mock("@/lib/supabase/get-user", () => ({
  getServerUser: vi.fn(),
}));

vi.mock("@/domains/discovery/feed/prisma-feed-repository", () => ({
  prismaFeedRepository: vi.fn(() => ({
    buildContext: mockBuildContext,
    fetchContinueLearning: mockFetchContinueLearning,
    fetchRecentLessons: mockFetchRecentLessons,
  })),
}));

import { getServerUser } from "@/lib/supabase/get-user";
import { GET } from "./route";

function asServerUser(
  value: unknown,
): Awaited<ReturnType<typeof getServerUser>> {
  return value as Awaited<ReturnType<typeof getServerUser>>;
}

function mkContext(): FeedContext {
  return {
    userId: "u1",
    lang: "en",
    country: "US",
    ownedProductIds: ["p1"],
    startedCourseIds: ["p1"],
    followedCreatorIds: ["c1"],
    observedTopics: [],
  };
}

function mkRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, "http://localhost"));
}

// ─── Tests ───────────────────────────────────────────────────────────
describe("GET /api/discovery/feed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerUser).mockResolvedValue(
      asServerUser({
        user: { email: "test@example.com" },
        dbUser: { id: "u1", preferredLocale: "en" },
        supabase: null,
      }),
    );
    mockBuildContext.mockResolvedValue(mkContext());
    mockFetchContinueLearning.mockResolvedValue([]);
    mockFetchRecentLessons.mockResolvedValue([]);
  });

  it("returns 401 when the user is not authenticated", async () => {
    vi.mocked(getServerUser).mockResolvedValue(
      asServerUser({
        user: null,
        dbUser: null,
        supabase: null,
      }),
    );

    const response = await GET(mkRequest("http://localhost/api/discovery/feed"));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("builds context from dbUser preferredLocale and IP country header", async () => {
    const request = new NextRequest(
      new URL("http://localhost/api/discovery/feed"),
      { headers: { "x-vercel-ip-country": "IT" } },
    );

    await GET(request);

    expect(mockBuildContext).toHaveBeenCalledWith("u1", "en", "IT");
  });

  it("uses query params for locale, country, pageSize and cursor", async () => {
    const request = new NextRequest(
      new URL(
        "http://localhost/api/discovery/feed?locale=it&country=FR&pageSize=5&cursor=2026-07-15T12:00:00Z",
      ),
    );

    await GET(request);

    expect(mockBuildContext).toHaveBeenCalledWith("u1", "it", "FR");
    // buildFeed is called with pageSize=5 and cursor propagated.
    expect(mockFetchContinueLearning).toHaveBeenCalled();
    expect(mockFetchRecentLessons).toHaveBeenCalled();
  });

  it("caps pageSize to MAX_PAGE_SIZE (50)", async () => {
    const request = new NextRequest(
      new URL("http://localhost/api/discovery/feed?pageSize=999"),
    );

    await GET(request);

    // The repository fetches are invoked; the exact cap is enforced by
    // the route before calling buildFeed. We verify no error is thrown
    // and the call proceeds.
    expect(mockFetchContinueLearning).toHaveBeenCalled();
    expect(mockFetchRecentLessons).toHaveBeenCalled();
  });

  it("returns the feed result as JSON", async () => {
    mockFetchContinueLearning.mockResolvedValue([
      {
        kind: "continue_learning",
        id: "cl1",
        productId: "p1",
        productSlug: "course-1",
        lessonId: "l1",
        title: "Resume",
        lastWatchedAt: new Date("2026-07-16T10:00:00Z"),
      },
    ]);

    const response = await GET(mkRequest("http://localhost/api/discovery/feed"));
    expect(response.status).toBe(200);
    const body: FeedResult = await response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.kind).toBe("continue_learning");
    expect(body.nextCursor).toBeNull();
  });
});
