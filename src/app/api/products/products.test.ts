import { describe, it, expect, vi, beforeEach } from "vitest";
import { revalidatePath } from "next/cache";
import { getServerUser } from "@/lib/supabase/get-user";
import { createMockRequest } from "@/app/api/__test-helpers__/mock-request";

// ─── Mock prisma ────────────────────────────────────────────
const mockPrisma = {
  product: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  productTranslation: {
    create: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  lesson: {
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  lessonTranslation: {
    create: vi.fn(),
    upsert: vi.fn(),
  },
  lessonAsset: {
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  analyticEvent: {
    count: vi.fn(),
  },
  $transaction: vi.fn(<T>(fn: (tx: typeof mockPrisma) => Promise<T>) => fn(mockPrisma)),
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: mockPrisma,
}));

// ─── Mock generateCourseConfig ──────────────────────────────
vi.mock("@/lib/config/generate-course-config", () => ({
  generateCourseConfig: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock admin auth ─────────────────────────────────────────
vi.mock("@/lib/supabase/get-user", () => ({
  getServerUser: vi.fn().mockResolvedValue({
    user: { email: "admin@test.com" },
    dbUser: { role: "admin" },
  }),
}));

// ─── Mock Next.js cache revalidation ─────────────────────────
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// ─── Mock rate limiting ─────────────────────────────────────
vi.mock("@/lib/utils/rate-limit", () => ({
  withRateLimit: <T,>(fn: T) => fn,
}));

// ─── Tests ───────────────────────────────────────────────────
describe("Auth guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is unauthenticated", async () => {
    vi.mocked(getServerUser).mockResolvedValueOnce({
      supabase: null,
      user: null,
      dbUser: null,
    });

    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/products"));

    expect(response.status).toBe(401);
  });

  it("returns 403 when user is not an admin", async () => {
    vi.mocked(getServerUser).mockResolvedValueOnce({
      supabase: null,
      user: { email: "student@test.com" },
      dbUser: { role: "student" },
    } as unknown as Awaited<ReturnType<typeof getServerUser>>);

    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/products"));

    expect(response.status).toBe(403);
  });
});

describe("GET /api/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns formatted product list", async () => {
    const fakeProducts = [
      {
        id: "p1",
        slug: "test-course",
        price: 4900,
        currency: "eur",
        pricesByCurrency: null,
        status: "published",
        coverUrl: "https://example.com/cover.jpg",
        templateId: "lumio",
        createdAt: new Date("2026-01-01"),
        translations: [{ locale: "it" }, { locale: "en" }],
        _count: { lessons: 5 },
        orders: [],
      },
    ];
    mockPrisma.product.findMany.mockResolvedValue(fakeProducts);
    mockPrisma.analyticEvent.count.mockResolvedValue(10);

    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/products"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: "p1",
      slug: "test-course",
      price: 4900,
      lessonsCount: 5,
      locales: ["it", "en"],
    });
    expect(mockPrisma.product.findMany).toHaveBeenCalledOnce();
  });

  it("returns 500 on prisma error", async () => {
    mockPrisma.product.findMany.mockRejectedValue(new Error("DB down"));

    const { GET } = await import("./route");
    const response = await GET(createMockRequest("/api/products"));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to fetch products");
  });
});

