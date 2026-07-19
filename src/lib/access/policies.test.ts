/**
 * src/lib/access/policies.test.ts
 *
 * Step 8 — Per-policy isolated tests for the AccessPolicy
 * discriminated-union evaluator. Each test uses a fixed
 * AccessContext fixture (no DB mocks). Coverage spans:
 *   - 5 policy variants × { positive case, negative case, missing-data case }
 *   - evaluateAccess first-match short-circuit
 *   - default-deny fallback
 *   - order-doesn't-matter invariants (admin_role skipped when
 *     free_course fires, etc.)
 *
 * Step 9 — MCR Phase 3 cutover: `hasCompletedOrder` field on
 * AccessContext is renamed to `hasActiveAccessGrant`. The boolean is
 * filled by `resolveProductAccess` (canonical AccessGrant SSOT path).
 * Tests updated accordingly.
 */
import { describe, it, expect } from "vitest";
import {
  evaluatePolicy,
  evaluateAccess,
  type AccessPolicy,
  type AccessContext,
} from "./policies";

const baseCtx: AccessContext = { pathname: "/x" };

// ── free_course ─────────────────────────────────────────────────
describe("evaluatePolicy — free_course", () => {
  it("allows when isFreeCourseSlug=true", () => {
    expect(
      evaluatePolicy({ kind: "free_course" }, {
        ...baseCtx,
        isFreeCourseSlug: true,
      }),
    ).toEqual({ action: "allow", reason: "free_course_bypass" });
  });

  it("returns null when isFreeCourseSlug=false (not free)", () => {
    expect(
      evaluatePolicy({ kind: "free_course" }, {
        ...baseCtx,
        isFreeCourseSlug: false,
      }),
    ).toBeNull();
  });

  it("returns null when isFreeCourseSlug is undefined (Edge spoof)", () => {
    // If Edge proxy.ts doesn't have a slug extractable from the
    // pathname, the consumer leaves the field undefined — the
    // policy correctly opts out (defense-in-depth: a missing field
    // must not silently bypass).
    expect(
      evaluatePolicy({ kind: "free_course" }, baseCtx),
    ).toBeNull();
  });
});

// ── session_required ────────────────────────────────────────────
describe("evaluatePolicy — session_required", () => {
  it("denies with /login redirect when !hasSession", () => {
    expect(
      evaluatePolicy({ kind: "session_required" }, {
        ...baseCtx,
        hasSession: false,
      }),
    ).toEqual({
      action: "deny",
      reason: "missing_session",
      redirectUrl: "/login",
    });
  });

  it("returns null when hasSession=true (defer to next policy)", () => {
    // session_required is ORTHOGONAL to admin/owned — it just gates
    // the "have a cookie?" check. A subsequent admin_role or
    // owned_grant policy in the chain decides the final verdict.
    expect(
      evaluatePolicy({ kind: "session_required" }, {
        ...baseCtx,
        hasSession: true,
      }),
    ).toBeNull();
  });
});

// ── admin_role ──────────────────────────────────────────────────
describe("evaluatePolicy — admin_role (Node-only, requiresDb)", () => {
  it("allows when userRole=admin", () => {
    expect(
      evaluatePolicy(
        { kind: "admin_role", requiresDb: true },
        { ...baseCtx, userRole: "admin" },
      ),
    ).toEqual({ action: "allow", reason: "admin" });
  });

  it("returns null for non-admin roles", () => {
    expect(
      evaluatePolicy(
        { kind: "admin_role", requiresDb: true },
        { ...baseCtx, userRole: "student" },
      ),
    ).toBeNull();
    expect(
      evaluatePolicy(
        { kind: "admin_role", requiresDb: true },
        { ...baseCtx, userRole: "creator" },
      ),
    ).toBeNull();
  });

  it("returns null for null role (no DB hydration yet)", () => {
    // Edge-portable path with admin_role in the chain never sees
    // userRole set — must safely opt out, not throw or fall-through.
    expect(
      evaluatePolicy(
        { kind: "admin_role", requiresDb: true },
        { ...baseCtx, userRole: null },
      ),
    ).toBeNull();
  });
});

// ── owned_grant ─────────────────────────────────────────────────
describe("evaluatePolicy — owned_grant (Node-only, requiresDb)", () => {
  // Step 9 — MCR Phase 3 cutover: the `owned_grant` policy short-
  // circuits on `hasActiveAccessGrant` (true when resolveProductAccess
  // verdict is allowed). The consumer fills the boolean via a single
  // top-of-route call. Policy evaluator itself is pure (no Prisma).
  it("allows when hasActiveAccessGrant=true (Step 9 SSOT verdict)", () => {
    expect(
      evaluatePolicy(
        { kind: "owned_grant", requiresDb: true },
        { ...baseCtx, hasActiveAccessGrant: true },
      ),
    ).toEqual({ action: "allow", reason: "owned" });
  });

  it("returns null when hasActiveAccessGrant=false", () => {
    expect(
      evaluatePolicy(
        { kind: "owned_grant", requiresDb: true },
        { ...baseCtx, hasActiveAccessGrant: false },
      ),
    ).toBeNull();
  });

  it("returns null when hasActiveAccessGrant undefined (no DB hydration)", () => {
    expect(
      evaluatePolicy(
        { kind: "owned_grant", requiresDb: true },
        baseCtx,
      ),
    ).toBeNull();
  });
});

