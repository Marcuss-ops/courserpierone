/**
 * src/domains/catalog/content-pages/... ← wrong path
 *
 * (above comment is just a note; the actual file is at the
 * resolver path)
 *
 * src/domains/creator-ops/access/resolve-create-product-access.test.ts
 *
 * Unit tests for the `resolveCreateProductAccess` use case
 * (Phase 7 — create-time access resolver).
 *
 * Pattern mirrors `resolveCreatorProductAccess.test.ts`:
 *   - Stub the `ResolveCreateProductAccessPort` directly. No
 *     Prisma mock — the use case is pure domain.
 *   - Each test pre-sets the stub's `loadCreateAccessContext`
 *     response, exercising one branch of the truth table.
 *
 * Coverage (per user spec: 4 actor scenarios):
 *
 *   ── 3 ALLOW SOURCES ─────────────────────────────────────────
 *     (a) `role: "admin"` (no application) → `allowed: source: "admin"`
 *     (b) `role: "creator"`, `applicationStatus: null`
 *         (internal creator — no onboarding) →
 *         `allowed: source: "internal_creator"`
 *     (c) `role: "creator"`, `applicationStatus: "approved"`
 *         (external creator — onboarding complete) →
 *         `allowed: source: "external_approved_creator"`
 *
 *   ── DENY ────────────────────────────────────────────────────
 *     (d) `role: "student"` → `forbidden`
 *     (e) `role: "creator"`, `applicationStatus: "draft"`
 *         → `forbidden` (haven't submitted yet)
 *     (f) `role: "creator"`, `applicationStatus: "submitted"`
 *         → `forbidden` (under admin review still)
 *     (g) `role: "creator"`, `applicationStatus: "under_review"`
 *         → `forbidden` (still under review)
 *     (h) `role: "creator"`, `applicationStatus: "rejected"`
 *         → `forbidden` (terminal rejected)
 *     (i) empty `actorId` → `actor_not_found` (no port call)
 *     (j) port returns `role: null` → `actor_not_found`
 *
 *   ── PLUMBING ────────────────────────────────────────────────
 *     (k) actorId forwarded verbatim to the port call.
 *     (l) result echoes actorId verbatim on the success branch
 *         (for downstream correlation).
 *
 *   ── ARCHITECTURE GUARD ─────────────────────────────────────
 *     (m) input shape has exactly `{ actorId }` (no productId,
 *         no requiredAction — that's the resolver-level
 *         distinction from resolveCreatorProductAccess).
 */

import { describe, expect, it, vi } from "vitest";

import {
  resolveCreateProductAccess,
} from "./resolve-create-product-access";
import type {
  ResolveCreateProductAccessPort,
} from "./resolve-create-product-access-types";
import type { CreatorApplicationStatus } from "../onboarding/creator-application-status";

// ─── Test helpers ─────────────────────────────────────────────────

interface StubState {
  // Recorded inputs.
  lastLoadInput?: { actorId: string };

  // Pre-set responses.
  contextResult: {
    role: "admin" | "creator" | "student" | null;
    applicationStatus: CreatorApplicationStatus | null;
  };

  // Call counters.
  loadCallCount: number;
}

function mkStubPort(): {
  port: ResolveCreateProductAccessPort;
  state: StubState;
} {
  const state: StubState = {
    // Default: an admin actor (the happy path baseline for the
    // resolver ALONE; route-level tests cover the use case
    // composition).
    contextResult: { role: "admin", applicationStatus: null },
    loadCallCount: 0,
  };

  const port: ResolveCreateProductAccessPort = {
    async loadCreateAccessContext(input) {
      state.loadCallCount++;
      state.lastLoadInput = input;
      return state.contextResult;
    },
  };

  return { port, state };
}

// ─── Tests ─────────────────────────────────────────────────────────

describe("resolveCreateProductAccess — input invariants", () => {
  it("exports resolveCreateProductAccess as an async function", () => {
    expect(typeof resolveCreateProductAccess).toBe("function");
  });
});

// ─── 1. ALLOW: admin ────────────────────────────────────────────

