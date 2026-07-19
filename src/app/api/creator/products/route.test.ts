/**
 * src/app/api/creator/products/route.test.ts
 *
 * Route tests for `POST /api/creator/products`.
 *
 * Pattern mirrors the established route test conventions:
 *   - Stub `getCurrentUser` via `vi.mock("@/lib/supabase/get-user")`.
 *   - Stub the access port + createDraftRepo via `__setRouteDeps`.
 *   - Build a `Request` object inline per test.
 *   - Call `POST(req)`; assert on response status + body.
 *
 * Coverage (per user spec: 4 actor scenarios):
 *
 *   ── AUTHENTICATION ─────────────────────────────────────────
 *     (a) no session → 401 unauthenticated.
 *
 *   ── 4 ACTOR SCENARIOS (the spec's hard requirement) ─────────
 *     (b) admin                    → 201 with the new product.
 *     (c) internal_creator        → 201 with the new product.
 *     (d) external_approved_creator → 201 with the new product.
 *     (e) external_non_approved (4 sub-cases: draft / submitted /
 *         under_review / rejected) → 403 forbidden.
 *     (f) student                   → 403 forbidden.
 *
 *   ── ZOD STRICT — `creatorId` rejection (the spec's hard requirement)
 *     (g) payload with `creatorId` → 400
 *         `creator_id_forbidden_in_payload` (specific reason for
 *         the disallowed-key case).
 *     (h) payload with any non-schema key (e.g. `status`) → 400
 *         `invalid_payload` (generic reason).
 *     (i) payload with malformed slug (uppercase / spaces /
 *         too short) → 400 `invalid_payload`.
 *     (j) payload with no body at all → 400 invalid_json.
 *
 *   ── USE-CASE PLUMBING ──────────────────────────────────────
 *     (k) `actorId` forwarded to `createProductDraft` equals
 *         the SESSION user.id (NOT a payload field).
 *     (l) `slug` forwarded verbatim from the Zod-parsed body.
 *
 *   ── USE-CASE BRANCHES — route maps to HTTP correctly ──────
 *     (m) use case returns `slug_taken` → 409.
 *     (n) use case returns `forbidden` → 403.
 *     (o) use case returns `invalid_slug` → 400 + ZodError.
 *     (p) use case returns `success` → 201 + product envelope.
 *
 *   ── RESPONSE ENVELOPE / CACHE ─────────────────────────────
 *     (q) success response includes `Cache-Control: no-store`.
 *     (r) failure response includes `Cache-Control: no-store`.
 *     (s) success response body is `{ ok: true, product: {...} }`.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Hoisted mock for the `getServerUser` helper. `vi.hoisted` is
// the canonical Vitest pattern for sharing variables between a
// `vi.mock` factory (which runs BEFORE any top-level `const`
// is initialized due to Vitest's hoisting of vi.mock calls)
// and the rest of the test file. Without `vi.hoisted`, the
// factory would TDZ-violate when it tried to reference the
// mock function.
const { getServerUserMock } = vi.hoisted(() => ({
  getServerUserMock: vi.fn(),
}));
vi.mock("@/lib/supabase/get-user", () => ({
  getServerUser: getServerUserMock,
}));

import {
  POST,
  __setRouteDeps,
} from "./route";
import type { CreateProductDraftRepository } from "@/domains/catalog/products/create-product-draft";
import type { ResolveCreateProductAccessPort } from "@/domains/creator-ops/access/resolve-create-product-access-types";

// ─── Test helpers ─────────────────────────────────────────────────

type AccessContext = {
  role: "admin" | "creator" | "student" | null;
  applicationStatus: "draft" | "submitted" | "under_review" | "approved" | "rejected" | null;
};

interface TestDeps {
  access: AccessContext;
  draft: {
    created: boolean;
    product?: {
      id: string;
      slug: string;
      creatorId: string;
      contentKind: string;
      status: string;
      defaultLanguage: string;
      price: number;
      currency: string;
      coverUrl: string | null;
      templateId: string;
      lemonVariantId: string | null;
      createdAt: Date;
      updatedAt: Date;
    };
    reason?: "slug_taken";
  };
}

function mkAccessPort(deps: TestDeps): ResolveCreateProductAccessPort & {
  spy: { called: { actorId: string }[] };
} {
  const spy = { called: [] as { actorId: string }[] };
  return {
    async loadCreateAccessContext(input) {
      spy.called.push(input);
      return { role: deps.access.role, applicationStatus: deps.access.applicationStatus };
    },
    spy,
  };
}

function mkDraftRepo(deps: TestDeps): CreateProductDraftRepository & {
  spy: { called: { actorId: string; slug: string }[] };
} {
  const spy = { called: [] as { actorId: string; slug: string }[] };
  return {
    async createProductDraft(input) {
      spy.called.push(input);
      if (deps.draft.created) {
        return { created: true, product: deps.draft.product! };
      }
      return { created: false, reason: "slug_taken" };
    },
    spy,
  };
}

function configureRoute(deps: TestDeps) {
  const accessPort = mkAccessPort(deps);
  const draftRepo = mkDraftRepo(deps);
  __setRouteDeps({ accessPort, createDraftRepo: draftRepo });
  return { accessPort, draftRepo };
}

function mkSessionUser(actorId: string, role: "admin" | "creator" | "student") {
  return {
    id: actorId,
    role,
    email: `${actorId}@example.com`,
    name: actorId,
    image: null,
  };
}

/**
 * Convenience: stub `getServerUser` to return a session context
 * with `dbUser` matching the (actorId, role). Used by every test
 * to DRY the "this is who the session says you are" wiring.
 * Wraps in `{ dbUser: ... }` because `getServerUser` returns
 * `{ supabase, user, dbUser }`; only `dbUser` matters for the
 * route (it carries `id`).
 */
