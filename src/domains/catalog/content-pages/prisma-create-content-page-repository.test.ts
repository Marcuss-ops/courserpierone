import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { mockPrisma, mockTx } = vi.hoisted(() => ({
  mockPrisma: {
    product: { findUnique: vi.fn() },
    contentPage: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
  mockTx: {
    $executeRaw: vi.fn(),
    contentPage: {
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mockPrisma }));

import { prismaCreateContentPageRepository } from "./prisma-create-content-page-repository";

const FIXED_PAGE = {
  id: "page-1",
  productId: "product-1",
  parentId: null,
  slug: "intro",
  position: 4,
  status: "draft",
  publishedAt: null,
  createdAt: new Date("2026-08-06T12:00:00.000Z"),
  updatedAt: new Date("2026-08-06T12:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx));
  mockTx.$executeRaw.mockResolvedValue(1);
  mockTx.contentPage.findFirst.mockResolvedValue({ id: "parent-1" });
  mockTx.contentPage.aggregate.mockResolvedValue({ _max: { position: 3 } });
  mockTx.contentPage.create.mockResolvedValue(FIXED_PAGE);
});

describe("prismaCreateContentPageRepository", () => {
  it("allocates the next position inside one transaction after taking an advisory lock", async () => {
    const result = await prismaCreateContentPageRepository.createContentPage({
      productId: "product-1",
      parentId: null,
      slug: "intro",
      status: "draft",
    });

    expect(result).toEqual({ created: true, page: FIXED_PAGE });
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce();
    expect(mockTx.$executeRaw).toHaveBeenCalledOnce();
    const [lockTemplate, ...lockValues] = mockTx.$executeRaw.mock.calls[0] ?? [];
    expect(Array.from(lockTemplate ?? []).join(" ")).toContain("pg_advisory_xact_lock");
    expect(lockValues).toContain("product-1:root");
    expect(mockTx.contentPage.aggregate).toHaveBeenCalledWith({
      where: { productId: "product-1", parentId: null },
      _max: { position: true },
    });
    expect(mockTx.contentPage.create).toHaveBeenCalledWith({
      data: {
        productId: "product-1",
        parentId: null,
        slug: "intro",
        position: 4,
        status: "draft",
      },
      select: {
        id: true,
        productId: true,
        parentId: true,
        slug: true,
        position: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  });

  it("uses a parent-scoped advisory lock key for child pages", async () => {
    await prismaCreateContentPageRepository.createContentPage({
      productId: "product-1",
      parentId: "parent-1",
      slug: "child",
      status: "draft",
    });

    const [lockTemplate, ...lockValues] = mockTx.$executeRaw.mock.calls[0] ?? [];
    expect(Array.from(lockTemplate ?? []).join(" ")).toContain("pg_advisory_xact_lock");
    expect(lockValues).toContain("product-1:parent-1");
    expect(mockTx.contentPage.findFirst).toHaveBeenCalledWith({
      where: { id: "parent-1", productId: "product-1" },
      select: { id: true },
    });
  });

  it("rechecks a non-null parent in the same product inside the transaction", async () => {
    mockTx.contentPage.findFirst.mockResolvedValue(null);

    await expect(
      prismaCreateContentPageRepository.createContentPage({
        productId: "product-1",
        parentId: "parent-1",
        slug: "child",
        status: "draft",
      }),
    ).resolves.toEqual({ created: false, reason: "parent_not_found" });
    expect(mockTx.contentPage.findFirst).toHaveBeenCalledWith({
      where: { id: "parent-1", productId: "product-1" },
      select: { id: true },
    });
    expect(mockTx.contentPage.aggregate).not.toHaveBeenCalled();
    expect(mockTx.contentPage.create).not.toHaveBeenCalled();
  });

  it("maps only the page slug unique violation to slug_taken", async () => {
    const error = new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "5.22.0",
      meta: { target: ["productId", "slug"] },
    });
    mockPrisma.$transaction.mockRejectedValue(error);

    await expect(
      prismaCreateContentPageRepository.createContentPage({
        productId: "product-1",
        parentId: null,
        slug: "intro",
        status: "draft",
      }),
    ).resolves.toEqual({ created: false, reason: "slug_taken" });
  });
});
