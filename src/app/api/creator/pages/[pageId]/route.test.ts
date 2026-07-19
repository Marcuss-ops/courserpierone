/**
 * src/app/api/creator/pages/[pageId]/route.test.ts
 *
 * Route tests for `PATCH /api/creator/pages/[pageId]`.
 *
 * Pattern mirrors the established route test conventions
 * (vi.hoisted for mock + `mockSessionAs` helper):
 *
 *   - Stub `getServerUser` via `vi.mock("@/lib/supabase/get-user")`.
 *   - Stub the access port + rename port via `__setRouteDeps`.
 *   - Build a Request object + ctx with pageId param per test.
 *   - Call PATCH(req, ctx); assert on response status + body.
 *
 * Coverage (per user spec: "Test su 403, 404, conflict di
 * revision, successo" — adapted to the PATCH endpoint since
 * `renameContentPage` has no revision-based conflict; the
 * semantic-conflict equivalent is `translation_not_found`
 * (the page exists but no translation row exists yet for
 * the resolved locale) which surfaces as 404 + locale echo):
 *
 *   ── 401 (no session) ─────────────────────────────────────────
 *     (a) session helper returns null → 401 unauthenticated.
 *
 *   ── 403 (forbidden) ─────────────────────────────────────────
 *     (b) resolver returns forbidden (no allow source matches).
 *     (c) strict-owner cascade: resolver returns source:admin
 *         but the use case's inline owner check rejects
 *         (actor !== product.creatorId) → 403 (cascade).
 *
 *   ── 404 (not_found) ─────────────────────────────────────────
 *     (d) resolver returns page_not_found → 404.
 *     (e) use case returns translation_not_found (semantic
 *         conflict — page exists but translation row missing)
 *         → 404 + locale echo.
 *     (f) use case returns not_found (defensive).
 *
 *   ── 400 (invalid input) ─────────────────────────────────────
 *     (g) malformed JSON body → 400.
 *     (h) Zod shape violation (extra field: creatorId spoof)
 *         → 400.
 *
 *   ── 422 (invalid_title) ─────────────────────────────────────
 *     (i) use case returns invalid_title → 422 with issues[].
 *
 *   ── 200 (success) ───────────────────────────────────────────
 *     (j) happy path → 200 with title, locale, revision, updatedAt.
 *     (k) locale resolves to product default when omitted.
 *
 *   ── PLUMBING ─────────────────────────────────────────────────
 *     (l) actorId from session + pageId from URL forwarded to
 *         the resolver.
 *     (m) pageProductId from resolver success branch forwarded
 *         into the use case as productId.
 */

import { describe, expect, it, vi } from "vitest";

const { getServerUserMock } = vi.hoisted(() => ({
  getServerUserMock: vi.fn(),
}));
vi.mock("@/lib/supabase/get-user", () => ({
  getServerUser: getServerUserMock,
}));

import { PATCH, __setRouteDeps } from "./route";
import type {
  RenameContentPagePort,
} from "@/domains/catalog/content-pages/rename-content-page-types";
import type {
  ResolveCreatorPageAccessPort,
} from "@/domains/creator-ops/access/resolve-creator-page-access-types";
import type { CreatorApplicationStatus } from "@/domains/creator-ops/onboarding/creator-application-status";

// ─── Test helpers ───────────────────────────────────────────────

function mkSessionUser(actorId: string, role: "admin" | "creator" | "student") {
  return { id: actorId, role, email: `${actorId}@example.com`, name: actorId };
}

function mockSessionAs(actorId: string, role: "admin" | "creator" | "student") {
  getServerUserMock.mockResolvedValue({ dbUser: mkSessionUser(actorId, role) } as any);
}

type AccessContext = {
  actor: { role: "admin" | "creator" | "student" } | null;
  product: { creatorId: string } | null;
  application: { status: string } | null;
  pageProductId: string | null;
};

function mkAccessPort(ctx: AccessContext): ResolveCreatorPageAccessPort & {
  spy: { called: { actorId: string; pageId: string }[] };
} {
  const spy = { called: [] as { actorId: string; pageId: string }[] };
  return {
    async loadPageAccessContext(input) {
      spy.called.push(input);
      // Widen the test fixture `application.status` (which uses
      // `string` for ergonomics) to the strict CreatorApplicationStatus
      // literal union — saves redundant bookkeeping in every test.
      return {
        ...ctx,
        application: ctx.application
          ? { status: ctx.application.status as CreatorApplicationStatus }
          : null,
      } as unknown as Awaited<ResolveCreatorPageAccessPort["loadPageAccessContext"]>;
    },
    spy,
  };
}

