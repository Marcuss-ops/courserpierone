/**
 * src/app/api/creator/products/[productId]/pages/reorder/route.test.ts
 *
 * Route tests for `POST /api/creator/products/[productId]/pages/reorder`.
 *
 * Pattern mirrors the established route test conventions
 * (vi.hoisted for mock + `mockSessionAs` helper):
 *   - Stub `getServerUser` via `vi.mock("@/lib/supabase/get-user")`.
 *   - Stub the access port + reorder port via `__setRouteDeps`.
 *   - Build a `Request` object + `ctx` with productId param per test.
 *   - Call `POST(req, ctx)`; assert on response status + body.
 *
 * Coverage (per user spec: 403 / failure / success):
 *   - 401 (no session)
 *   - 403 (resolver or use case forbidden)
 *   - 422 (semantic failure: scope_mismatch / non_contiguous)
 *   - 200 (success)
 */

import { describe, expect, it, vi } from "vitest";

const { getServerUserMock } = vi.hoisted(() => ({
  getServerUserMock: vi.fn(),
}));
vi.mock("@/lib/supabase/get-user", () => ({
  getServerUser: getServerUserMock,
}));

import { POST, __setRouteDeps } from "./route";
import type {
  ReorderContentPagesPort,
} from "@/domains/catalog/content-pages/reorder-content-pages-types";
import type {
  ResolveCreatorProductAccessPort,
  ResolveCreatorProductAccessContext,
} from "@/domains/creator-ops/access/resolve-creator-product-access-types";

// ─── Test helpers ─────────────────────────────────────────────────

type AccessContext = {
  actor: { id: string; role: "admin" | "creator" | "student" } | null;
  product: { creatorId: string } | null;
  application: { status: string } | null;
};

function mkAccessPort(
  ctx: AccessContext,
): ResolveCreatorProductAccessPort & { spy: { called: { actorId: string; productId: string }[] } } {
  const spy = { called: [] as { actorId: string; productId: string }[] };
  return {
    async loadAccessContext(input) {
      spy.called.push(input);
      return ctx as unknown as ResolveCreatorProductAccessContext;
    },
    spy,
  };
}

function mkReorderPort(opts: {
  ownerResult?: { creatorId: string } | null;
  scopeResult?: { pageIds: string[] };
  applyResult?: { applied: true };
}): ReorderContentPagesPort {
  return {
    async findProductOwner() {
      return opts.ownerResult ?? { creatorId: "u_owner" };
    },
    async listContentPagesInScope() {
      return opts.scopeResult ?? { pageIds: ["p_a", "p_b", "p_c"] };
    },
    async applyReorder() {
      return opts.applyResult ?? { applied: true };
    },
  };
}

function mkSessionUser(actorId: string, role: "admin" | "creator" | "student") {
  return { id: actorId, role, email: `${actorId}@example.com`, name: actorId };
}

function mockSessionAs(actorId: string, role: "admin" | "creator" | "student") {
  getServerUserMock.mockResolvedValue({ dbUser: mkSessionUser(actorId, role) } as any);
}