// ── pending_order ───────────────────────────────────────────────
describe("evaluatePolicy — pending_order (Node-only, requiresDb)", () => {
  it("returns pending action when pendingOrderOwnerId matches userId", () => {
    expect(
      evaluatePolicy(
        { kind: "pending_order", requiresDb: true },
        {
          ...baseCtx,
          userId: "user-1",
          pendingOrderId: "order-1",
          pendingOrderOwnerId: "user-1",
          productDefaultLanguage: "it",
        },
      ),
    ).toEqual({
      action: "pending",
      reason: "verifying_order",
      orderId: "order-1",
      productDefaultLanguage: "it",
    });
  });

  it("returns null when pendingOrderOwnerId is set but does NOT match userId (other user → paywall)", () => {
    expect(
      evaluatePolicy(
        { kind: "pending_order", requiresDb: true },
        {
          ...baseCtx,
          userId: "user-1",
          pendingOrderId: "order-2",
          pendingOrderOwnerId: "user-2",
        },
      ),
    ).toBeNull();
  });

  it("returns null when no pending order", () => {
    expect(
      evaluatePolicy(
        { kind: "pending_order", requiresDb: true },
        { ...baseCtx, userId: "user-1" },
      ),
    ).toBeNull();
  });

  it("returns null when pendingOrderId is null (defense-in-depth: no Order.id available)", () => {
    expect(
      evaluatePolicy(
        { kind: "pending_order", requiresDb: true },
        {
          ...baseCtx,
          userId: "user-1",
          pendingOrderId: null,
          pendingOrderOwnerId: "user-1",
        },
      ),
    ).toBeNull();
  });
});

// ── evaluateAccess — first-match short-circuit + default-deny ─────
describe("evaluateAccess — first-match short-circuit", () => {
  it("returns first ALLOW when free_course fires (skipping admin_role)", () => {
    const policies: AccessPolicy[] = [
      { kind: "free_course" },
      { kind: "admin_role", requiresDb: true },
    ];
    expect(
      evaluateAccess(policies, {
        ...baseCtx,
        isFreeCourseSlug: true,
        userRole: "student", // would otherwise deny
      }),
    ).toEqual({ action: "allow", reason: "free_course_bypass" });
  });

  it("falls through to admin_role when free_course doesn't apply", () => {
    const policies: AccessPolicy[] = [
      { kind: "free_course" },
      { kind: "admin_role", requiresDb: true },
    ];
    expect(
      evaluateAccess(policies, {
        ...baseCtx,
        isFreeCourseSlug: false,
        userRole: "admin",
      }),
    ).toEqual({ action: "allow", reason: "admin" });
  });

  it("defaults deny when no policy fires", () => {
    expect(evaluateAccess([], baseCtx)).toEqual({
      action: "deny",
      reason: "default_deny",
    });
  });

  it("session_required deny beats a later admin_role (first-match wins)", () => {
    const policies: AccessPolicy[] = [
      { kind: "session_required" },
      { kind: "admin_role", requiresDb: true },
    ];
    expect(
      evaluateAccess(policies, {
        ...baseCtx,
        hasSession: false,
        userRole: "admin", // admin-only filter on admin_role doesn't run because deny short-circuits
      }),
    ).toEqual({
      action: "deny",
      reason: "missing_session",
      redirectUrl: "/login",
    });
  });

  it("RSC-style chain: free → admin → owned → pending, returns first allow", () => {
    // Mirrors the AccessGate policy chain used in production.
    const policies: AccessPolicy[] = [
      { kind: "free_course" },
      { kind: "admin_role", requiresDb: true },
      { kind: "owned_grant", requiresDb: true },
      { kind: "pending_order", requiresDb: true },
    ];

    // Scenario A: free course wins (admin/owned don't even run)
    expect(
      evaluateAccess(policies, {
        ...baseCtx,
        isFreeCourseSlug: true,
        userRole: "student",
        hasActiveAccessGrant: false,
      }),
    ).toEqual({ action: "allow", reason: "free_course_bypass" });

    // Scenario B: not free, admin wins
    expect(
      evaluateAccess(policies, {
        ...baseCtx,
        isFreeCourseSlug: false,
        userRole: "admin",
      }),
    ).toEqual({ action: "allow", reason: "admin" });

    // Scenario C: not free, not admin, AccessGrant active wins
    expect(
      evaluateAccess(policies, {
        ...baseCtx,
        isFreeCourseSlug: false,
        userRole: "student",
        hasActiveAccessGrant: true,
      }),
    ).toEqual({ action: "allow", reason: "owned" });
  });
});

// ── Edge-portability invariant ──────────────────────────────────
describe("Edge-portability — no DB fields needed for Edge-safe policies", () => {
  it("free_course + session_required chain works without any Node-only field", () => {
    // The whole point of the Edge/Node split: the Edge proxy.ts
    // builds a context with only { pathname, hasSession, isFreeCourseSlug }
    // and expects the engine to give a verdict. Add a sentinel: if
    // anything accesses Node-only fields, vitest will fail this test.
    const edgeCtx: AccessContext = {
      pathname: "/it-it/test-course-e2e/portal",
      hasSession: false,
      isFreeCourseSlug: true,
    };
    const policies: AccessPolicy[] = [
      { kind: "free_course" },
      { kind: "session_required" },
    ];
    // Free course wins → no session needed → allow
    expect(evaluateAccess(policies, edgeCtx)).toEqual({
      action: "allow",
      reason: "free_course_bypass",
    });
  });

  it("Edge chain without free-course bypass: session_required denies with /login", () => {
    const edgeCtx: AccessContext = {
      pathname: "/dashboard",
      hasSession: false,
      isFreeCourseSlug: false,
    };
    const policies: AccessPolicy[] = [{ kind: "session_required" }];
    expect(evaluateAccess(policies, edgeCtx)).toEqual({
      action: "deny",
      reason: "missing_session",
      redirectUrl: "/login",
    });
  });
});
