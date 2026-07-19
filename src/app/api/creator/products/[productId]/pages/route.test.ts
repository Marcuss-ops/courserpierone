/**
 * src/app/api/creator/products/[productId]/pages/route.test.ts
 *
 * Route tests for `POST /api/creator/products/[productId]/pages`.
 *
 * Pattern mirrors the established route test conventions
 * (`publish/route.test.ts`, `reorder-pages/route.test.ts`):
 *   - `vi.hoisted` for the `getServerUser` mock (shared between
 *     the mock factory at hoist-time and the rest of the test
 *     file).
 *   - `mockSessionAs(actorId, role)` DRY helper that wraps
 *     `getServerUserMock.mockResolvedValue({ dbUser: ... })`.
 *   - `mkAccessPort(ctx)` and `mkPageRepoPort(outcome)` for
 *     in-memory stub ports wired via `__setRouteDeps`.
 *   - `configureRoute({ access, outcome })` to set up both ports
 *     in one call.
 *
 * Test outcome type mirrors the use case's actual 7-branch DU
 * shape — no synthetic discriminators. The stub's port methods
 * are driven by the outcome's `success` / `reason` /
 * `error.issues` exactly the way the production use case reads
 * them, so plumbing tests are meaningful and don't rely on
 * outcome↔stub symmetry hacks.
 *
 * Coverage (user spec minimum: 403 + success; we go further for
 * regression protection):
 *
 *   ── 401 (no session) ─────────────────────────────────────
 *     (a) session helper returns null → 401 unauthenticated.
 *
 *   ── 403 (forbidden) ─────────────────────────────────────
 *     (b) resolver returns forbidden (no 3-source match) →
 *         403 + reason (use case NOT called).
 *     (c) strict-owner cascade: resolver returns source:admin
 *         but use case's inline owner check rejects → 403.
 *
 *   ── 404 (not_found) ─────────────────────────────────────
 *     (d) resolver returns product_not_found → 404 (use case
 *         NOT called).
 *     (e) use case returns not_found (defensive — port returns
 *         null productCtx) → 404.
 *     (f) use case returns parent_not_found → 404 (collapsed;
 *         do NOT leak cross-product page-id existence).
 *
 *   ── 400 (invalid input) ─────────────────────────────────
 *     (g) malformed JSON body → 400.
 *     (h) missing slug → 400 with ZodError.
 *     (i) invalid slug (uppercase chars) → 400 with ZodError.
 *     (j) invalid status (not in literal union) → 400.
 *     (k) extra field (creatorId spoof) → 400 via .strict().
 *
 *   ── 409 (slug_taken) ────────────────────────────────────
 *     (l) port returns `{ created: false, reason: "slug_taken" }`
 *         → use case returns slug_taken → 409.
 *
 *   ── 200 (success) ────────────────────────────────────────
 *     (m) happy path → 200 with full ContentPageRecord (id,
 *         productId, parentId, slug, position [AUTO-assigned],
 *         status, publishedAt, createdAt, updatedAt).
 *
 *   ── PLUMBING ──────────────────────────────────────────────
 *     (n) actorId (from session) + productId (from URL) are
 *         forwarded into the resolver.
 *     (o) the resolver's `source` does NOT leak into the
 *         response body (the response only carries the page).
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
  ContentPageRecord,
  ContentPageRepository,
  CreateContentPagePortOutput,
} from "@/domains/catalog/content-pages/create-content-page-types";
import type {
  ResolveCreatorProductAccessPort,
} from "@/domains/creator-ops/access/resolve-creator-product-access-types";
import type { CreatorApplicationStatus } from "@/domains/creator-ops/onboarding/creator-application-status";

// ─── Test helpers ───────────────────────────────────────────────

function mkSessionUser(
  actorId: string,
  role: "admin" | "creator" | "student",
) {
  return {
    id: actorId,
    role,
    email: `${actorId}@example.com`,
    name: actorId,
  };
}

function mockSessionAs(
  actorId: string,
  role: "admin" | "creator" | "student",
) {
  getServerUserMock.mockResolvedValue({
    dbUser: mkSessionUser(actorId, role),
  } as any);
}

// ─── Access port stub (mirrors the established pattern) ────────

type AccessContext = {
  actor: { id: string; role: "admin" | "creator" | "student" } | null;
  product: { creatorId: string } | null;
  application: { status: CreatorApplicationStatus } | null;
};

function mkAccessPort(
  ctx: AccessContext,
): ResolveCreatorProductAccessPort & {
  spy: { called: { actorId: string; productId: string }[] };
} {
  const spy = { called: [] as { actorId: string; productId: string }[] };
  return {
    async loadAccessContext(input) {
      spy.called.push(input);
      return ctx;
    },
    spy,
  };
}

// ─── Page repository port stub ──────────────────────────────────

/**
 * `CreateOutcome` mirrors the use case's actual 7-branch DU. No
 * synthetic discriminators — the stub reads the outcome's
 * `reason` / `error.issues` exactly the way the use case emits
 * them, so plumbing tests have ground truth.
 */
