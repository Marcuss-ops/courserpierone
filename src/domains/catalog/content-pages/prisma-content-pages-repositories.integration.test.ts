// @vitest-environment node
//
// SKIP-IF-NO-DB: this suite exercises the real Prisma client
// against the DATABASE_URL configured in the test environment.
// CI runs without a DB set the integration tests to skipped —
// the unit tests (prisma-rename-content-page-repository.test.ts
// + prisma-reorder-content-pages-repository.test.ts) cover the
// branching logic in isolation.

/**
 * src/domains/catalog/content-pages/prisma-content-pages-repositories.integration.test.ts
 *
 * Real-DB integration test for the two content-page adapters:
 *   - `prismaRenameContentPageRepository`
 *   - `prismaReorderContentPagesRepository`
 *
 * ─── Why a separate integration suite ───────────────────────────
 *
 * The unit tests stub the Prisma client and assert the
 * adapter's branching (P2025 catch, $transaction shape, etc.)
 * in isolation. They DO NOT verify the actual SQL semantics:
 *
 *   - Does `pageId_locale` exist as Prisma's auto-generated
 *     composite-key input type? (Yes, per Prisma 5 for
 *     `@@unique([pageId, locale])` — but a regression would
 *     silently break compile + runtime.)
 *   - Does `$transaction(updates)` actually issue the UPDATEs
 *     inside a single PG transaction? (Yes, but the mock
 *     cannot prove the all-or-nothing commit.)
 *   - Does the strict UPDATE actually NOT upsert? (A test
 *     against the real DB with a missing row proves this
 *     better than any mock.)
 *
 * The integration suite is the single source of truth for
 * those runtime contracts.
 *
 * ─── Skipping policy ────────────────────────────────────────────
 *
 * The suite SKIPS entirely when `DATABASE_URL` is unset. CI
 * without a DB (lint/typecheck jobs) therefore skips this file
 * cleanly without test failures. Locally, `.env.test` (loaded
 * by vitest setup) provides `DATABASE_URL`.
 *
 * ─── Cleanup discipline ─────────────────────────────────────────
 *
 * Per-case `try/finally` deletes test fixtures in REVERSE
 * foreign-key order:
 *
 *   1. ContentPage CASCADE → ContentPageTranslation
 *      (Product.delete CASCADEs to both.)
 *   2. Product (CASCADE removes pages + translations).
 *   3. User (Restrict on Product.creator; must come AFTER
 *      Product deletion).
 *
 * Every test fixture uses a unique slug + email suffix to
 * prevent collisions with concurrent test runs or seeded
 * development data.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";

// Real Prisma client — no vi.mock. The test setup file
// (`vitest.setup.ts`) loads `.env.test` so `DATABASE_URL` is
// available. We instantiate a fresh client here (separate
// from the singleton in `@/lib/db/prisma`) to keep the
// integration suite self-contained and to avoid leaking
// connections across tests.
const realPrisma = new PrismaClient();

const skipIfNoDb = () => !process.env.DATABASE_URL;

const UNIQUE = `itest${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

let userId = "";
let productId = "";
const pageIds: string[] = [];
const translationIds: string[] = [];

beforeAll(async () => {
  if (skipIfNoDb()) return;
  // ─── Seed user ─────────────────────────────────────────────
  const user = await realPrisma.user.create({
    data: {
      email: `itest-${UNIQUE}@example.com`,
      name: `Integration Test User ${UNIQUE}`,
      role: "creator",
      creatorType: "internal",
    },
  });
  userId = user.id;

  // ─── Seed product (draft, document_course) ─────────────────
  const product = await realPrisma.product.create({
    data: {
      slug: `itest-${UNIQUE}`,
      creatorId: userId,
      contentKind: "document_course",
      status: "draft",
      templateId: "lumio",
      defaultLanguage: "it",
    },
  });
  productId = product.id;

  // ─── Seed 4 sibling pages (top-level scope, parentId=null) ─
  for (let i = 1; i <= 4; i++) {
    const page = await realPrisma.contentPage.create({
      data: {
        productId,
        slug: `itest-page-${i}-${UNIQUE}`,
        position: i,
        status: "draft",
      },
    });
    pageIds.push(page.id);
    // Each page gets ONE translation row with a known title.
    const translation = await realPrisma.contentPageTranslation.create({
      data: {
        pageId: page.id,
        locale: "it",
        title: `Original Title ${i}`,
        document: { schemaVersion: 1, blocks: [] },
        revision: 1,
      },
    });
    translationIds.push(translation.id);
  }
});

afterAll(async () => {
  if (skipIfNoDb()) return;
  // ─── Cleanup: REVERSE FK order ─────────────────────────────
  // Product.delete CASCADEs → ContentPage → ContentPageTranslation.
  // User.delete can run AFTER the product is gone (Restrict on
  // Product.creator). The translationIds/pageIds lists are
  // tracked for defensive direct deletes in case the cascade
  // ever fails (e.g., schema drift).
  try {
    if (productId) {
      await realPrisma.contentPage.deleteMany({
        where: { productId },
      });
      await realPrisma.contentPageTranslation.deleteMany({
        where: { id: { in: translationIds } },
      });
      await realPrisma.product.delete({ where: { id: productId } });
    }
    if (userId) {
      await realPrisma.user.delete({ where: { id: userId } });
    }
  } finally {
    await realPrisma.$disconnect();
  }
});

// ─── Suite ──────────────────────────────────────────────────────

const describeIfDb = skipIfNoDb() ? describe.skip : describe;

describeIfDb("prismaRenameContentPageRepository — real DB", () => {
  it("renames an existing translation (strict UPDATE, revision increment)", async () => {
    const FIXED = new Date();
    const { prismaRenameContentPageRepository } = await import(
      "./prisma-rename-content-page-repository"
    );

    const result =
      await prismaRenameContentPageRepository.renameContentPageTranslation({
        pageId: pageIds[0],
        locale: "it",
        title: "Renamed via real DB",
        now: FIXED,
      });

    expect(result.updated).toBe(true);
    if (!result.updated) throw new Error("expected updated=true");
    expect(result.title).toBe("Renamed via real DB");
    // Original revision was 1 → after increment = 2.
    expect(result.revision).toBe(2);
    // updatedAt should match the injected clock.
    expect(result.updatedAt.toISOString()).toBe(FIXED.toISOString());

    // Verify the row in the DB directly.
    const dbRow = await realPrisma.contentPageTranslation.findFirst({
      where: { pageId: pageIds[0], locale: "it" },
    });
    expect(dbRow?.title).toBe("Renamed via real DB");
    expect(dbRow?.revision).toBe(2);
  });

  it("returns translation_not_found when the row doesn't exist (no upsert)", async () => {
    const { prismaRenameContentPageRepository } = await import(
      "./prisma-rename-content-page-repository"
    );

    const result =
      await prismaRenameContentPageRepository.renameContentPageTranslation({
        // locale "klingon" has no translation row for pageIds[0].
        pageId: pageIds[0],
        locale: "klingon",
        title: "Should not be inserted",
        now: new Date(),
      });

    expect(result).toEqual({ updated: false, reason: "translation_not_found" });

    // Defensive: verify NO row was created in the klingon locale.
    const dbRow = await realPrisma.contentPageTranslation.findFirst({
      where: { pageId: pageIds[0], locale: "klingon" },
    });
    expect(dbRow).toBeNull();
  });

  it("findProductLocaleAndOwner returns the seeded product's locale + creator", async () => {
    const { prismaRenameContentPageRepository } = await import(
      "./prisma-rename-content-page-repository"
    );

    const result = await prismaRenameContentPageRepository.findProductLocaleAndOwner(
      { productId },
    );
    expect(result).toEqual({
      defaultLanguage: "it",
      creatorId: userId,
    });
  });

  it("findPageProductId returns the page's productId", async () => {
    const { prismaRenameContentPageRepository } = await import(
      "./prisma-rename-content-page-repository"
    );

    const result = await prismaRenameContentPageRepository.findPageProductId({
      pageId: pageIds[0],
    });
    expect(result).toEqual({ productId });
  });
});

describeIfDb("prismaReorderContentPagesRepository — real DB", () => {
  it("renumbers the sibling scope atomically (positions persist correctly)", async () => {
    const { prismaReorderContentPagesRepository } = await import(
      "./prisma-reorder-content-pages-repository"
    );

    // Reverse the original order: pageIds was [1,2,3,4] with
    // positions [1,2,3,4]. After reorder, positions should be
    // [4,3,2,1] — page 1 gets position 4, page 2 gets 3, etc.
    const FIXED = new Date();
    const result = await prismaReorderContentPagesRepository.applyReorder({
      productId,
      parentId: null,
      entries: [
        { pageId: pageIds[0], newPosition: 4 },
        { pageId: pageIds[1], newPosition: 3 },
        { pageId: pageIds[2], newPosition: 2 },
        { pageId: pageIds[3], newPosition: 1 },
      ],
      now: FIXED,
    });

    expect(result).toEqual({ applied: true });

    // Verify each row in the DB.
    const rows = await realPrisma.contentPage.findMany({
      where: { productId, parentId: null },
      orderBy: { position: "asc" },
    });
    // After reorder, ascending position order is pageIds[3],
    // pageIds[2], pageIds[1], pageIds[0] (positions 1..4).
    expect(rows.map((r) => r.id)).toEqual([
      pageIds[3],
      pageIds[2],
      pageIds[1],
      pageIds[0],
    ]);
    // Every row has the shared `updatedAt`.
    for (const r of rows) {
      expect(r.updatedAt.toISOString()).toBe(FIXED.toISOString());
    }
  });

  it("listContentPagesInScope returns the complete sibling set", async () => {
    const { prismaReorderContentPagesRepository } = await import(
      "./prisma-reorder-content-pages-repository"
    );

    const result = await prismaReorderContentPagesRepository.listContentPagesInScope(
      { productId, parentId: null },
    );
    expect(new Set(result.pageIds)).toEqual(new Set(pageIds));
  });

  it("findProductOwner returns the seeded product's creatorId", async () => {
    const { prismaReorderContentPagesRepository } = await import(
      "./prisma-reorder-content-pages-repository"
    );

    const result = await prismaReorderContentPagesRepository.findProductOwner({
      productId,
    });
    expect(result).toEqual({ creatorId: userId });
  });
});