type RenameOutcome =
  | {
      ok: true;
      title: string;
      locale: string;
      revision: number;
      updatedAt: Date;
    }
  | {
      ok: false;
      reason: "not_found" | "forbidden" | "invalid_title" | "translation_not_found";
      locale?: string;
      // For invalid_title: ZodError-like object
      error?: { issues: unknown[] };
    };

function mkRenamePort(
  outcome: RenameOutcome,
  pageProductIdToEcho?: string | null,
): RenameContentPagePort & {
  spy: {
    findLocaleOwnerCalls: number;
    findPageProductCalls: number;
    renameCalls: number;
    lastRenameInput?: { pageId: string; locale: string; title: string; now: Date };
  };
} {
  const spy = {
    findLocaleOwnerCalls: 0,
    findPageProductCalls: 0,
    renameCalls: 0,
    lastRenameInput: undefined as
      | { pageId: string; locale: string; title: string; now: Date }
      | undefined,
  };
  return {
    async findProductLocaleAndOwner(input) {
      spy.findLocaleOwnerCalls++;
      void input;
      if (outcome.ok) {
        return { defaultLanguage: "it", creatorId: "u_audit_actor_1" };
      }
      if (outcome.reason === "not_found") {
        return null;
      }
      if (outcome.reason === "forbidden") {
        // Use case inline check: actor !== creatorId → forbidden.
        return { defaultLanguage: "it", creatorId: "u_other_creator" };
      }
      // invalid_title / translation_not_found → owner OK
      return { defaultLanguage: "it", creatorId: "u_audit_actor_1" };
    },
    async findPageProductId(input) {
      spy.findPageProductCalls++;
      void input;
      // Echo the pageProductIdToEcho parameter (forwarded from
      // access.pageProductId via configureRoute) so the use
      // case's inline `pageCtx.productId === input.productId`
      // check passes for plumbing tests.
      if (pageProductIdToEcho !== undefined && pageProductIdToEcho !== null) {
        return { productId: pageProductIdToEcho };
      }
      if (outcome.ok) return { productId: "product_1" };
      if (outcome.reason === "not_found") return null;
      return { productId: "product_1" };
    },
    async renameContentPageTranslation(input) {
      spy.renameCalls++;
      spy.lastRenameInput = input;
      if (outcome.ok) {
        return {
          updated: true,
          title: outcome.title,
          revision: outcome.revision,
          updatedAt: outcome.updatedAt,
        };
      }
      if (outcome.reason === "translation_not_found") {
        return { updated: false, reason: "translation_not_found" };
      }
      if (outcome.reason === "invalid_title") {
        return { updated: false, reason: "translation_not_found" };
      }
      // not_found / forbidden short-circuit upstream
      return { updated: false, reason: "translation_not_found" };
    },
    spy,
  };
}

