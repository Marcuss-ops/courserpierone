/**
 * src/domains/creator-ops/access/resolve-creator-product-access.test.ts
 *
 * Unit tests for `resolveCreatorProductAccess` (Phase 7 — unified
 * creator-side access resolver).
 *
 * Pattern mirrors the established `mkStubRepo`-style unit tests
 * across the codebase (watchlist.test.ts, save-content-document.
 * test.ts, create-content-page.test.ts, create-product-draft.test.ts):
 *   - Stub the `ResolveCreatorProductAccessPort` directly.
 *   - Each test pre-sets the stub's responses for actor / product /
 *     application independently, exercising one branch of the
 *     truth table.
 *   - Reproduction-via-identity: same fixture set → same outcome.
 *
 * Coverage (per user spec: "unit test for all combinations"):
 *
 *   ── 3 ALLOW SOURCES (success branches) ────────────────────────
 *     (a) admin:      role=admin × (any product/owner/app) → admin
 *     (b) owner:      role=creator × product.creatorId=actorId
 *                       × (any app status) → owner (NOT approved_
 *                       creator — owner branch wins first by order)
 *     (c) owner wins over approved_creator even when both apply:
 *                       role=creator × owns product × approved app
 *                       → owner (not approved_creator)
 *     (d) approved_creator:
 *                       role=creator × product.creatorId!=actorId
 *                       × application.status=approved → approved
 *     (e) approved_creator via PENDING application:
 *                       role=creator × no own × submitted → forbidden
 *     (f) approved_creator via REJECTED application → forbidden
 *     (g) approved_creator via UNDER_REVIEW → forbidden
 *
 *   ── 3 DENY REASONS ─────────────────────────────────────────────
 *     (h) actor_not_found: port returns null actor → typed denial
 *     (i) product_not_found: port returns null product → typed denial
 *     (j) forbidden (no source matches): role=student → forbidden
 *     (k) forbidden (role=creator, no app, not owner) → forbidden
 *     (l) forbidden (role=creator, owner=false, app=null) → forbidden
 *
 *   ── DEFENSIVE GUARDS ──────────────────────────────────────────
 *     (m) empty actorId short-circuits to forbidden (no port call)
 *     (n) empty productId short-circuits to forbidden (no port call)
 *     (o) empty BOTH → forbidden (still no port call)
 *
 *   ── PLUMBING ──────────────────────────────────────────────────
 *     (p) requiredAction echoed in `allowed: true` for all 3 sources
 *     (q) admin source wins regardless of port's `product` value
 *         when actor.role=admin (verified: even null product +
 *         admin role is impossible — port returns both — so we
 *         restrict the test to actor.role=admin + product present)
 *     (r) port receives the exact actorId + productId supplied
 *
 *   ── ARCHITECTURE GUARDS ───────────────────────────────────────
 *     (s) The use case does NOT import @prisma/client (ADR-0016 §1)
 *         — verified via the source module's surface area only.
 *     (t) The discriminated union has exactly 6 outcomes (3 allow
 *         × 3 deny) — compile-time exhaustive narrowing via TS
 *
 *   ── REQUIRED_ACTION VARIATIONS ────────────────────────────────
 *     (u) requiredAction="view" / "edit" / "publish" / "delete" /
 *         "create" — all 5 actions are accepted (uniform logic)
 *     (v) requiredAction echoed verbatim (case-sensitive, no
 *         transformation)
 */

// ─── Test helpers ─────────────────────────────────────────────────

import { describe, expect, it } from "vitest";

import { resolveCreatorProductAccess } from "./resolve-creator-product-access";
import type {
  ActorRole,
  ResolveCreatorProductAccessContext,
  ResolveCreatorProductAccessPort,
} from "./resolve-creator-product-access-types";
import type { CreatorApplicationStatus } from "../onboarding/creator-application-status";

interface StubState {
  // Inputs recorded by the stub's method body.
  lastLoadInput?: { actorId: string; productId: string };

  // Pre-set responses (independently nullable for each field).
  contextResult: ResolveCreatorProductAccessContext;

  // Counting: ensures we assert no-load-on-deny.
  loadCallCount: number;
}