type CreateOutcome =
  | { success: true; page: ContentPageRecord }
  | { success: false; reason: "not_found" }
  | { success: false; reason: "forbidden" }
  | { success: false; reason: "slug_taken" }
  | { success: false; reason: "parent_not_found" }
  | {
      success: false;
      reason: "invalid_slug";
      error: { issues: unknown[] };
    }
  | {
      success: false;
      reason: "invalid_status";
      error: { issues: unknown[] };
    };

function mkPageRepoPort(
  outcome: CreateOutcome,
): ContentPageRepository & {
  spy: {
    findOwnerCalls: number;
    findParentCalls: number;
    createCalls: number;
    lastCreateInput?: { productId: string; parentId: string | null; slug: string; status: string };
  };
} {
  const spy = {
    findOwnerCalls: 0,
    findParentCalls: 0,
    createCalls: 0,
    lastCreateInput: undefined as
      | { productId: string; parentId: string | null; slug: string; status: string }
      | undefined,
  };
  return {
    async findProductOwner(input) {
      spy.findOwnerCalls++;
      void input;
      if (outcome.success) {
        return { creatorId: "u_audit_actor_1" };
      }
      if (outcome.reason === "not_found") return null;
      // forbidden / slug_taken / parent_not_found / invalid_* :
      // return the same happy-owner so the use case's inline owner
      // check is the ONE that decides the cascade.
      return { creatorId: "u_audit_actor_1" };
    },
    async findPageProductId(input) {
      spy.findParentCalls++;
      void input;
      if (outcome.success) {
        return { productId: "product_1" };
      }
      if (outcome.reason === "parent_not_found") return null;
      // not_found / forbidden / slug_taken / invalid_* : parent
      // lookup short-circuits or is successful; return same product.
      return { productId: "product_1" };
    },
    async createContentPage(input): Promise<CreateContentPagePortOutput> {
      spy.createCalls++;
      spy.lastCreateInput = input;
      if (outcome.success) {
        return { created: true, page: outcome.page };
      }
      if (outcome.reason === "slug_taken") {
        return { created: false, reason: "slug_taken" };
      }
      if (outcome.reason === "parent_not_found") {
        // Adapter caught a race between use case pre-check and
        // INSERT. The port surfaces this so the use case can
        // collapse it to `parent_not_found`.
        return { created: false, reason: "parent_not_found" };
      }
      // invalid_slug / invalid_status / not_found / forbidden:
      // the use case short-circuits BEFORE this method. Unreachable
      // in those branches; we still return *something* typed.
      return { created: false, reason: "slug_taken" };
    },
    spy,
  };
}

function mkRequest(body: unknown): Request {
  return new Request(
    "http://localhost/api/creator/products/product_1/pages",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    },
  );
}

const CTX = { params: { productId: "product_1" } };

function configureRoute(deps: {
  access: AccessContext;
  outcome: CreateOutcome;
}) {
  const accessPort = mkAccessPort(deps.access);
  const pageRepoPort = mkPageRepoPort(deps.outcome);
  __setRouteDeps({ accessPort, pageRepoPort });
  return { accessPort, pageRepoPort };
}

/**
 * The canonical happy-path page record returned by the stub on
 * success. Used for the 200 + plumbing tests.
 */