function mkRequest(body: unknown): Request {
  return new Request("http://localhost/api/creator/pages/page_1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mkBadJsonRequest(): Request {
  return new Request("http://localhost/api/creator/pages/page_1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: "{not valid json",
  });
}

const CTX = { params: { pageId: "page_1" } };

function configureRoute(deps: {
  access: AccessContext;
  outcome: RenameOutcome;
}) {
  const accessPort = mkAccessPort(deps.access);
  // Forward access.pageProductId (which the route forwards to
  // the use case) so mkRenamePort echoes it back, keeping the
  // use case's inline productId match consistent.
  const renamePort = mkRenamePort(deps.outcome, deps.access.pageProductId);
  __setRouteDeps({ accessPort, renamePort });
  return { accessPort, renamePort };
}

const SUCCESS_OUTCOME: RenameOutcome = {
  ok: true,
  title: "New Title",
  locale: "it",
  revision: 7,
  updatedAt: new Date("2026-07-19T00:00:00.000Z"),
  // The plumbing tests use pageProductId: "product_1" matching
  // the default resolveCreatorPageAccess stub echo.
  pageProductId: "product_1",
} as RenameOutcome;

// ─── Tests ──────────────────────────────────────────────────────

describe("PATCH /api/creator/pages/[pageId] — exports", () => {
  it("exports PATCH as an async function", () => {
    expect(typeof PATCH).toBe("function");
  });
});

// ─── 1. AUTHENTICATION — 401 no session ──────────────────────────

describe("PATCH /api/creator/pages/[pageId] — 401 no session", () => {
  it("getServerUser returns null → 401 unauthenticated (resolver NOT called)", async () => {
    getServerUserMock.mockResolvedValue(null);
    const { accessPort } = configureRoute({
      access: {
        actor: null,
        product: null,
        application: null,
        pageProductId: null,
      },
      // Outcome is irrelevant — resolver never gets called.
      outcome: SUCCESS_OUTCOME,
    });
    const res = await PATCH(mkRequest({ newTitle: "T" }), CTX);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("unauthenticated");
    expect(accessPort.spy.called).toHaveLength(0);
  });
});

// ─── 2. 403 FORBIDDEN — resolver or cascade ─────────────────────

describe("PATCH /api/creator/pages/[pageId] — 403 forbidden", () => {
  it("resolver returns forbidden (no allow source matches) → 403", async () => {
    mockSessionAs("u_thief", "creator");
    // Resolver internals return forbidden. We simulate by
    // feeding back a context that does NOT satisfy the 3-source
    // rule: actor exists, role=student (or creator-but-not-owner-
    // without-approved-app).
    const { renamePort } = configureRoute({
      access: {
        actor: { role: "student" },
        product: { creatorId: "u_other_creator" },
        application: { status: "approved" },
        pageProductId: "product_1",
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await PATCH(mkRequest({ newTitle: "T" }), CTX);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("forbidden");
    // Resolver denied; use case never called.
    expect(renamePort.spy.findLocaleOwnerCalls).toBe(0);
  });

  it("strict-owner cascade: resolver returns admin but use case's inline owner check rejects → 403", async () => {
    // The use case file header documents the strict-owner
    // design: admin attempting to edit another creator's page
    // gets resolver source=admin, then cascade 403 from the
    // use case. The route does NOT pre-empt the cascade.
    mockSessionAs("u_admin_not_owner", "admin");
    const { renamePort } = configureRoute({
      access: {
        actor: { role: "admin" },
        product: { creatorId: "u_other_creator" }, // admin doesn't own this product
        application: null,
        pageProductId: "product_1",
      },
      outcome: { ok: false, reason: "forbidden" }, // use case strict-owner cascade
    });
    const res = await PATCH(mkRequest({ newTitle: "T" }), CTX);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("forbidden");
    // Cascade: the use case WAS called (resolver allowed),
    // then it rejected.
    expect(renamePort.spy.findLocaleOwnerCalls).toBe(1);
  });

  it("cascade also for source=approved_creator → use case rejects → 403", async () => {
    mockSessionAs("u_approved", "creator");
    const { renamePort } = configureRoute({
      access: {
        actor: { role: "creator" },
        product: { creatorId: "u_other_creator" },
        application: { status: "approved" }, // approved_creator source
        pageProductId: "product_1",
      },
      outcome: { ok: false, reason: "forbidden" }, // cascade
    });
    const res = await PATCH(mkRequest({ newTitle: "T" }), CTX);
    expect(res.status).toBe(403);
    expect(renamePort.spy.findLocaleOwnerCalls).toBe(1);
  });
});

// ─── 3. 404 NOT_FOUND — resolver or use case ───────────────────

describe("PATCH /api/creator/pages/[pageId] — 404 not_found", () => {
  it("resolver returns page_not_found → 404 (use case NOT called)", async () => {
    mockSessionAs("u_whoever", "creator");
    const { renamePort } = configureRoute({
      access: {
        actor: { role: "creator" },
        product: null,
        application: null,
        pageProductId: null, // page doesn't exist
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await PATCH(mkRequest({ newTitle: "T" }), CTX);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
    expect(renamePort.spy.findLocaleOwnerCalls).toBe(0);
  });

  it("use case returns not_found (defensive race) → 404", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    configureRoute({
      access: {
        actor: { role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
        pageProductId: "product_1",
      },
      outcome: { ok: false, reason: "not_found" },
    });
    const res = await PATCH(mkRequest({ newTitle: "T" }), CTX);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("use case returns translation_not_found → 404 with locale echo (semantic conflict)", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    configureRoute({
      access: {
        actor: { role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
        pageProductId: "product_1",
      },
      outcome: {
        ok: false,
        reason: "translation_not_found",
        locale: "it",
      },
    });
    const res = await PATCH(
      mkRequest({ newTitle: "T", locale: "it" }),
      CTX,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      error: "translation_not_found",
      locale: "it",
    });
  });
});

// ─── 4. 400 INVALID_INPUT ──────────────────────────────────────

describe("PATCH /api/creator/pages/[pageId] — 400 invalid input", () => {
  it("malformed JSON body → 400 invalid_request", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    configureRoute({
      access: {
        actor: { role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
        pageProductId: "product_1",
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await PATCH(mkBadJsonRequest(), CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });

  it("missing newTitle → 400 invalid_request with ZodError issues", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    configureRoute({
      access: {
        actor: { role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
        pageProductId: "product_1",
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await PATCH(mkRequest({ locale: "it" }), CTX);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("extra field (creatorId spoofing attempt) → 400 invalid_request via .strict()", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    configureRoute({
      access: {
        actor: { role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
        pageProductId: "product_1",
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await PATCH(
      mkRequest({
        newTitle: "T",
        creatorId: "u_attacker_override", // attempt to spoof owner
      }),
      CTX,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_request");
  });
});

// ─── 5. 422 INVALID_TITLE — from use case (rare) ────────────────

describe("PATCH /api/creator/pages/[pageId] — 422 invalid_title (use case)", () => {
  it("use case returns invalid_title → 422 with issues[]", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    configureRoute({
      access: {
        actor: { role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
        pageProductId: "product_1",
      },
      outcome: {
        ok: false,
        reason: "invalid_title",
        error: { issues: [{ code: "custom", message: "title flagged" }] },
      },
    });
    const res = await PATCH(mkRequest({ newTitle: "T" }), CTX);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("invalid_title");
    expect(body.issues).toBeDefined();
  });
});

// ─── 6. 200 SUCCESS ─────────────────────────────────────────────

describe("PATCH /api/creator/pages/[pageId] — 200 success", () => {
  it("happy path → 200 with title, locale, revision, updatedAt", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    configureRoute({
      access: {
        actor: { role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
        pageProductId: "product_1",
      },
      outcome: SUCCESS_OUTCOME,
    });
    const res = await PATCH(
      mkRequest({ newTitle: "  New Title  ", locale: "it" }),
      CTX,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.title).toBe("New Title");
    expect(body.locale).toBe("it");
    expect(body.revision).toBe(7);
    expect(body.updatedAt).toBe("2026-07-19T00:00:00.000Z");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("locale omitted → use case resolves to product default (it) → 200 with locale echo", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    configureRoute({
      access: {
        actor: { role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
        pageProductId: "product_1",
      },
      outcome: {
        ok: true,
        title: "Hello",
        locale: "it", // use case echoes resolved default
        revision: 4,
        updatedAt: new Date("2026-07-19T00:00:00.000Z"),
      },
    });
    const res = await PATCH(mkRequest({ newTitle: "Hello" }), CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locale).toBe("it");
  });
});

// ─── 7. PLUMBING — actorId + pageId + pageProductId forwarded ───

describe("PATCH /api/creator/pages/[pageId] — plumbing", () => {
  it("forwards actorId (from session) + pageId (from URL) to resolver", async () => {
    getServerUserMock.mockResolvedValue({
      dbUser: mkSessionUser("u_session_42", "creator"),
    } as any);
    const { accessPort } = configureRoute({
      access: {
        actor: { role: "creator" },
        product: { creatorId: "u_session_42" },
        application: null,
        pageProductId: "product_xyz_99",
      },
      outcome: {
        ok: true,
        title: "T",
        locale: "it",
        revision: 1,
        updatedAt: new Date("2026-07-19T00:00:00.000Z"),
      },
    });
    const res = await PATCH(
      mkRequest({ newTitle: "T" }),
      { params: { pageId: "page_xyz_42" } },
    );
    expect(res.status).toBe(200);
    expect(accessPort.spy.called).toEqual([
      { actorId: "u_session_42", pageId: "page_xyz_42" },
    ]);
  });

  it("pageProductId echoed from resolver is forwarded into use case as productId", async () => {
    mockSessionAs("u_audit_actor_1", "creator");
    const { renamePort } = configureRoute({
      access: {
        actor: { role: "creator" },
        product: { creatorId: "u_audit_actor_1" },
        application: null,
        pageProductId: "product_xyz_99", // comes from resolver
      },
      outcome: {
        ok: true,
        title: "T",
        locale: "it",
        revision: 3,
        updatedAt: new Date("2026-07-19T00:00:00.000Z"),
      },
    });
    const res = await PATCH(mkRequest({ newTitle: "T" }), CTX);
    expect(res.status).toBe(200);
    // The use case's port was called with productId ≈ pageProductId
    // (the resolver's echoed value).
    expect(renamePort.spy.renameCalls).toBe(1);
    expect(renamePort.spy.lastRenameInput?.pageId).toBe("page_1");
  });
});