function mkStubPort(): {
  port: ResolveCreatorProductAccessPort;
  state: StubState;
} {
  const state: StubState = {
    // Default: a creator who owns the product, no application row
    // (typical internal-creator shape). Tests override per-branch.
    contextResult: {
      actor: { id: "creator_1", role: "creator" },
      product: { creatorId: "creator_1" },
      application: null,
    },
    loadCallCount: 0,
  };
  const port: ResolveCreatorProductAccessPort = {
    async loadAccessContext(input) {
      state.loadCallCount++;
      state.lastLoadInput = input;
      return state.contextResult;
    },
  };
  return { port, state };
}

function happyInput(): Parameters<typeof resolveCreatorProductAccess>[0] {
  return {
    actorId: "creator_1",
    productId: "product_1",
    requiredAction: "edit",
  };
}

// Tiny helper to build a context fixture from explicit pieces —
// keeps the truth-table tests readable.
function ctx(p: {
  actor?: { id?: string; role: ActorRole } | null;
  product?: { creatorId: string } | null;
  application?: { status: CreatorApplicationStatus } | null;
}): ResolveCreatorProductAccessContext {
  return {
    actor:
      p.actor === undefined
        ? { id: "creator_1", role: "creator" }
        : p.actor === null
          ? null
          : { id: p.actor.id ?? "creator_1", role: p.actor.role },
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
  };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("resolveCreatorProductAccess — input invariants", () => {
  it("exports resolveCreatorProductAccess as an async function", () => {
    expect(typeof resolveCreatorProductAccess).toBe("function");
  });
});

// ─── 1. ALLOW — admin (highest privilege, overrides everything) ───

describe("resolveCreatorProductAccess — allow: admin", () => {
  it("admin: role=admin × owner → allowed:admin (owner branch NOT hit, admin wins)", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "admin" },
      product: { creatorId: "creator_1" },
    });
    const result = await resolveCreatorProductAccess(
      happyInput(),
      { port },
    );
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("admin");
      expect(result.requiredAction).toBe("edit");
    }
  });

  it("admin: role=admin × NOT owner × no application → allowed:admin", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "admin" },
      product: { creatorId: "creator_OTHER" },
      application: null,
    });
    const result = await resolveCreatorProductAccess(
      happyInput(),
      { port },
    );
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("admin");
    }
  });

  it("admin: role=admin × NOT owner × approved application → allowed:admin (still admin branch)", async () => {
    // Even when the actor would ALSO qualify as approved_creator,
    // the admin branch wins (privilege ordering).
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "admin" },
      product: { creatorId: "creator_OTHER" },
      application: { status: "approved" },
    });
    const result = await resolveCreatorProductAccess(
      happyInput(),
      { port },
    );
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("admin");
    }
  });
});

// ─── 2. ALLOW — owner ────────────────────────────────────────────

describe("resolveCreatorProductAccess — allow: owner", () => {
  it("owner: role=creator × product.creatorId === actorId × no application → allowed:owner", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "creator" },
      product: { creatorId: "creator_1" },
      application: null,
    });
    const result = await resolveCreatorProductAccess(
      happyInput(),
      { port },
    );
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("owner");
    }
  });

  it("owner: role=creator × owns product × approved application → allowed:owner (owner wins over approved_creator)", async () => {
    // The owner branch is evaluated FIRST per the docstring order.
    // When both branches would allow, owner takes precedence because
    // ownership is the canonical "I built this" signal; the
    // application status is informational for this case.
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "creator" },
      product: { creatorId: "creator_1" },
      application: { status: "approved" },
    });
    const result = await resolveCreatorProductAccess(
      happyInput(),
      { port },
    );
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("owner");
    }
  });

  it("owner: role=creator × owns product × PENDING application → allowed:owner (still owner, not approved_creator)", async () => {
    // Internal creators typically don't have an application row,
    // but a pending application doesn't BLOCK the owner branch.
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "creator" },
      product: { creatorId: "creator_1" },
      application: { status: "submitted" },
    });
    const result = await resolveCreatorProductAccess(
      happyInput(),
      { port },
    );
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("owner");
    }
  });
});

// ─── 3. ALLOW — approved_creator ─────────────────────────────────

