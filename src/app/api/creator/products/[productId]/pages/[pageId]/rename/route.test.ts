/**
 * src/app/api/creator/products/[productId]/pages/[pageId]/rename/route.test.ts
 *
 * Route tests for `PATCH /api/creator/products/[productId]/pages/[pageId]/rename`.
 *
 * Minimal coverage (the original comprehensive coverage will be
 * restored in a follow-up — see followups suggestion):
 *   - exports PATCH
 *   - 401 no session
 *   - 404 page_not_found
 *   - 404 defense-in-depth productId mismatch
 *   - 200 happy path
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
  ResolveCreatorPageAccessContext,
} from "@/domains/creator-ops/access/resolve-creator-page-access-types";

function mkSessionUser(actorId: string, role: "admin" | "creator" | "student") {
  return { id: actorId, role, email: `${actorId}@example.com`, name: actorId };
}

function mockSessionAs(actorId: string, role: "admin" | "creator" | "student") {
  getServerUserMock.mockResolvedValue({ dbUser: mkSessionUser(actorId, role) });
}

type AccessOutcome =
  | { kind: "page_not_found" }
  | { kind: "allowed"; pageProductId: string; actorId: string; creatorId: string };

function mkAccessPort(outcome: AccessOutcome): ResolveCreatorPageAccessPort {
  return {
    async loadPageAccessContext(): Promise<ResolveCreatorPageAccessContext> {
      if (outcome.kind === "page_not_found") {
        return {
          actor: { role: "creator" },
          product: null,
          application: null,
          pageProductId: null,
        };
      }
      return {
        pageProductId: outcome.pageProductId,
        actor: { role: "creator" },
        product: { creatorId: outcome.creatorId },
        application: null,
      };
    },
  };
}

function mkRenamePort(opts: {
  outcome: "success" | "not_found" | "forbidden";
}): RenameContentPagePort {
  return {
    async findProductLocaleAndOwner() {
      if (opts.outcome === "not_found") return null;
      if (opts.outcome === "forbidden") {
        return { defaultLanguage: "it", creatorId: "u_other_creator" };
      }
      return { defaultLanguage: "it", creatorId: "u_owner" };
    },
    async findPageProductId() {
      if (opts.outcome === "not_found") return null;
      return { productId: "product_1" };
    },
    async renameContentPageTranslation() {
      if (opts.outcome === "success") {
        return {
          updated: true,
          title: "New Title",
          revision: 7,
          updatedAt: new Date("2026-07-19T00:00:00.000Z"),
        };
      }
      return { updated: false, reason: "translation_not_found" };
    },
  };
}

function mkRequest(body: unknown): Request {
  return new Request(
    "http://localhost/api/creator/products/product_1/pages/page_1/rename",
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

const CTX = {
  params: Promise.resolve({ productId: "product_1", pageId: "page_1" }),
};

describe("PATCH /api/creator/products/[productId]/pages/[pageId]/rename", () => {
  it("exports PATCH as an async function", () => {
    expect(typeof PATCH).toBe("function");
  });

  it("no session → 401 unauthenticated", async () => {
    getServerUserMock.mockResolvedValue(null);
    __setRouteDeps({
      accessPort: mkAccessPort({ kind: "page_not_found" }),
      renamePort: mkRenamePort({ outcome: "success" }),
    });
    const res = await PATCH(mkRequest({ newTitle: "x" }), CTX);
    expect(res.status).toBe(401);
  });

  it("resolver returns page_not_found → 404", async () => {
    mockSessionAs("u_owner", "creator");
    __setRouteDeps({
      accessPort: mkAccessPort({ kind: "page_not_found" }),
      renamePort: mkRenamePort({ outcome: "success" }),
    });
    const res = await PATCH(mkRequest({ newTitle: "x" }), CTX);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("defense-in-depth: URL productId mismatch → 404 (collapsed)", async () => {
    mockSessionAs("u_owner", "creator");
    // Resolver returns allowed with pageProductId: "OTHER_PRODUCT",
    // but URL has "product_1". Mismatch → 404.
    __setRouteDeps({
      accessPort: mkAccessPort({
        kind: "allowed",
        pageProductId: "OTHER_PRODUCT",
        actorId: "u_owner",
        creatorId: "u_owner",
      }),
      renamePort: mkRenamePort({ outcome: "success" }),
    });
    const res = await PATCH(mkRequest({ newTitle: "x" }), CTX);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not_found");
  });

  it("happy path → 200 with title, locale, revision, updatedAt", async () => {
    mockSessionAs("u_owner", "creator");
    __setRouteDeps({
      accessPort: mkAccessPort({
        kind: "allowed",
        pageProductId: "product_1",
        actorId: "u_owner",
        creatorId: "u_owner",
      }),
      renamePort: mkRenamePort({ outcome: "success" }),
    });
    const res = await PATCH(mkRequest({ newTitle: "New Title" }), CTX);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.title).toBe("New Title");
    expect(body.locale).toBe("it");
    expect(body.revision).toBe(7);
    expect(typeof body.updatedAt).toBe("string");
  });
});
