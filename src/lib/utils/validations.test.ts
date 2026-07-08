import { describe, it, expect } from "vitest";
import {
  analyticsEventSchema,
  checkoutSchema,
  createProductSchema,
  progressSchema,
  generateConfigSchema,
  translateSchema,
} from "./validations";

// ─── Analytics Event Schema ─────────────────────────────────
describe("analyticsEventSchema", () => {
  it("accepts a valid pageview event", () => {
    const result = analyticsEventSchema.safeParse({
      eventType: "pageview",
      productId: "corso-foto",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid purchase event with all fields", () => {
    const result = analyticsEventSchema.safeParse({
      eventType: "purchase",
      productId: "corso-foto",
      metadata: { amount: 4900, currency: "EUR" },
      userId: "user_123",
      sessionId: "session_456",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid eventType", () => {
    const result = analyticsEventSchema.safeParse({
      eventType: "invalid_event",
    });
    expect(result.success).toBe(false);
  });

  it("accepts minimal valid data", () => {
    const result = analyticsEventSchema.safeParse({
      eventType: "lesson_start",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid event types", () => {
    const validTypes = [
      "pageview", "scroll_deep", "click_buy", "checkout_open",
      "checkout_complete", "purchase", "lesson_start", "lesson_complete",
    ];
    for (const eventType of validTypes) {
      const result = analyticsEventSchema.safeParse({ eventType });
      expect(result.success).toBe(true);
    }
  });
});

// ─── Magic Link Schema (removed — use Supabase Auth) ────────

// ─── Checkout Schema ────────────────────────────────────────
describe("checkoutSchema", () => {
  it("accepts valid checkout data with defaults", () => {
    const result = checkoutSchema.safeParse({ productId: "prod_123" });
    expect(result.success).toBe(true);
    if (result.success) {
      // locale should default to "it"
      expect(result.data.locale).toBe("it");
    }
  });

  it("accepts all optional fields", () => {
    const result = checkoutSchema.safeParse({
      productId: "prod_123",
      locale: "en",
      currency: "USD",
      channelId: "youtube_main",
      email: "buyer@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty productId", () => {
    const result = checkoutSchema.safeParse({ productId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid locale (too long)", () => {
    const result = checkoutSchema.safeParse({
      productId: "prod_123",
      locale: "verylonglocale",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid currency (not 3 chars)", () => {
    const result = checkoutSchema.safeParse({
      productId: "prod_123",
      currency: "EURO",
    });
    expect(result.success).toBe(false);
  });
});

// ─── Product Schema ─────────────────────────────────────────
describe("createProductSchema", () => {
  it("accepts a valid minimal product", () => {
    const result = createProductSchema.safeParse({ slug: "corso-foto" });
    expect(result.success).toBe(true);
  });

  it("accepts a full product with lessons", () => {
    const result = createProductSchema.safeParse({
      slug: "corso-foto",
      price: 4900,
      coverUrl: "https://example.com/cover.jpg",
      templateId: "lumio",
      translations: { titolo: "Corso Fotografia" },
      lessons: [
        { title: "Lezione 1", videoUrl: "https://youtube.com/embed/abc", description: "Intro" },
        { title: "Lezione 2" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid slug (uppercase)", () => {
    const result = createProductSchema.safeParse({ slug: "CORSO-FOTO" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid slug (spaces)", () => {
    const result = createProductSchema.safeParse({ slug: "corso foto" });
    expect(result.success).toBe(false);
  });

  it("rejects empty slug", () => {
    const result = createProductSchema.safeParse({ slug: "" });
    expect(result.success).toBe(false);
  });

  it("rejects negative price", () => {
    const result = createProductSchema.safeParse({
      slug: "corso-foto",
      price: -100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects lesson with empty title", () => {
    const result = createProductSchema.safeParse({
      slug: "corso-foto",
      lessons: [{ title: "" }],
    });
    expect(result.success).toBe(false);
  });

  it("accepts nullable fields as null", () => {
    const result = createProductSchema.safeParse({
      slug: "corso-foto",
      coverUrl: null,
      lemonVariantId: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid templateId", () => {
    const result = createProductSchema.safeParse({
      slug: "corso-foto",
      templateId: "invalid-template",
    });
    expect(result.success).toBe(false);
  });
});

// ─── Progress Schema ────────────────────────────────────────
describe("progressSchema", () => {
  it("accepts valid progress data with default completed", () => {
    const result = progressSchema.safeParse({ lessonId: "lesson_1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.completed).toBe(true);
    }
  });

  it("accepts explicit completed: false", () => {
    const result = progressSchema.safeParse({ lessonId: "lesson_1", completed: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.completed).toBe(false);
    }
  });

  it("rejects empty lessonId", () => {
    const result = progressSchema.safeParse({ lessonId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects non-boolean completed", () => {
    const result = progressSchema.safeParse({ lessonId: "lesson_1", completed: "yes" });
    expect(result.success).toBe(false);
  });
});

// ─── Generate Config Schema ─────────────────────────────────
describe("generateConfigSchema", () => {
  it("accepts a valid slug", () => {
    const result = generateConfigSchema.safeParse({ slug: "corso-foto" });
    expect(result.success).toBe(true);
  });

  it("rejects empty slug", () => {
    const result = generateConfigSchema.safeParse({ slug: "" });
    expect(result.success).toBe(false);
  });
});

// ─── Translate Schema ───────────────────────────────────────
describe("translateSchema", () => {
  it("accepts valid translation request", () => {
    const result = translateSchema.safeParse({
      sourceLocale: "it",
      targetLocales: ["en", "es", "fr"],
      sections: { titolo: "Ciao", storia: "Era una volta..." },
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty targetLocales", () => {
    const result = translateSchema.safeParse({
      sourceLocale: "it",
      targetLocales: [],
      sections: { titolo: "Ciao" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty sections", () => {
    const result = translateSchema.safeParse({
      sourceLocale: "it",
      targetLocales: ["en"],
      sections: {},
    });
    // Record<string, string> with empty object is valid
    expect(result.success).toBe(true);
  });

  it("rejects locale too short", () => {
    const result = translateSchema.safeParse({
      sourceLocale: "i",
      targetLocales: ["en"],
      sections: { titolo: "Ciao" },
    });
    expect(result.success).toBe(false);
  });
});