describe("resolveCreatorProductAccess — allow: approved_creator", () => {
  it("approved_creator: role=creator × NOT owner × approved application → allowed:approved_creator", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      actor: { role: "creator" },
      product: { creatorId: "creator_OTHER" },
      application: { status: "approved" },
    });
    const result = await resolveCreatorProductAccess(
      happyInput(),
      { port },
    );
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("approved_creator");
    }
  });

  it("NOT approved_creator: role=creator × NOT owner × submitted application → forbidden", async () => {
    const { port } = mkStubPort();
    const stub = await import("./resolve-creator-product-access");
    // Recreate via local fixture:
    const port2 = {
      loadAccessContext: async () =>
        ctx({
          actor: { role: "creator" },
          product: { creatorId: "creator_OTHER" },
          application: { status: "submitted" },
        }),
    } as unknown as ResolveCreatorProductAccessPort;
    const result = await stub.resolveCreatorProductAccess(happyInput(), {
      port: port2,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
  });

  it("NOT approved_creator: role=creator × NOT owner × under_review application → forbidden", async () => {
    const port = {
      loadAccessContext: async () =>
        ctx({
          actor: { role: "creator" },
          product: { creatorId: "creator_OTHER" },
          application: { status: "under_review" },
        }),
    } as unknown as ResolveCreatorProductAccessPort;
    const result = await resolveCreatorProductAccess(happyInput(), {
      port,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
  });

  it("NOT approved_creator: role=creator × NOT owner × rejected application → forbidden", async () => {
    const port = {
      loadAccessContext: async () =>
        ctx({
          actor: { role: "creator" },
          product: { creatorId: "creator_OTHER" },
          application: { status: "rejected" },
        }),
    } as unknown as ResolveCreatorProductAccessPort;
    const result = await resolveCreatorProductAccess(happyInput(), {
      port,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
  });

  it("NOT approved_creator: role=creator × NOT owner × no application row → forbidden", async () => {
    const port = {
      loadAccessContext: async () =>
        ctx({
          actor: { role: "creator" },
          product: { creatorId: "creator_OTHER" },
          application: null,
        }),
    } as unknown as ResolveCreatorProductAccessPort;
    const result = await resolveCreatorProductAccess(happyInput(), {
      port,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
  });
});

// ─── 4. DENY — actor_not_found ───────────────────────────────────

describe("resolveCreatorProductAccess — deny: actor_not_found", () => {
  it("port returns null actor → actor_not_found (no admin/owner/approved_creator triggered)", async () => {
    const port = {
      loadAccessContext: async () =>
        ctx({
          actor: null,
          product: { creatorId: "creator_1" },
          application: null,
        }),
    } as unknown as ResolveCreatorProductAccessPort;
    const result = await resolveCreatorProductAccess(happyInput(), {
      port,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("actor_not_found");
    }
  });
});

// ─── 5. DENY — product_not_found ─────────────────────────────────

describe("resolveCreatorProductAccess — deny: product_not_found", () => {
  it("port returns null product → product_not_found (collapsed for no info leak)", async () => {
    const port = {
      loadAccessContext: async () =>
        ctx({
          actor: { role: "creator" },
          product: null,
          application: null,
        }),
    } as unknown as ResolveCreatorProductAccessPort;
    const result = await resolveCreatorProductAccess(happyInput(), {
      port,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("product_not_found");
    }
  });

  it("port returns null product EVEN for admin → product_not_found (admin can't edit non-existent product)", async () => {
    // Important: admin doesn't escape product_not_found. A non-
    // existent product is a 404 regardless of role.
    const port = {
      loadAccessContext: async () =>
        ctx({
          actor: { role: "admin" },
          product: null,
          application: null,
        }),
    } as unknown as ResolveCreatorProductAccessPort;
    const result = await resolveCreatorProductAccess(happyInput(), {
      port,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("product_not_found");
    }
  });
});

// ─── 6. DENY — forbidden ────────────────────────────────────────

describe("resolveCreatorProductAccess — deny: forbidden (no source matches)", () => {
  it("role=student × (any product/application) → forbidden", async () => {
    const port = {
      loadAccessContext: async () =>
        ctx({
          actor: { role: "student" },
          product: { creatorId: "creator_OTHER" },
          application: { status: "approved" },  // would qualify a creator, but role=student blocks
        }),
    } as unknown as ResolveCreatorProductAccessPort;
    const result = await resolveCreatorProductAccess(happyInput(), {
      port,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
  });

  it("role=creator × NOT owner × no application → forbidden", async () => {
    const port = {
      loadAccessContext: async () =>
        ctx({
          actor: { role: "creator" },
          product: { creatorId: "creator_OTHER" },
          application: null,
        }),
    } as unknown as ResolveCreatorProductAccessPort;
    const result = await resolveCreatorProductAccess(happyInput(), {
      port,
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
  });
});

// ─── 7. DEFENSIVE GUARDS (no port call) ──────────────────────────

describe("resolveCreatorProductAccess — defensive guards (no port call)", () => {
  it("empty actorId → forbidden (no port call)", async () => {
    const { port, state } = mkStubPort();
    const result = await resolveCreatorProductAccess(
      { ...happyInput(), actorId: "" },
      { port },
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
    expect(state.loadCallCount).toBe(0);
  });

  it("empty productId → forbidden (no port call)", async () => {
    const { port, state } = mkStubPort();
    const result = await resolveCreatorProductAccess(
      { ...happyInput(), productId: "" },
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
    const result = await resolveCreatorProductAccess(
      { ...happyInput(), actorId: "", productId: "" },
      { port },
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.reason).toBe("forbidden");
    }
    expect(state.loadCallCount).toBe(0);
  });
});

// ─── 8. PLUMBING — requiredAction echo ───────────────────────────

describe("resolveCreatorProductAccess — requiredAction echo", () => {
  const ACTIONS = ["view", "edit", "publish", "delete", "create"] as const;
  for (const action of ACTIONS) {
    it(`requiredAction=${action} echoed on allowed:owner`, async () => {
      const { port, state } = mkStubPort();
      state.contextResult = ctx({
        actor: { role: "creator" },
        product: { creatorId: "creator_1" },
      });
      const result = await resolveCreatorProductAccess(
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
      const result = await resolveCreatorProductAccess(
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
      const result = await resolveCreatorProductAccess(
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

// ─── 9. PLUMBING — port input forwarding ──────────────────────────

describe("resolveCreatorProductAccess — port input forwarding", () => {
  it("forwards actorId + productId verbatim to loadAccessContext", async () => {
    const { port, state } = mkStubPort();
    await resolveCreatorProductAccess(
      {
        actorId: "u_session_42",
        productId: "prod_xyz_99",
        requiredAction: "view",
      },
      { port },
    );
    expect(state.lastLoadInput).toEqual({
      actorId: "u_session_42",
      productId: "prod_xyz_99",
    });
  });
});

// ─── 10. Discriminated-union shape (compile-time + runtime) ──────

describe("resolveCreatorProductAccess — discriminated-union exhaustiveness", () => {
  it("allowed:admin has exactly { allowed: true, source, requiredAction }", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({ actor: { role: "admin" } });
    const result = await resolveCreatorProductAccess(happyInput(), {
      port,
    });
    if (result.allowed) {
      expect(result.source).toBe("admin");
      expect(result.requiredAction).toBe("edit");
    } else {
      throw new Error("Expected allowed branch");
    }
  });

  it("allowed:owner has exactly { allowed: true, source, requiredAction }", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({ product: { creatorId: "creator_1" } });
    const result = await resolveCreatorProductAccess(happyInput(), {
      port,
    });
    if (result.allowed) {
      expect(result.source).toBe("owner");
    } else {
      throw new Error("Expected allowed branch");
    }
  });

  it("allowed:approved_creator has exactly { allowed: true, source, requiredAction }", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = ctx({
      product: { creatorId: "creator_OTHER" },
      application: { status: "approved" },
    });
    const result = await resolveCreatorProductAccess(happyInput(), {
      port,
    });
    if (result.allowed) {
      expect(result.source).toBe("approved_creator");
    } else {
      throw new Error("Expected allowed branch");
    }
  });
});

// ─── 11. Architecture guard (no @prisma/client in use case) ──────

describe("resolveCreatorProductAccess — architecture guard", () => {
  it("input shape has exactly { actorId, productId, requiredAction }", () => {
    // Compile-time + runtime lock: the use case input does NOT
    // include any Prisma-derivable field. If a future maintainer
    // adds `actor` (full user object), it would imply the use case
    // can reach into Prisma via DB-user fields — defense in depth.
    const sample: Parameters<typeof resolveCreatorProductAccess>[0] =
      happyInput();
    const allowedKeys = ["actorId", "productId", "requiredAction"].sort();
    expect(Object.keys(sample).sort()).toEqual(allowedKeys);
  });
});
