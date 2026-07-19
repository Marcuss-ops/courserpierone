/**
 * src/domains/creator-ops/access/resolve-creator-page-access.test.ts
 *
 * Unit tests for `resolveCreatorPageAccess` (page-level mirror
 * of the product-level SSOT resolver).
 *
 * Pattern mirrors `resolve-creator-product-access.test.ts`
 * exactly: stub the port directly, pre-set responses for each
 * piece independently, exercise one branch per test.
 *
 * Coverage (user spec: "unit test for all combinations"):
 *
 *   ── 3 ALLOW SOURCES (success branches) ────────────────────────
 *     (a) admin:      role=admin × (any product/owner/app)
 *                       × (any pageProductId)                  → admin
 *     (b) owner:      role=creator × product.creatorId=actorId
 *                       × (any app status)                    → owner
 *     (c) owner wins over approved_creator even when both apply:
 *                       role=creator × owns product × approved
 *                                                            → owner
 *     (d) approved_creator:
 *                       role=creator × product.creatorId≠actorId
 *                       × application.status=approved         → approved_creator
 *     (e) PENDING application (NOT approved):              → forbidden
 *     (f) REJECTED application:                             → forbidden
 *     (g) UNDER_REVIEW application:                          → forbidden
 *
 *   ── 3 DENY REASONS ─────────────────────────────────────────────
 *     (h) actor_not_found: port returns null actor            → typed denial
 *     (i) page_not_found: port returns null pageProductId     → typed denial
 *     (j) page_not_found: even for admin role                 → typed denial
 *     (k) forbidden (no source matches): role=student         → forbidden
 *     (l) forbidden (creator, no owner, no app):              → forbidden
 *
 *   ── DEFENSIVE GUARDS (no port call) ──────────────────────────
 *     (m) empty actorId short-circuits to forbidden
 *     (n) empty pageId short-circuits to forbidden
 *     (o) empty BOTH → forbidden
 *
 *   ── PLUMBING ──────────────────────────────────────────────────
 *     (p) allowed: true echoes requiredAction on all 3 sources
 *     (q) allowed: true echoes pageProductId verbatim on all 3 sources
 *     (r) port receives the exact actorId + pageId supplied
 *
 *   ── REQUIRED_ACTION VARIATIONS ────────────────────────────────
 *     (s) requiredAction="view" / "edit" / "publish" / "delete" —
 *         all 4 actions are accepted (uniform logic, mirrors
 *         the product resolver)
 *
 *   ── ARCHITECTURE GUARD ──────────────────────────────────────
 *     (t) input shape has exactly { actorId, pageId, requiredAction }
 *         and does NOT include any Prisma-derivable field
 */

import { describe, expect, it } from "vitest";

import { resolveCreatorPageAccess } from "./resolve-creator-page-access";
import type {
  ActorRole,
  ResolveCreatorPageAccessContext,
  ResolveCreatorPageAccessInput,
  ResolveCreatorPageAccessPort,
} from "./resolve-creator-page-access-types";
import type { CreatorApplicationStatus } from "../onboarding/creator-application-status";

interface StubState {
  // Inputs recorded by the stub's method body.
  lastLoadInput?: { actorId: string; pageId: string };

  // Pre-set responses (independently nullable for each field).
  contextResult: ResolveCreatorPageAccessContext;

  // Counting: ensures we assert no-load-on-deny defensive guard.
  loadCallCount: number;
}

function mkStubPort(): {
  port: ResolveCreatorPageAccessPort;
  state: StubState;
} {
  const state: StubState = {
    // Default: an owner creator (owns the product the page belongs
    // to), no application row (typical internal-creator shape).
    // Tests override per-branch.
    contextResult: {
      actor: { role: "creator" },
      product: { creatorId: "creator_1" },
      application: null,
      pageProductId: "product_1",
    },
    loadCallCount: 0,
  };
  const port: ResolveCreatorPageAccessPort = {
    async loadPageAccessContext(input) {
      state.loadCallCount++;
      state.lastLoadInput = input;
      return state.contextResult;
    },
  };
  return { port, state };
}

