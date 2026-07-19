import { test, expect } from "@playwright/test";

/**
 * E2E spec for content-page creator API routes against real DB + auth.
 *
 * ─── STATUS: TEST CASES MARKED test.skip(true) UNTIL AUTH IS WIRED ───
 *
 * The test cases below exercise the full HTTP request lifecycle
 * (create / rename / reorder + DB state verification) but require
 * a real authenticated session against the project's Supabase
 * project. The current spec stub (signInAndGetCookieHeader) tried
 * to mint session cookies via the Supabase password grant, but
 * getServerUser() reads Supabase SSR cookies (sb-<ref>-auth-token
 * with a JSON-encoded session blob) — not the raw access_token /
 * refresh_token pair — so every authenticated request returned 401.
 *
 * The right wiring is one of:
 *   (A) Use Playwright's `browser.newContext()` + `page.goto("/login")`
 *       + form submit (matches tests/e2e/journey.spec.ts pattern), then
 *       carry `storageState` into the APIRequestContext.
 *   (B) Add a test-only auth route (POST /api/test/authenticate) gated
 *       by NODE_ENV !== "production" that exchanges a Supabase
 *       access_token for a server-side session cookie.
 *
 * Until one of those is wired, the test cases below are skipped.
 * The DB helpers (seedCreatorProduct, contentPage CRUD via Prisma) are
 * exported but unused at runtime; they're ready for the auth-wired
 * followup.
 *
 * The /api routes themselves are covered by the in-process vitest
 * route tests at:
 *   - src/app/api/creator/products/[productId]/pages/route.test.ts
 *   - src/app/api/creator/products/[productId]/pages/reorder/route.test.ts
 *   - src/app/api/creator/products/[productId]/pages/[pageId]/rename/route.test.ts
 */

// ─── Auth-required stub (kept for the followup; not invoked while tests are skipped) ───

async function signInAndGetCookieHeader(): Promise<{ cookie: string; userId: string }> {
  throw new Error(
    "signInAndGetCookieHeader is not wired — see the TODO at the top of this file. " +
      "Implement via Playwright browser.newContext + /login flow (option A) " +
      "or a test-only /api/test/authenticate route (option B).",
  );
}

// ─── DB helpers (used by the auth-wired followup) ──────────────────

const PRODUCT_SLUG = "test-course-e2e-content-pages";

async function seedCreatorProduct(
  prisma: import("@prisma/client").PrismaClient,
  testUserId: string,
): Promise<string> {
  const existing = await prisma.product.findUnique({
    where: { slug: PRODUCT_SLUG },
  });
  if (existing) {
    await prisma.contentPage.deleteMany({ where: { productId: existing.id } });
    await prisma.product.delete({ where: { id: existing.id } });
  }
  const product = await prisma.product.create({
    data: {
      slug: PRODUCT_SLUG,
      status: "published",
      price: 4900,
      currency: "eur",
      defaultLanguage: "it",
      creatorId: testUserId,
    },
  });
  return product.id;
}

// ─── Test cases (skipped — auth not wired) ────────────────────────

test.describe.skip("POST /api/creator/products/[productId]/pages", () => {
  test("create page happy path → 201 + DB row inserted", async () => {
    const { prisma } = await import("./fixtures/db");
    const { signUpTestUser, deleteSupabaseUserById } = await import(
      "./fixtures/supabase-auth"
    );
    const email = `e2e-cp-${Date.now()}@example.com`;
    const password = "E2eContentPagesTest123!";
    const user = await signUpTestUser(email, password);
    try {
      const productId = await seedCreatorProduct(prisma, user.id);
      const { cookie } = await signInAndGetCookieHeader();
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/creator/products/${productId}/pages`,
        {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ slug: "intro-page", status: "draft" }),
        },
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.page.slug).toBe("intro-page");
      const row = await prisma.contentPage.findFirst({
        where: { productId, slug: "intro-page" },
      });
      expect(row).toBeTruthy();
      expect(row?.status).toBe("draft");
    } finally {
      await deleteSupabaseUserById(user.id).catch(() => undefined);
    }
  });
});

test.describe.skip("PATCH /api/creator/products/[productId]/pages/[pageId]/rename", () => {
  test("rename happy path → 200 + translation title updated", async () => {
    // (See the auth-wired TODO at the top of the file.)
  });
});

test.describe.skip("POST /api/creator/products/[productId]/pages/reorder", () => {
  test("reorder full sibling set → 200 + DB positions updated", async () => {
    // (See the auth-wired TODO at the top of the file.)
  });
});