describe("POST /api/products", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(<T>(fn: (tx: typeof mockPrisma) => Promise<T>) =>
      fn(mockPrisma),
    );
    mockPrisma.product.create.mockResolvedValue({ id: "new-p1", slug: "new-course" });
  });

  it("creates a product with valid data", async () => {
    const { POST } = await import("./route");
    const req = createMockRequest("/api/products", {
      body: {
        slug: "new-course",
        price: 2900,
        translations: { titolo: "Corso Test", cta: "Compra Ora" },
        sourceLocale: "it",
        templateId: "h612",
      },
    });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.product.id).toBe("new-p1");
    expect(mockPrisma.product.create).toHaveBeenCalledOnce();
    expect(mockPrisma.productTranslation.create).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/it-it/new-course", "page");
  });

  it("returns 400 when slug is missing", async () => {
    const { POST } = await import("./route");
    const req = createMockRequest("/api/products", {
      body: { price: 2900, translations: {} },
    });
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Missing required fields");
  });

  it("returns 400 when translations is missing", async () => {
    const { POST } = await import("./route");
    const req = createMockRequest("/api/products", {
      body: { slug: "test" },
    });
    const response = await POST(req);

    expect(response.status).toBe(400);
  });

  it("skips lessons without valid translations", async () => {
    const { POST } = await import("./route");
    const req = createMockRequest("/api/products", {
      body: {
        slug: "course-with-empty-lessons",
        translations: { titolo: "Test" },
        sourceLocale: "it",
        lessons: [
          { translations: { it: { title: "", videoUrl: "" } }, assets: [] },
          { translations: {}, assets: [] },
        ],
      },
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mockPrisma.lesson.create).not.toHaveBeenCalled();
  });

  it("creates lessons with translations and assets", async () => {
    let lessonIndex = 0;
    mockPrisma.lesson.create.mockImplementation(() => {
      lessonIndex++;
      return Promise.resolve({ id: `lesson-${lessonIndex}` });
    });

    const { POST } = await import("./route");
    const req = createMockRequest("/api/products", {
      body: {
        slug: "course-with-lessons",
        translations: { titolo: "Test" },
        sourceLocale: "it",
        lessons: [
          {
            translations: {
              it: { title: "Intro", videoUrl: "https://youtube.com/1" },
            },
            assets: [{ type: "pdf", locale: "it", fileUrl: "https://example.com/file.pdf", fileName: "file.pdf" }],
          },
          {
            translations: {
              it: { title: "Advanced", videoUrl: "https://youtube.com/2" },
            },
            assets: [],
          },
        ],
      },
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    expect(mockPrisma.lesson.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.lessonTranslation.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.lessonAsset.create).toHaveBeenCalledTimes(1);
  });

  it("creates AI translations when provided", async () => {
    const { POST } = await import("./route");
    const req = createMockRequest("/api/products", {
      body: {
        slug: "multi-lang",
        translations: { titolo: "Test" },
        translationsByLocale: {
          en: { titolo: "Test EN" },
          es: { titolo: "Test ES" },
        },
        sourceLocale: "it",
      },
    });
    const response = await POST(req);

    expect(response.status).toBe(200);
    // 1 source + 2 translations (it skipped since locale === sourceLocale)
    expect(mockPrisma.productTranslation.upsert).toHaveBeenCalledTimes(2);
  });

  it("handles internal server error", async () => {
    mockPrisma.$transaction.mockRejectedValue(new Error("Transaction failed"));

    const { POST } = await import("./route");
    const req = createMockRequest("/api/products", {
      body: { slug: "test", translations: { titolo: "Test" } },
    });
    const response = await POST(req);

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to create product");
  });
});

describe("GET /api/products/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns product detail with translations and lessons", async () => {
    const fakeProduct = {
      id: "p1",
      slug: "test",
      price: 4900,
      currency: "eur",
      coverUrl: null,
      templateId: "lumio",
      status: "published",
      lemonVariantId: null,
      pricesByCurrency: null,
      createdAt: new Date("2026-01-01"),
      translations: [{ id: "t1", productId: "p1", locale: "it", section: "titolo", content: "Corso" }],
      lessons: [
        {
          id: "l1",
          productId: "p1",
          position: 1,
          translations: [{ id: "lt1", lessonId: "l1", locale: "it", title: "Intro", videoUrl: null, description: null }],
        },
      ],
    };
    mockPrisma.product.findUnique.mockResolvedValue(fakeProduct);

    const { GET } = await import("./[id]/route");
    const params = Promise.resolve({ id: "p1" });
    const response = await GET(createMockRequest("/api/products/p1"), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.id).toBe("p1");
    expect(body.translations).toHaveLength(1);
    expect(body.lessons).toHaveLength(1);
  });

  it("returns 404 when product not found", async () => {
    mockPrisma.product.findUnique.mockResolvedValue(null);

    const { GET } = await import("./[id]/route");
    const params = Promise.resolve({ id: "nonexistent" });
    const response = await GET(createMockRequest("/api/products/nonexistent"), { params });

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toBe("Product not found");
  });
});

describe("PUT /api/products/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(<T>(fn: (tx: typeof mockPrisma) => Promise<T>) =>
      fn(mockPrisma),
    );
    mockPrisma.product.update.mockResolvedValue({ id: "p1", slug: "test" });
  });

  it("updates product fields", async () => {
    const { PUT } = await import("./[id]/route");
    const req = createMockRequest("/api/products/p1", {
      body: { slug: "updated-slug", price: 9900, status: "published" },
    });
    const params = Promise.resolve({ id: "p1" });
    const response = await PUT(req, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({ slug: "updated-slug" }),
      }),
    );
  });

  it("creates lessons with translations and assets", async () => {
    let lessonIndex = 0;
    mockPrisma.lesson.create.mockImplementation(() => {
      lessonIndex++;
      return Promise.resolve({ id: `lesson-${lessonIndex}` });
    });

    const { PUT } = await import("./[id]/route");
    const req = createMockRequest("/api/products/p1", {
      body: {
        slug: "test",
        sourceLocale: "it",
        lessons: [
          {
            translations: { it: { title: "New Lesson 1", videoUrl: "" } },
            assets: [{ type: "pdf", locale: "it", fileUrl: "https://example.com/file.pdf", fileName: "file.pdf" }],
          },
          {
            translations: { it: { title: "New Lesson 2", videoUrl: "" } },
            assets: [],
          },
        ],
      },
    });
    const params = Promise.resolve({ id: "p1" });
    const response = await PUT(req, { params });

    expect(response.status).toBe(200);
    expect(mockPrisma.lesson.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ productId: "p1" }) }),
    );
    expect(mockPrisma.lesson.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.lessonAsset.create).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/it-it/test", "page");
  });

  it("upserts translations", async () => {
    const { PUT } = await import("./[id]/route");
    const req = createMockRequest("/api/products/p1", {
      body: {
        slug: "test",
        translations: { titolo: "Updated Title" },
        sourceLocale: "it",
      },
    });
    const params = Promise.resolve({ id: "p1" });
    const response = await PUT(req, { params });

    expect(response.status).toBe(200);
    expect(mockPrisma.productTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          productId_locale_section: expect.objectContaining({ productId: "p1", locale: "it", section: "titolo" }),
        },
        create: expect.objectContaining({ content: "Updated Title" }),
      }),
    );
  });
});

describe("DELETE /api/products/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes a product", async () => {
    mockPrisma.product.delete.mockResolvedValue({ id: "p1" });

    const { DELETE } = await import("./[id]/route");
    const params = Promise.resolve({ id: "p1" });
    const response = await DELETE(createMockRequest("/api/products/p1"), { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockPrisma.product.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });

  it("returns 500 on delete error", async () => {
    mockPrisma.product.delete.mockRejectedValue(new Error("Delete failed"));

    const { DELETE } = await import("./[id]/route");
    const params = Promise.resolve({ id: "p1" });
    const response = await DELETE(createMockRequest("/api/products/p1"), { params });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBe("Failed to delete product");
  });
});