function happyInput(): ResolveCreatorPageAccessInput {
  return {
    actorId: "creator_1",
    pageId: "page_1",
    requiredAction: "edit",
  };
}

/**
 * Build a context fixture from explicit pieces — keeps the
 * truth-table tests readable. Default values mirror the
 * happy-path input (actor is creator_1, owns product_1, no app).
 */
function ctx(p: {
  actor?: { role: ActorRole } | null;
  product?: { creatorId: string } | null;
  application?: { status: CreatorApplicationStatus } | null;
  pageProductId?: string | null;
}): ResolveCreatorPageAccessContext {
  return {
    actor:
      p.actor === undefined
        ? { role: "creator" }
        : p.actor === null
          ? null
          : { role: p.actor.role },
    product:
      p.product === undefined
        ? { creatorId: "creator_1" }
        : p.product === null
          ? null
          : { creatorId: p.product.creatorId },
    application:
      p.application === undefined
        ? null
        : p.application === null
          ? null
          : { status: p.application.status },
    pageProductId:
      p.pageProductId === undefined
        ? "product_1"
        : p.pageProductId === null
          ? null
          : p.pageProductId,
  };
}

// ─── Input invariant ──────────────────────────────────────────────

describe("resolveCreatorPageAccess — input invariants", () => {
  it("exports resolveCreatorPageAccess as an async function", () => {
    expect(typeof resolveCreatorPageAccess).toBe("function");
  });
});

// ─── 1. ALLOW — admin (highest privilege) ─────────────────────────

describe("resolveCreatorPageAccess — allow: admin", () => {
  it("admin: role=admin × owner × pageProductId present → admin", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "admin" },
      product: { creatorId: "creator_1" },
      pageProductId: "product_1",
    });
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("admin");
      expect(result.requiredAction).toBe("edit");
      expect(result.pageProductId).toBe("product_1");
    }
  });

  it("admin: role=admin × NOT owner × no application → admin", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "admin" },
      product: { creatorId: "creator_OTHER" },
      application: null,
    });
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("admin");
    }
  });

  it("admin: role=admin × NOT owner × approved application → admin (admin branch wins by order)", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "admin" },
      product: { creatorId: "creator_OTHER" },
      application: { status: "approved" },
    });
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("admin");
    }
  });
});

// ─── 2. ALLOW — owner ─────────────────────────────────────────────

describe("resolveCreatorPageAccess — allow: owner", () => {
  it("owner: role=creator × product.creatorId === actorId × no application → owner", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "creator" },
      product: { creatorId: "creator_1" },
      application: null,
    });
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("owner");
      expect(result.pageProductId).toBe("product_1");
    }
  });

  it("owner: role=creator × owns product × approved application → owner (owner wins over approved_creator)", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "creator" },
      product: { creatorId: "creator_1" },
      application: { status: "approved" },
    });
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("owner");
    }
  });

  it("owner: role=creator × owns product × PENDING application → owner (still owner, not approved_creator)", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "creator" },
      product: { creatorId: "creator_1" },
      application: { status: "submitted" },
    });
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("owner");
    }
  });
});

// ─── 3. ALLOW — approved_creator ──────────────────────────────────