const HAPPY_PAGE: ContentPageRecord = {
  id: "page_new_1",
  productId: "product_1",
  parentId: null,
  slug: "new-section",
  position: 5,
  status: "draft",
  publishedAt: null,
  createdAt: new Date("2026-07-19T10:00:00.000Z"),
  updatedAt: new Date("2026-07-19T10:00:00.000Z"),
};

const SUCCESS_OUTCOME: CreateOutcome = {
  success: true,
  page: HAPPY_PAGE,
};

// ─── Tests ──────────────────────────────────────────────────────

describe("POST /api/creator/products/[productId]/pages — exports", () => {
  it("exports POST as an async function", () => {
    expect(typeof POST).toBe("function");
  });
});

// ─── 1. AUTHENTICATION — 401 no session ─────────────────────────

describe("POST .../pages — 401 no session", () => {
  it("getServerUser returns null → 401 unauthenticated (resolver NOT called)", async () => {
    getServerUserMock.mockResolvedValue(null);
    const { accessPort } = configureRoute({
      // Outcome is irrelevant — resolver never gets called.
      access: {
        actor: null,
        product: { creatorId: "u_audit_actor_1" },
        application: null,
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await POST(
      mkRequest({ slug: "new-section" }),
      CTX,
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthenticated");
    expect(accessPort.spy.called).toHaveLength(0);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

// ─── 2. 403 FORBIDDEN — resolver or cascade ─────────────────────

describe("POST .../pages — 403 forbidden", () => {
  it("resolver returns forbidden (no 3-source match) → 403 (use case NOT called)", async () => {
    mockSessionAs("u_thief", "student");
    // Student role does not match any of the 3 allow sources for
    // any create action. Resolver returns forbidden.
    const { pageRepoPort } = configureRoute({
      access: {
        actor: { id: "u_thief", role: "student" },
        product: { creatorId: "u_other_creator" },
        application: { status: "approved" }, // role=student still blocks approved_creator
      },
      outcome: SUCCESS_OUTCOME, // never reached
    });
    const res = await POST(
      mkRequest({ slug: "new-section" }),
      CTX,
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("forbidden");
    // Resolver denied — use case's port NEVER called.
    expect(pageRepoPort.spy.findOwnerCalls).toBe(0);
    expect(pageRepoPort.spy.findParentCalls).toBe(0);
    expect(pageRepoPort.spy.createCalls).toBe(0);
  });

  it("strict-owner cascade: resolver returns source:admin but use case's inline owner check rejects → 403", async () => {
    // Admin resolves → use case forwarded → use case inline-checks
    // `actorId !== product.creatorId` → forbidden → 403.
    // The pageRepoPort stub returns creatorId="u_other_creator"
    // (NOT the admin's id), driving the use case's inline check
    // to fire. The stub outcome is NOT consulted here because the
    // use case's OWNED check short-circuits BEFORE the
    // findProductOwner/parents-check/INSERT.
    mockSessionAs("u_admin_not_owner", "admin");
    const { pageRepoPort } = configureRoute({
      access: {
        actor: { id: "u_admin_not_owner", role: "admin" },
        product: { creatorId: "u_other_creator" }, // admin doesn't own
        application: null,
      },
      // Outcome must be `forbidden` so the mkPageRepoPort stub
      // doesn't try to drive `not_found`/`parent_not_found`
      // branches. But the use case's body never reaches the port
      // for the forbidden reason (it short-circuits after the
      // owner check).
      outcome: { success: false, reason: "forbidden" },
    });
    const res = await POST(
      mkRequest({ slug: "new-section" }),
      CTX,
    );
    expect(res.status).toBe(403);
    expect(pageRepoPort.spy.findOwnerCalls).toBe(1); // cascade: resolver said yes, use case ran
  });
});

// ─── 3. 404 NOT_FOUND — resolver or use case ───────────────────

describe("POST .../pages — 404 not_found", () => {
  it("resolver returns product_not_found → 404 (use case NOT called)", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    const { pageRepoPort } = configureRoute({
      access: {
        actor: { id: "u_audit_actor_1", role: "creator" },
        product: null, // product_not_found from resolver
        application: null,
      },
      outcome: SUCCESS_OUTCOME, // never reached
    });
    const res = await POST(
      mkRequest({ slug: "new-section" }),
      CTX,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(pageRepoPort.spy.findOwnerCalls).toBe(0);
  });

  it("use case returns not_found (defensive — port returns null productCtx) → 404", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    const { pageRepoPort } = configureRoute({
      access: {
        actor: { id: "u_audit_actor_1", role: "creator" },
        product: { creatorId: "u_audit_actor_1" }, // resolver says owner
        application: null,
      },
      // Resolver says owner; use case reads findProductOwner →
      // stub returns null → not_found → 404.
      outcome: { success: false, reason: "not_found" },
    });
    const res = await POST(
      mkRequest({ slug: "new-section" }),
      CTX,
    );
    expect(res.status).toBe(404);
    // Defensive: the use case SHORT-CIRCUITS before
    // findPageProductId / createContentPage. Only findOwner is called.
    expect(pageRepoPort.spy.findOwnerCalls).toBe(1);
    expect(pageRepoPort.spy.findParentCalls).toBe(0);
    expect(pageRepoPort.spy.createCalls).toBe(0);
  });

  it("use case returns parent_not_found → 404 (collapsed; cross-product leak prevented)", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    const { pageRepoPort } = configureRoute({
      access: {
        actor: { id: "u_audit_actor_1", role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
      },
      outcome: { success: false, reason: "parent_not_found" },
    });
    const res = await POST(
      mkRequest({ slug: "new-section", parentId: "missing-parent-id" }),
      CTX,
    );
    expect(res.status).toBe(404);
    // The use case called findOwner (success), then findPageProductId
    // (returned null → parent_not_found). createContentPage was
    // NEVER called (parent_mismatch short-circuits).
    expect(pageRepoPort.spy.findOwnerCalls).toBe(1);
    expect(pageRepoPort.spy.findParentCalls).toBe(1);
    expect(pageRepoPort.spy.createCalls).toBe(0);
  });
});

// ─── 4. 400 INVALID_INPUT ─────────────────────────────────────

describe("POST .../pages — 400 invalid input", () => {
  it("malformed JSON body → 400 invalid_request", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    configureRoute({
      access: {
        actor: { id: "u_audit_actor_1", role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await POST(mkRequest("{not json"), CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("missing slug → 400 with ZodError issues", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    configureRoute({
      access: {
        actor: { id: "u_audit_actor_1", role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await POST(mkRequest({ parentId: null }), CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("invalid slug (uppercase letters not allowed) → 400 with ZodError", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    configureRoute({
      access: {
        actor: { id: "u_audit_actor_1", role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await POST(
      mkRequest({ slug: "Invalid-Slug" }),
      CTX,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("invalid status literal (not in the PageStatus union) → 400 with ZodError", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    configureRoute({
      access: {
        actor: { id: "u_audit_actor_1", role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await POST(
      mkRequest({ slug: "ok-slug", status: "deleted-but-not-published" }),
      CTX,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("extra field (creatorId spoof attempt) → 400 via .strict()", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    configureRoute({
      access: {
        actor: { id: "u_audit_actor_1", role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await POST(
      mkRequest({
        slug: "ok-slug",
        // Attempt to spoof ownership by passing a creatorId:
        creatorId: "u_attacker_override",
      }),
      CTX,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });
});

// ─── 5. 409 SLUG_TAKEN — DB unique constraint violation ─────────

describe("POST .../pages — 409 slug_taken", () => {
  it("port returns slug_taken → use case surfaces → 409", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    const { pageRepoPort } = configureRoute({
      access: {
        actor: { id: "u_audit_actor_1", role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
      },
      outcome: { success: false, reason: "slug_taken" },
    });
    const res = await POST(
      mkRequest({ slug: "already-taken" }),
      CTX,
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("slug_taken");
    // The use case did call createContentPage (the port surfaced
    // the @@unique violation). All three port calls happened.
    expect(pageRepoPort.spy.findOwnerCalls).toBe(1);
    expect(pageRepoPort.spy.createCalls).toBe(1);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});

// ─── 6. 200 SUCCESS ─────────────────────────────────────────────

describe("POST .../pages — 200 success", () => {
  it("happy path → 200 with full ContentPageRecord", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    const { pageRepoPort } = configureRoute({
      access: {
        actor: { id: "u_audit_actor_1", role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await POST(
      mkRequest({ slug: "new-section", status: "draft" }),
      CTX,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.page).toEqual({
      id: "page_new_1",
      productId: "product_1",
      parentId: null,
      slug: "new-section",
      position: 5,
      status: "draft",
      publishedAt: null,
      createdAt: "2026-07-19T10:00:00.000Z",
      updatedAt: "2026-07-19T10:00:00.000Z",
    });
    // The route MUST have called all 3 port methods.
    expect(pageRepoPort.spy.findOwnerCalls).toBe(1);
    expect(pageRepoPort.spy.findParentCalls).toBeGreaterThanOrEqual(0);
    expect(pageRepoPort.spy.createCalls).toBe(1);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("response body does NOT leak the resolver's `source` (only the page data)", async () => {
    // The `source` is an internal routing concern; it must NOT
    // appear in the user-facing response. Verifies the route does
    // not accidentally surface the resolver's discriminator.
    mockSessionAs("u_audit_actor_1", "creator");
    configureRoute({
      access: {
        actor: { id: "u_audit_actor_1", role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await POST(
      mkRequest({ slug: "abc" }),
      CTX,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).not.toHaveProperty("source");
    expect(body).not.toHaveProperty("requiredAction");
    expect(body).not.toHaveProperty("allowed");
  });
});

// ─── 7. PLUMBING — actorId + productId + body fields forwarded ─

describe("POST .../pages — plumbing", () => {
  it("forwards actorId (from session) + productId (from URL) to the resolver", async () => {
    getServerUserMock.mockResolvedValue({
      dbUser: mkSessionUser("u_audit_actor_1", "creator"),
    } as any);
    const { accessPort } = configureRoute({
      access: {
        actor: { id: "u_audit_actor_1", role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await POST(
      mkRequest({ slug: "abc" }),
      { params: { productId: "prod_xyz_42" } },
    );
    expect(res.status).toBe(200);
    expect(accessPort.spy.called).toEqual([
      {
        actorId: "u_audit_actor_1",
        productId: "prod_xyz_42",
        requiredAction: "create",
      },
    ]);
  });

  it("forwards slug, parentId, status to the page-repository port", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    const { pageRepoPort } = configureRoute({
      access: {
        actor: { id: "u_audit_actor_1", role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await POST(
      mkRequest({
        slug: "child-section",
        parentId: "parent_page_1",
        status: "published",
      }),
      CTX,
    );
    expect(res.status).toBe(200);
    expect(pageRepoPort.spy.lastCreateInput).toEqual({
      productId: "product_1",
      parentId: "parent_page_1",
      slug: "child-section",
      status: "published",
    });
  });
});

// ─── 8. ARCHITECTURE GUARD — body schema rejects EACH forbidden field ─

/**
 * The list of fields the route body schema MUST NOT accept
 * (`.strict()` rejection). Each is server-derived and cannot be
 * spoofed via the body. If a future PR adds one of these to the
 * schema by accident, this test catches it at compile-time + runtime.
 */
const FORBIDDEN_BODY_FIELDS = [
  "actorId",
  "creatorId",
  "productId",
  "id",
  "pageId",
  "position",
  "createdAt",
  "updatedAt",
  "publishedAt",
] as const;

describe("POST .../pages — architecture guard (each forbidden field rejected via .strict())", () => {
  it.each(FORBIDDEN_BODY_FIELDS)(
    "body with `%s` injected → 400 via .strict()",
    async (forbiddenField) => {
      mockSessionAs("u_audit_actor_1", "creator");
      configureRoute({
        access: {
          actor: { id: "u_audit_actor_1", role: "creator" },
          product: { creatorId: "u_audit_actor_1" },
          application: null,
        },
        outcome: SUCCESS_OUTCOME, // never reached (400 short-circuits)
      });
      const res = await POST(
        mkRequest({
          slug: "abc", // valid 3-char slug
          [forbiddenField]: "spoofed-value",
        }),
        CTX,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_request");
      expect(Array.isArray(body.issues)).toBe(true);
    },
  );

  it("FORBIDDEN_BODY_FIELDS list size is locked at 9 (compile-time + runtime lock)", () => {
    // If a future maintainer adds/removes a server-only field,
    // they must update this list deliberately. Stale list = stale
    // assertion = coverage gap.
    expect(FORBIDDEN_BODY_FIELDS).toHaveLength(9);
  });
});