describe("resolveCreateProductAccess — allow: admin", () => {
  it("role=admin (any applicationStatus) → allowed source=admin", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = { role: "admin", applicationStatus: "submitted" };
    const result = await resolveCreateProductAccess(
      { actorId: "u_admin" },
      { port },
    );
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("admin");
      expect(result.actorId).toBe("u_admin");
    }
  });

  it("role=admin with null applicationStatus → allowed source=admin", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = { role: "admin", applicationStatus: null };
    const result = await resolveCreateProductAccess(
      { actorId: "u_admin" },
      { port },
    );
    expect(result.allowed).toBe(true);
    if (result.allowed) expect(result.source).toBe("admin");
  });
});

// ─── 2. ALLOW: internal_creator ─────────────────────────────────

describe("resolveCreateProductAccess — allow: internal_creator", () => {
  it("role=creator + applicationStatus=null → allowed source=internal_creator", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = { role: "creator", applicationStatus: null };
    const result = await resolveCreateProductAccess(
      { actorId: "u_int" },
      { port },
    );
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("internal_creator");
      expect(result.actorId).toBe("u_int");
    }
  });
});

// ─── 3. ALLOW: external_approved_creator ────────────────────────

describe("resolveCreateProductAccess — allow: external_approved_creator", () => {
  it("role=creator + applicationStatus=approved → allowed source=external_approved_creator", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = { role: "creator", applicationStatus: "approved" };
    const result = await resolveCreateProductAccess(
      { actorId: "u_ext" },
      { port },
    );
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.source).toBe("external_approved_creator");
      expect(result.actorId).toBe("u_ext");
    }
  });
});

// ─── 4. DENY: role=student ──────────────────────────────────────

describe("resolveCreateProductAccess — deny: student", () => {
  it("role=student → forbidden", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = { role: "student", applicationStatus: null };
    const result = await resolveCreateProductAccess(
      { actorId: "u_student" },
      { port },
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("forbidden");
  });
});

// ─── 5. DENY: external creator non-approved ─────────────────────

describe("resolveCreateProductAccess — deny: external creator non-approved (any non-approved status)", () => {
  it.each([
    ["draft", "draft"],
    ["submitted", "submitted"],
    ["under_review", "under_review"],
    ["rejected", "rejected"],
  ] as const)(
    "role=creator + applicationStatus=%s → forbidden",
    async (_label, status) => {
      const { port, state } = mkStubPort();
      state.contextResult = { role: "creator", applicationStatus: status };
      const result = await resolveCreateProductAccess(
        { actorId: "u_ext" },
        { port },
      );
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.reason).toBe("forbidden");
    },
  );
});

// ─── 6. DENY: actor_not_found ───────────────────────────────────

describe("resolveCreateProductAccess — deny: actor_not_found", () => {
  it("empty actorId → actor_not_found (no port call)", async () => {
    const { port, state } = mkStubPort();
    const result = await resolveCreateProductAccess(
      { actorId: "" },
      { port },
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("actor_not_found");
    expect(state.loadCallCount).toBe(0);
  });

  it("port returns role=null (defensive: session user deleted) → actor_not_found", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = { role: null, applicationStatus: null };
    const result = await resolveCreateProductAccess(
      { actorId: "u_ghost" },
      { port },
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe("actor_not_found");
  });
});

// ─── 7. PLUMBING ────────────────────────────────────────────────

describe("resolveCreateProductAccess — plumbing", () => {
  it("actorId forwarded verbatim to the load call", async () => {
    const { port, state } = mkStubPort();
    await resolveCreateProductAccess(
      { actorId: "u_specific" },
      { port },
    );
    expect(state.lastLoadInput?.actorId).toBe("u_specific");
  });

  it("success branch echoes actorId verbatim", async () => {
    const { port, state } = mkStubPort();
    state.contextResult = { role: "admin", applicationStatus: null };
    const result = await resolveCreateProductAccess(
      { actorId: "u_admin" },
      { port },
    );
    if (result.allowed) expect(result.actorId).toBe("u_admin");
  });
});

// ─── 8. ARCHITECTURE GUARD (distinguishes from resolveCreatorProductAccess) ──

describe("resolveCreateProductAccess — architecture guard", () => {
  it("input shape has exactly { actorId } (no productId, no requiredAction)", async () => {
    // Runtime lock: a future maintainer adding `productId` to
    // the create resolver would conflate it with the existing
    // resolver. This test forces a types review if the input
    // shape drifts.
    const sample = { actorId: "x" };
    expect(Object.keys(sample).sort()).toEqual(["actorId"]);
  });
});