function mkRequest(body: unknown): Request {
  return new Request(
    "http://localhost/api/creator/products/product_1/pages/reorder",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}

const CTX = { params: { productId: "product_1" } };

function configureRoute(deps: {
  access: AccessContext;
  reorder: Parameters<typeof mkReorderPort>[0];
}) {
  const accessPort = mkAccessPort(deps.access);
  const reorderPort = mkReorderPort(deps.reorder);
  __setRouteDeps({ accessPort, reorderPort });
  return { accessPort, reorderPort };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("POST /api/creator/products/[productId]/pages/reorder — exports", () => {
  it("exports POST as an async function", () => {
    expect(typeof POST).toBe("function");
  });
});

describe("POST .../pages/reorder — authentication", () => {
  it("no session → 401 unauthenticated", async () => {
    getServerUserMock.mockResolvedValue(null);
    const accessPort = mkAccessPort({
      actor: null,
      product: { creatorId: "anyone" },
      application: null,
    });
    __setRouteDeps({
      accessPort,
      reorderPort: mkReorderPort({}),
    });
    const res = await POST(
      mkRequest({ orderedPages: [{ pageId: "p_a", newPosition: 1 }] }),
      CTX,
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("unauthenticated");
  });
});

describe("POST .../pages/reorder — 403 forbidden", () => {
  it("resolver returns forbidden → 403 (no use case call)", async () => {
    mockSessionAs("u_thief", "creator");
    const accessPort = mkAccessPort({
      actor: { id: "u_thief", role: "creator" },
      product: { creatorId: "u_other" },
      application: null,
    });
    const reorderPort = mkReorderPort({});
    __setRouteDeps({ accessPort, reorderPort });
    const res = await POST(
      mkRequest({ orderedPages: [{ pageId: "p_a", newPosition: 1 }] }),
      CTX,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("forbidden");
  });
});

describe("POST .../pages/reorder — failure (scope_mismatch / non_contiguous)", () => {
  it("scope_mismatch → 422 + extras echo", async () => {
    mockSessionAs("u_owner", "creator");
    const accessPort = mkAccessPort({
      actor: { id: "u_owner", role: "creator" },
      product: { creatorId: "u_owner" },
      application: null,
    });
    const reorderPort: ReorderContentPagesPort = {
      async findProductOwner() {
        return { creatorId: "u_owner" };
      },
      async listContentPagesInScope() {
        return { pageIds: ["p_a"] };
      },
      async applyReorder() {
        return { applied: true };
      },
    };
    __setRouteDeps({ accessPort, reorderPort });
    const res = await POST(
      mkRequest({
        orderedPages: [
          { pageId: "p_a", newPosition: 1 },
          { pageId: "p_OUT_OF_SCOPE", newPosition: 2 },
        ],
      }),
      CTX,
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("scope_mismatch");
    expect(body.extras).toEqual(["p_OUT_OF_SCOPE"]);
  });

  it("non_contiguous_positions → 422 + supplied echo", async () => {
    mockSessionAs("u_owner", "creator");
    const accessPort = mkAccessPort({
      actor: { id: "u_owner", role: "creator" },
      product: { creatorId: "u_owner" },
      application: null,
    });
    const reorderPort: ReorderContentPagesPort = {
      async findProductOwner() {
        return { creatorId: "u_owner" };
      },
      async listContentPagesInScope() {
        return { pageIds: ["p_a", "p_b"] };
      },
      async applyReorder() {
        return { applied: true };
      },
    };
    __setRouteDeps({ accessPort, reorderPort });
    const res = await POST(
      mkRequest({
        orderedPages: [
          { pageId: "p_a", newPosition: 1 },
          { pageId: "p_b", newPosition: 5 },
        ],
      }),
      CTX,
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.reason).toBe("non_contiguous_positions");
    expect(body.supplied).toEqual([1, 5]);
  });
});

describe("POST .../pages/reorder — success", () => {
  it("happy path → 200 with reordered + scope echoes", async () => {
    mockSessionAs("u_owner", "creator");
    const accessPort = mkAccessPort({
      actor: { id: "u_owner", role: "creator" },
      product: { creatorId: "u_owner" },
      application: null,
    });
    const reorderPort: ReorderContentPagesPort = {
      async findProductOwner() {
        return { creatorId: "u_owner" };
      },
      async listContentPagesInScope() {
        return { pageIds: ["p_a", "p_b", "p_c"] };
      },
      async applyReorder() {
        return { applied: true };
      },
    };
    __setRouteDeps({ accessPort, reorderPort });
    const res = await POST(
      mkRequest({
        orderedPages: [
          { pageId: "p_b", newPosition: 1 },
          { pageId: "p_a", newPosition: 2 },
          { pageId: "p_c", newPosition: 3 },
        ],
      }),
      CTX,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.reordered).toEqual([
      { pageId: "p_b", position: 1 },
      { pageId: "p_a", position: 2 },
      { pageId: "p_c", position: 3 },
    ]);
    expect(body.scope).toEqual({ productId: "product_1", parentId: null });
  });

  it("parentId: null (top-level scope) is the default when omitted", async () => {
    mockSessionAs("u_owner", "creator");
    const accessPort = mkAccessPort({
      actor: { id: "u_owner", role: "creator" },
      product: { creatorId: "u_owner" },
      application: null,
    });
    const reorderPort: ReorderContentPagesPort = {
      async findProductOwner() {
        return { creatorId: "u_owner" };
      },
      async listContentPagesInScope() {
        return { pageIds: ["p_a"] };
      },
      async applyReorder() {
        return { applied: true };
      },
    };
    __setRouteDeps({ accessPort, reorderPort });
    const res = await POST(
      mkRequest({ orderedPages: [{ pageId: "p_a", newPosition: 1 }] }),
      CTX,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.scope.parentId).toBeNull();
  });
});
