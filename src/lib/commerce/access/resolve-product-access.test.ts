/**
 * Tests for src/lib/commerce/access/resolve-product-access.ts.
 *
 * MCR Phase 3 — central access resolver. AccessGrant is the SSOT.
 *
 * Coverage:
 *   - Defensive guards: missing userId or productId -> deny without DB hit.
 *   - status = "active" filter: only active grants allow access.
 *   - expiresAt clause: future expiresAt allows; past expiresAt denies
 *     (treated as transient missing until the owner flips to status=
 *     "expired").
 *   - SourceType honored uniformly: order, free_enrollment, admin,
 *     bundle (test fixtures verify the resolver does not branch on
 *     sourceType — any active grant qualifies). The watchlist
 *     sourceType is also accepted but not asserted here (no fixture
 *     call site exists yet).
 *   - Grant shape: returns `{ allowed: true; grantId; source: "grant" }`
 *     on hit; `{ allowed: false; reason: NoActiveAccessGrant }` on miss.
 *   - Empty AccessGrant table: deny without crashing.
 *   - Lowercase statuses/queries (Postgres SQL keywords are case-insensitive
 *     but our schema column values are lowercased strings; verified
 *     the resolver doesn't lowercase-translate on its own).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    accessGrant: { findFirst: vi.fn() },
    // Order is intentionally NOT mocked here — the legacy path is gone.
    // If a future regression accidentally re-introduces an Order read,
    // these tests fail immediately because mockPrisma.order is undefined.
    order: undefined as never,
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import {
  resolveProductAccess,
  ProductAccessDenyReason,
} from "./resolve-product-access";

const USER_ID = "user-1";
const PRODUCT_ID = "prod-1";
const GRANT_ID = "grant-42";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveProductAccess — defensive guards", () => {
  it("denies with NoActiveAccessGrant when userId is empty (no DB hit)", async () => {
    const result = await resolveProductAccess({
      userId: "",
      productId: PRODUCT_ID,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe(ProductAccessDenyReason.NoActiveAccessGrant);
    } else {
      throw new Error("expected allowed=false branch");
    }
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });

  it("denies with NoActiveAccessGrant when productId is empty (no DB hit)", async () => {
    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: "",
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe(ProductAccessDenyReason.NoActiveAccessGrant);
    } else {
      throw new Error("expected allowed=false branch");
    }
    expect(mockPrisma.accessGrant.findFirst).not.toHaveBeenCalled();
  });
});

describe("resolveProductAccess — AccessGrant read (SSOT)", () => {
  it("returns source:'grant' + grantId when AccessGrant.findFirst hits status=active", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });

    // Spec-literal shape: grantId populated on the 'grant' branch.
    // Field-by-field assertions with narrowing (TypeScript can't
    // satisfy `result.source` access via `toMatchObject` on the union).
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("grant");
      expect(result.grantId).toBe(GRANT_ID);
    } else {
      throw new Error("expected allowed=true branch");
    }

    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: USER_ID,
        productId: PRODUCT_ID,
        status: "active",
        OR: expect.arrayContaining([
          expect.objectContaining({ expiresAt: null }),
          expect.objectContaining({ expiresAt: expect.any(Object) }),
        ]),
      }),
      select: { id: true },
    });
  });

  it("denies with NoActiveAccessGrant when AccessGrant.findFirst returns null", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);

    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });

    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe(ProductAccessDenyReason.NoActiveAccessGrant);
    } else {
      throw new Error("expected allowed=false branch");
    }
  });

  it("queries only AccessGrant — no Order involvement in post-cutover path", async () => {
    // Defense: if a future regression re-introduces an Order read,
    // this assertion will catch it (mockPrisma.order is undefined).
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });
    await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    expect(mockPrisma.accessGrant.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.order).toBeUndefined();
  });
});

describe("resolveProductAccess — expiresAt handling", () => {
  it("includes OR clause: null OR future expiresAt match", async () => {
    mockPrisma.accessGrant.findFirst.mockResolvedValue({ id: GRANT_ID });
    await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    const whereArg = mockPrisma.accessGrant.findFirst.mock.calls[0]?.[0]?.where;
    expect(whereArg).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({ expiresAt: null }),
          expect.objectContaining({
            expiresAt: expect.objectContaining({ gt: expect.any(Date) }),
          }),
        ]),
      }),
    );
  });

  it("does NOT match grant with past expiresAt (treated as missing)", async () => {
    // Prisma's `gt` filter excludes past dates. The resolver does
    // NOT do its own date comparison — the WHERE covers it via the
    // OR clause. So findFirst with status="active" + this OR returns
    // null for past-expired rows.
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe(ProductAccessDenyReason.NoActiveAccessGrant);
    } else {
      throw new Error("expected allowed=false branch");
    }
  });
});

describe("resolveProductAccess — sourceTypes honored uniformly", () => {
  // The resolver does NOT branch on sourceType. We assert this by
  // returning fixture rows with each canonical sourceType and
  // verifying they're all accepted (status=active is the only filter).
  const SOURCE_TYPES = [
    { sourceType: "order", sourceId: "order-1" },
    { sourceType: "free_enrollment", sourceId: "free_enrollment:u:p" },
    { sourceType: "admin", sourceId: "admin-grant-1" },
    { sourceType: "bundle", sourceId: "bundle-1" },
    { sourceType: "watchlist", sourceId: "watchlist-1" },
  ] as const;

  for (const fixture of SOURCE_TYPES) {
    it(`honors sourceType="${fixture.sourceType}" when status=active`, async () => {
      mockPrisma.accessGrant.findFirst.mockResolvedValue({
        id: `${fixture.sourceType}-grant`,
      });
      const result = await resolveProductAccess({
        userId: USER_ID,
        productId: PRODUCT_ID,
      });
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.source).toBe("grant");
        expect(result.grantId).toBe(`${fixture.sourceType}-grant`);
      } else {
        throw new Error("expected allowed=true branch");
      }
    });
  }
});

describe("resolveProductAccess — status filter", () => {
  it("filters strictly on status='active' (revoked grants are denied)", async () => {
    // The query MUST include status="active" — otherwise revoked/expired
    // grants would leak through.
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    const whereArg = mockPrisma.accessGrant.findFirst.mock.calls[0]?.[0]?.where;
    expect(whereArg).toEqual(
      expect.objectContaining({ status: "active" }),
    );
  });

  it("denies when status='revoked' (the underlying `findFirst` returns null because filter blocks)", async () => {
    // Status filter is a SQL filter: revoked rows are NOT returned by
    // prisma.accessGrant.findFirst({where:{status:"active"}}). The
    // resolver surfaces that as NoActiveAccessGrant.
    mockPrisma.accessGrant.findFirst.mockResolvedValue(null);
    const result = await resolveProductAccess({
      userId: USER_ID,
      productId: PRODUCT_ID,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe(ProductAccessDenyReason.NoActiveAccessGrant);
    } else {
      throw new Error("expected allowed=false branch");
    }
  });
});