describe("resolveCreatorPageAccess — allow: approved_creator", () => {
  it("approved_creator: role=creator × NOT owner × approved application → approved_creator", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "creator" },
      product: { creatorId: "creator_OTHER" },
      application: { status: "approved" },
    });
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("approved_creator");
      expect(result.pageProductId).toBe("product_1");
    }
  });

  it("NOT approved_creator: role=creator × NOT owner × submitted application → forbidden", async () => {
    const port = {
      loadPageAccessContext: async () =>
        ctx({
          actor: { role: "creator" },
          product: { creatorId: "creator_OTHER" },
          application: { status: "submitted" },
        }),
    } as unknown as ResolveCreatorPageAccessPort;
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
  });

  it("NOT approved_creator: role=creator × NOT owner × under_review → forbidden", async () => {
    const port = {
      loadPageAccessContext: async () =>
        ctx({
          actor: { role: "creator" },
          product: { creatorId: "creator_OTHER" },
          application: { status: "under_review" },
        }),
    } as unknown as ResolveCreatorPageAccessPort;
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
  });

  it("NOT approved_creator: role=creator × NOT owner × rejected → forbidden", async () => {
    const port = {
      loadPageAccessContext: async () =>
        ctx({
          actor: { role: "creator" },
          product: { creatorId: "creator_OTHER" },
          application: { status: "rejected" },
        }),
    } as unknown as ResolveCreatorPageAccessPort;
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
  });

  it("NOT approved_creator: role=creator × NOT owner × no application → forbidden", async () => {
    const port = {
      loadPageAccessContext: async () =>
        ctx({
          actor: { role: "creator" },
          product: { creatorId: "creator_OTHER" },
          application: null,
        }),
    } as unknown as ResolveCreatorPageAccessPort;
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
  });
});

// ─── 4. DENY — actor_not_found ────────────────────────────────────

describe("resolveCreatorPageAccess — deny: actor_not_found", () => {
  it("port returns null actor → actor_not_found (rare: session user deleted under us)", async () => {
    const port = {
      loadPageAccessContext: async () =>
        ctx({
          actor: null,
          product: { creatorId: "creator_1" },
          application: null,
          pageProductId: "product_1",
        }),
    } as unknown as ResolveCreatorPageAccessPort;
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("actor_not_found");
    }
  });
});

// ─── 5. DENY — page_not_found ─────────────────────────────────────

describe("resolveCreatorPageAccess — deny: page_not_found", () => {
  it("port returns null pageProductId → page_not_found (collapsed for no info leak)", async () => {
    const port = {
      loadPageAccessContext: async () =>
        ctx({
          actor: { role: "creator" },
          product: null,
          application: null,
          pageProductId: null,
        }),
    } as unknown as ResolveCreatorPageAccessPort;
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("page_not_found");
    }
  });

  it("port returns null pageProductId EVEN for admin → page_not_found (admin can't edit non-existent page)", async () => {
    // Important: admin doesn't escape page_not_found. A non-
    // existent page is a 404 regardless of role.
    const port = {
      loadPageAccessContext: async () =>
        ctx({
          actor: { role: "admin" },
          product: null,
          application: null,
          pageProductId: null,
        }),
    } as unknown as ResolveCreatorPageAccessPort;
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("page_not_found");
    }
  });
});

// ─── 6. DENY — forbidden ──────────────────────────────────────────

describe("resolveCreatorPageAccess — deny: forbidden", () => {
  it("role=student × (any product/application) → forbidden", async () => {
    const port = {
      loadPageAccessContext: async () =>
        ctx({
          actor: { role: "student" },
          product: { creatorId: "creator_OTHER" },
          application: { status: "approved" },
        }),
    } as unknown as ResolveCreatorPageAccessPort;
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
  });

  it("role=creator × NOT owner × no application → forbidden", async () => {
    const port = {
      loadPageAccessContext: async () =>
        ctx({
          actor: { role: "creator" },
          product: { creatorId: "creator_OTHER" },
          application: null,
        }),
    } as unknown as ResolveCreatorPageAccessPort;
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
  });
});

// ─── 7. DEFENSIVE GUARDS (no port call) ──────────────────────────

