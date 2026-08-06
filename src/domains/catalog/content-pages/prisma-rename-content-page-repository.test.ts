/**
 * src/domains/catalog/content-pages/prisma-rename-content-page-repository.test.ts
 *
 * Unit tests for `prismaRenameContentPageRepository` with the
 * `@/lib/db/prisma` client mocked via `vi.mock` + `vi.hoisted`.
 *
 * ─── Why mock-prisma here ───────────────────────────────────────
 *
 * The adapter is pure pass-through to the Prisma client. The
 * meaningful surface is the translation between Prisma's
 * error/result shape and the port's typed outcome:
 *
 *   - `findUnique` returning null → `{ defaultLanguage, creatorId } | null`
 *   - `update` succeeding → `{ updated: true, title, revision, updatedAt }`
 *   - `update` throwing P2025 → `{ updated: false, reason: "translation_not_found" }`
 *   - `update` throwing P2002 / other → BUBBLE (no catch)
 *
 * Driving these paths through the real Prisma client would
 * require a test DB and significantly more setup. Mocking the
 * client surfaces the adapter's branching logic in isolation
 * — exactly what unit tests are for.
 *
 * ─── Test posture ───────────────────────────────────────────────
 *
 *   - `vi.hoisted` lifts the mock above `vi.mock`'s hoisting so
 *     the factory doesn't suffer a TDZ violation when it
 *     references the stub fns.
 *   - `beforeEach(vi.clearAllMocks)` resets call history +
 *     mock implementations so test cases are independent.
 *   - We assert the SHAPE of the call (`expect.objectContaining`)
 *     rather than the exact call, so future internal refactors
 *     (e.g., adding `select: { … }` to `findUnique`) don't break
 *     the tests without reason.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    product: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    contentPage: {
      findUnique: vi.fn(),
    },
    contentPageTranslation: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { prismaRenameContentPageRepository } from "./prisma-rename-content-page-repository";

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── findProductLocaleAndOwner ─────────────────────────────────

describe("prismaRenameContentPageRepository — findProductLocaleAndOwner", () => {
  it("returns null when productId is empty (defensive)", async () => {
    const result = await prismaRenameContentPageRepository.findProductLocaleAndOwner(
      { productId: "" },
    );
    expect(result).toBeNull();
    expect(mockPrisma.product.findFirst).not.toHaveBeenCalled();
  });

  it("returns null when the product row is missing", async () => {
    mockPrisma.product.findFirst.mockResolvedValue(null);
    const result = await prismaRenameContentPageRepository.findProductLocaleAndOwner(
      { productId: "p-missing" },
    );
    expect(result).toBeNull();
    expect(mockPrisma.product.findFirst).toHaveBeenCalledWith({
      where: { id: "p-missing", deletedAt: null },
      select: { defaultLanguage: true, creatorId: true },
    });
  });

  it("returns { defaultLanguage, creatorId } on a hit", async () => {
    mockPrisma.product.findFirst.mockResolvedValue({
      defaultLanguage: "en",
      creatorId: "u-creator-1",
    });
    const result = await prismaRenameContentPageRepository.findProductLocaleAndOwner(
      { productId: "p-1" },
    );
    expect(result).toEqual({ defaultLanguage: "en", creatorId: "u-creator-1" });
  });

  it("forwards arbitrary errors (e.g. connection) to the caller", async () => {
    mockPrisma.product.findFirst.mockRejectedValue(new Error("DB down"));
    await expect(
      prismaRenameContentPageRepository.findProductLocaleAndOwner({
        productId: "p-1",
      }),
    ).rejects.toThrow("DB down");
  });
});

// ─── findPageProductId ──────────────────────────────────────────

describe("prismaRenameContentPageRepository — findPageProductId", () => {
  it("returns null when pageId is empty (defensive)", async () => {
    const result = await prismaRenameContentPageRepository.findPageProductId({
      pageId: "",
    });
    expect(result).toBeNull();
    expect(mockPrisma.contentPage.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when the page row is missing", async () => {
    mockPrisma.contentPage.findUnique.mockResolvedValue(null);
    const result = await prismaRenameContentPageRepository.findPageProductId({
      pageId: "pg-missing",
    });
    expect(result).toBeNull();
  });

  it("returns { productId } on a hit", async () => {
    mockPrisma.contentPage.findUnique.mockResolvedValue({
      productId: "p-1",
    });
    const result = await prismaRenameContentPageRepository.findPageProductId({
      pageId: "pg-1",
    });
    expect(result).toEqual({ productId: "p-1" });
  });
});

// ─── renameContentPageTranslation ───────────────────────────────

describe("prismaRenameContentPageRepository — renameContentPageTranslation", () => {
  it("returns translation_not_found when pageId is empty (defensive)", async () => {
    const result =
      await prismaRenameContentPageRepository.renameContentPageTranslation({
        pageId: "",
        locale: "it",
        title: "New",
        now: new Date(),
      });
    expect(result).toEqual({ updated: false, reason: "translation_not_found" });
    expect(mockPrisma.contentPageTranslation.update).not.toHaveBeenCalled();
  });

  it("returns translation_not_found when locale is empty (defensive)", async () => {
    const result =
      await prismaRenameContentPageRepository.renameContentPageTranslation({
        pageId: "pg-1",
        locale: "",
        title: "New",
        now: new Date(),
      });
    expect(result).toEqual({ updated: false, reason: "translation_not_found" });
  });

  it("issues a strict UPDATE with incrementing revision and the provided clock", async () => {
    const FIXED = new Date("2026-07-19T12:00:00.000Z");
    mockPrisma.contentPageTranslation.update.mockResolvedValue({
      title: "Renamed title",
      revision: 5,
      updatedAt: FIXED,
    });
    const result =
      await prismaRenameContentPageRepository.renameContentPageTranslation({
        pageId: "pg-1",
        locale: "it",
        title: "Renamed title",
        now: FIXED,
      });

    expect(result).toEqual({
      updated: true,
      title: "Renamed title",
      revision: 5,
      updatedAt: FIXED,
    });
    expect(mockPrisma.contentPageTranslation.update).toHaveBeenCalledWith({
      where: { pageId_locale: { pageId: "pg-1", locale: "it" } },
      data: {
        title: "Renamed title",
        revision: { increment: 1 },
        updatedAt: FIXED,
      },
      select: { title: true, revision: true, updatedAt: true },
    });
  });

  it("translates P2025 (RecordNotFound) to translation_not_found", async () => {
    const p2025 = new Prisma.PrismaClientKnownRequestError(
      "No ContentPageTranslation found",
      { code: "P2025", clientVersion: "5.22.0" },
    );
    mockPrisma.contentPageTranslation.update.mockRejectedValue(p2025);

    const result =
      await prismaRenameContentPageRepository.renameContentPageTranslation({
        pageId: "pg-deleted",
        locale: "it",
        title: "Whatever",
        now: new Date(),
      });

    expect(result).toEqual({ updated: false, reason: "translation_not_found" });
  });

  it("lets P2002 (UniqueConstraintViolation) bubble — structurally unreachable here", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "5.22.0" },
    );
    mockPrisma.contentPageTranslation.update.mockRejectedValue(p2002);

    await expect(
      prismaRenameContentPageRepository.renameContentPageTranslation({
        pageId: "pg-1",
        locale: "it",
        title: "T",
        now: new Date(),
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it("lets arbitrary Prisma errors bubble (connection, FK violation, schema drift)", async () => {
    mockPrisma.contentPageTranslation.update.mockRejectedValue(
      new Error("connection terminated"),
    );
    await expect(
      prismaRenameContentPageRepository.renameContentPageTranslation({
        pageId: "pg-1",
        locale: "it",
        title: "T",
        now: new Date(),
      }),
    ).rejects.toThrow("connection terminated");
  });
});