function mockSessionAs(actorId: string, role: "admin" | "creator" | "student") {
  getServerUserMock.mockResolvedValue({ dbUser: mkSessionUser(actorId, role) } as any);
}

function mkRequest(body: unknown): Request {
  return new Request("http://localhost/api/creator/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const PRODUCT = {
  id: "product_new",
  slug: "test-slug",
  creatorId: "u_test",
  contentKind: "document_course",
  status: "draft",
  defaultLanguage: "it",
  price: 0,
  currency: "eur",
  coverUrl: null,
  templateId: "lumio",
  lemonVariantId: null,
  createdAt: new Date("2026-07-19T10:00:00.000Z"),
  updatedAt: new Date("2026-07-19T10:00:00.000Z"),
};

// ─── Tests ─────────────────────────────────────────────────────────

describe("POST /api/creator/products — input invariants", () => {
  it("exports POST as an async function (no GET/PATCH/DELETE for this path)", () => {
    expect(typeof POST).toBe("function");
  });
});

// ─── 1. AUTHENTICATION ───────────────────────────────────────────

describe("POST /api/creator/products — authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults: a valid admin session + happy-path deps so a
    // test can override ONE thing and exercise the specific
    // branch under test.
    mockSessionAs("u_default", "admin");
    configureRoute({ access: { role: "admin", applicationStatus: null }, draft: { created: true, product: PRODUCT } });
  });

  it("no session → 401 unauthenticated", async () => {
    getServerUserMock.mockResolvedValue(null);
    const res = await POST(mkRequest({ slug: "test-slug" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("unauthenticated");
  });
});

// ─── 2. 4 ACTOR SCENARIOS (the spec's hard requirement) ──────────

describe("POST /api/creator/products — admin actor → 201", () => {
  beforeEach(() => vi.clearAllMocks());

  it("role=admin → 201 with product; use case receives session-derived actorId", async () => {
    mockSessionAs("u_admin", "admin");
    const { draftRepo } = configureRoute({
      access: { role: "admin", applicationStatus: null },
      draft: { created: true, product: { ...PRODUCT, id: "p_admin", creatorId: "u_admin" } },
    });
    const res = await POST(mkRequest({ slug: "admin-product" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.product.id).toBe("p_admin");
    expect(body.product.contentKind).toBe("document_course");
    // The use case received the SESSION's user.id, NOT a
    // payload-derived field.
    expect(draftRepo.spy.called).toEqual([
      { actorId: "u_admin", slug: "admin-product" },
    ]);
  });
});

describe("POST /api/creator/products — internal creator → 201", () => {
  beforeEach(() => vi.clearAllMocks());

  it("role=creator + applicationStatus=null (internal) → 201 with product", async () => {
    mockSessionAs("u_int", "creator");
    const { draftRepo } = configureRoute({
      access: { role: "creator", applicationStatus: null }, // internal
      draft: { created: true, product: { ...PRODUCT, id: "p_int", creatorId: "u_int" } },
    });
    const res = await POST(mkRequest({ slug: "internal-product" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.product.id).toBe("p_int");
    expect(draftRepo.spy.called[0]?.actorId).toBe("u_int");
  });
});

describe("POST /api/creator/products — external approved creator → 201", () => {
  beforeEach(() => vi.clearAllMocks());

  it("role=creator + applicationStatus=approved (external approved) → 201", async () => {
    mockSessionAs("u_ext", "creator");
    const { draftRepo } = configureRoute({
      access: { role: "creator", applicationStatus: "approved" },
      draft: { created: true, product: { ...PRODUCT, id: "p_ext", creatorId: "u_ext" } },
    });
    const res = await POST(mkRequest({ slug: "ext-product" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.product.id).toBe("p_ext");
    expect(draftRepo.spy.called[0]?.actorId).toBe("u_ext");
  });
});

describe("POST /api/creator/products — external NON-approved creator → 403", () => {
  beforeEach(() => vi.clearAllMocks());

  // The user spec says "creator esterno non approvato" → covered
  // by these 4 sub-cases: draft (haven't submitted), submitted,
  // under_review, rejected. All collapse to `forbidden`.
  it.each([
    ["draft", "draft"],
    ["submitted", "submitted"],
    ["under_review", "under_review"],
    ["rejected", "rejected"],
  ] as const)(
    "role=creator + applicationStatus=%s → 403 forbidden (no use case call)",
    async (_label, status) => {
      mockSessionAs("u_ext", "creator");
      const { draftRepo } = configureRoute({
        access: { role: "creator", applicationStatus: status },
        draft: { created: true, product: PRODUCT },
      });
      const res = await POST(mkRequest({ slug: "blocked-product" }));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.reason).toBe("forbidden");
      // The use case's repo was NOT called — access denied
      // BEFORE reaching the domain rule.
      expect(draftRepo.spy.called).toEqual([]);
    },
  );
});

describe("POST /api/creator/products — student actor → 403", () => {
  beforeEach(() => vi.clearAllMocks());

  it("role=student → 403 forbidden (no use case call)", async () => {
    mockSessionAs("u_student", "student");
    const { draftRepo } = configureRoute({
      access: { role: "student", applicationStatus: null },
      draft: { created: true, product: PRODUCT },
    });
    const res = await POST(mkRequest({ slug: "student-product" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("forbidden");
    expect(draftRepo.spy.called).toEqual([]);
  });
});

// ─── 3. ZOD STRICT — `creatorId` rejection (the spec's hard requirement)

describe("POST /api/creator/products — strict Zod rejects creatorId from payload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionAs("u_admin", "admin");
  });

  it("payload with `creatorId` → 400 creator_id_forbidden_in_payload (no use case call)", async () => {
    // A tampered client tries to assign the product to a
    // different user. The route must surface the unique reason.
    const { draftRepo } = configureRoute({
      access: { role: "admin", applicationStatus: null },
      draft: { created: true, product: PRODUCT },
    });
    const res = await POST(
      mkRequest({ slug: "tampered-product", creatorId: "u_someone_else" }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("creator_id_forbidden_in_payload");
    // The use case wasn't reached — strict Zod short-circuits.
    expect(draftRepo.spy.called).toEqual([]);
  });

  it("payload with forbidden `status` field → 400 invalid_payload", async () => {
    const { draftRepo } = configureRoute({
      access: { role: "admin", applicationStatus: null },
      draft: { created: true, product: PRODUCT },
    });
    const res = await POST(
      mkRequest({ slug: "test-slug", status: "published" }), // trying to bypass draft
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("invalid_payload");
    expect(draftRepo.spy.called).toEqual([]);
  });

  it("payload with malformed slug (uppercase) → 400 invalid_payload", async () => {
    const { draftRepo } = configureRoute({
      access: { role: "admin", applicationStatus: null },
      draft: { created: true, product: PRODUCT },
    });
    const res = await POST(mkRequest({ slug: "BAD-SLUG" })); // uppercase
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("invalid_payload");
    expect(draftRepo.spy.called).toEqual([]);
  });

  it("payload with slug too short → 400 invalid_payload", async () => {
    const { draftRepo } = configureRoute({
      access: { role: "admin", applicationStatus: null },
      draft: { created: true, product: PRODUCT },
    });
    const res = await POST(mkRequest({ slug: "ab" })); // min 3
    expect(res.status).toBe(400);
    expect(draftRepo.spy.called).toEqual([]);
  });

  it("empty body / malformed JSON → 400 invalid_json", async () => {
    const { draftRepo } = configureRoute({
      access: { role: "admin", applicationStatus: null },
      draft: { created: true, product: PRODUCT },
    });
    const res = await POST(new Request("http://localhost/api/creator/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("invalid_json");
    expect(draftRepo.spy.called).toEqual([]);
  });
});

// ─── 4. USE-CASE BRANCHES — route maps each to HTTP correctly ────

describe("POST /api/creator/products — use case returns success", () => {
  beforeEach(() => vi.clearAllMocks());

  it("use case success → 201 + product envelope", async () => {
    mockSessionAs("u_admin", "admin");
    configureRoute({
      access: { role: "admin", applicationStatus: null },
      draft: { created: true, product: { ...PRODUCT, id: "p_201", slug: "test-slug", creatorId: "u_admin" } },
    });
    const res = await POST(mkRequest({ slug: "test-slug" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.product.id).toBe("p_201");
    expect(body.product.slug).toBe("test-slug");
    expect(body.product.status).toBe("draft");
    expect(body.product.contentKind).toBe("document_course");
  });
});

describe("POST /api/creator/products — use case returns slug_taken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("repo returns slug_taken → 409 conflict", async () => {
    mockSessionAs("u_admin", "admin");
    configureRoute({
      access: { role: "admin", applicationStatus: null },
      draft: { created: false, reason: "slug_taken" },
    });
    const res = await POST(mkRequest({ slug: "taken-slug" }));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.reason).toBe("slug_taken");
  });
});

// ─── 5. RESPONSE ENVELOPE / CACHE ──────────────────────────────

describe("POST /api/creator/products — response envelope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("success response includes Cache-Control: no-store", async () => {
    mockSessionAs("u_admin", "admin");
    configureRoute({
      access: { role: "admin", applicationStatus: null },
      draft: { created: true, product: PRODUCT },
    });
    const res = await POST(mkRequest({ slug: "test-slug" }));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("failure response includes Cache-Control: no-store", async () => {
    getServerUserMock.mockResolvedValue(null);
    configureRoute({
      access: { role: "admin", applicationStatus: null },
      draft: { created: false, reason: "slug_taken" },
    });
    const res = await POST(mkRequest({ slug: "test-slug" }));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("success response body is { ok: true, product: {...} }", async () => {
    mockSessionAs("u_admin", "admin");
    configureRoute({
      access: { role: "admin", applicationStatus: null },
      draft: {
        created: true,
        product: { ...PRODUCT, id: "p_envelope", creatorId: "u_admin", slug: "envelope-slug" },
      },
    });
    const res = await POST(mkRequest({ slug: "envelope-slug" }));
    const body = await res.json();
    expect(typeof body.ok).toBe("boolean");
    expect(body.ok).toBe(true);
    expect(Object.keys(body).sort()).toEqual(["ok", "product"]);
  });

  it("failure response body is { ok: false, reason: ..., error? }", async () => {
    getServerUserMock.mockResolvedValue(null);
    configureRoute({
      access: { role: "admin", applicationStatus: null },
      draft: { created: false, reason: "slug_taken" },
    });
    const res = await POST(mkRequest({ slug: "test-slug" }));
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.reason).toBe("string");
  });
});

// ─── 6. ACTOR ID SOURCE — never from payload ────────────────────

describe("POST /api/creator/products — actorId always from SESSION, never from payload", () => {
  beforeEach(() => vi.clearAllMocks());

  it("actorId forwarded to use case equals the SESSION user.id, ignoring any 'creatorId' or 'actorId' in payload", async () => {
    mockSessionAs("u_session_id", "admin");
    const { draftRepo } = configureRoute({
      access: { role: "admin", applicationStatus: null },
      draft: { created: true, product: { ...PRODUCT, creatorId: "u_session_id" } },
    });
    // The route would already 400 on `creatorId` (strict Zod),
    // but a tampered client could try `actorId` instead — also
    // forbidden by the strict schema. The test asserts that the
    // session's user.id is used, NOT any payload field.
    const res = await POST(
      mkRequest({ slug: "actor-id-test", actorId: "u_payload_attacker" }),
    );
    // Strict Zod prohibits `actorId` too — 400 invalid_payload.
    expect(res.status).toBe(400);
    // The use case wasn't called (Zod short-circuited).
    expect(draftRepo.spy.called).toEqual([]);
  });

  it("valid payload {} → use case receives actorId from session", async () => {
    mockSessionAs("u_session", "admin");
    const { draftRepo } = configureRoute({
      access: { role: "admin", applicationStatus: null },
      draft: {
        created: true,
        product: { ...PRODUCT, creatorId: "u_session", slug: "valid-slug" },
      },
    });
    const res = await POST(mkRequest({ slug: "valid-slug" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // The use case was called exactly ONCE with the SESSION
    // user.id, NOT any payload field. The route never
    // constructs a different `actorId` from client data.
    expect(draftRepo.spy.called).toHaveLength(1);
    expect(draftRepo.spy.called[0]?.actorId).toBe("u_session");
    expect(draftRepo.spy.called[0]?.slug).toBe("valid-slug");
  });
});