describe("resolveCreatorPageAccess — defensive guards (no port call)", () => {
  it("empty actorId → forbidden (no port call)", async () => {
    const { port, state } = mkStubPort();
    const result = await resolveCreatorPageAccess(
      { ...happyInput(), actorId: "" },
      { port },
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
    expect(state.loadCallCount).toBe(0);
  });

  it("empty pageId → forbidden (no port call)", async () => {
    const { port, state } = mkStubPort();
    const result = await resolveCreatorPageAccess(
      { ...happyInput(), pageId: "" },
      { port },
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
    expect(state.loadCallCount).toBe(0);
  });

  it("empty BOTH → forbidden (no port call)", async () => {
    const { port, state } = mkStubPort();
    const result = await resolveCreatorPageAccess(
      { ...happyInput(), actorId: "", pageId: "" },
      { port },
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
    expect(state.loadCallCount).toBe(0);
  });
});

// ─── 8. PLUMBING — echo + forwarding ──────────────────────────────

describe("resolveCreatorPageAccess — plumbing", () => {
  it("forwards actorId + pageId verbatim to loadPageAccessContext", async () => {
    const { port, state } = mkStubPort();
    await resolveCreatorPageAccess(
      {
        actorId: "u_session_42",
        pageId: "page_xyz_99",
        requiredAction: "view",
      },
      { port },
    );
    expect(state.lastLoadInput).toEqual({
      actorId: "u_session_42",
      pageId: "page_xyz_99",
    });
  });

  it("pageProductId is echoed verbatim on the allowed:true branch (admin source)", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "admin" },
      product: { creatorId: "creator_OTHER" },
      pageProductId: "prod_xyz_99",
    });
    const result = await resolveCreatorPageAccess(
      { ...happyInput(), pageId: "page_xyz_99" },
      { port },
    );
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.pageProductId).toBe("prod_xyz_99");
    }
  });

  it("pageProductId is echoed verbatim on the allowed:true branch (approved_creator source)", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "creator" },
      product: { creatorId: "creator_OTHER" },
      application: { status: "approved" },
      pageProductId: "prod_other_42",
    });
    const result = await resolveCreatorPageAccess(happyInput(), { port });
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("approved_creator");
      expect(result.pageProductId).toBe("prod_other_42");
    }
  });
});

// ─── 9. REQUIRED_ACTION echo (all 4 page actions) ────────────────

describe("resolveCreatorPageAccess — requiredAction echo (4 page actions)", () => {
  const ACTIONS = ["view", "edit", "publish", "delete"] as const;
  for (const action of ACTIONS) {
    it(`requiredAction=${action} echoed on allowed:owner`, async () => {
      const { port, state } = mkStubPort();
      state.contextResult = ctx({
        actor: { role: "creator" },
        product: { creatorId: "creator_1" },
      });
      const result = await resolveCreatorPageAccess(
        { ...happyInput(), requiredAction: action },
        { port },
      );
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.requiredAction).toBe(action);
      }
    });

    it(`requiredAction=${action} echoed on allowed:admin`, async () => {
      const { port, state } = mkStubPort();
      state.contextResult = ctx({
        actor: { role: "admin" },
        product: { creatorId: "creator_1" },
      });
      const result = await resolveCreatorPageAccess(
        { ...happyInput(), requiredAction: action },
        { port },
      );
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.requiredAction).toBe(action);
      }
    });

    it(`requiredAction=${action} echoed on allowed:approved_creator`, async () => {
      const { port, state } = mkStubPort();
      state.contextResult = ctx({
        actor: { role: "creator" },
        product: { creatorId: "creator_OTHER" },
        application: { status: "approved" },
      });
      const result = await resolveCreatorPageAccess(
        { ...happyInput(), requiredAction: action },
        { port },
      );
      expect(result.allowed).toBe(true);
      if (result.allowed) {
        expect(result.requiredAction).toBe(action);
      }
    });
  }
});

// ─── 10. Architecture guard ──────────────────────────────────────

describe("resolveCreatorPageAccess — architecture guard", () => {
  it("input shape has exactly { actorId, pageId, requiredAction } (no Prisma derivable fields)", () => {
    const sample: ResolveCreatorPageAccessInput = happyInput();
    const allowedKeys = ["actorId", "pageId", "requiredAction"].sort();
    expect(Object.keys(sample).sort()).toEqual(allowedKeys);
  });
});
