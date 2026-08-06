import { describe, it, expect } from "vitest";
import {
  analyticsEventSchema,
  checkoutSchema,
  progressSchema,
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

  it("accepts a valid purchase event with normalized identity fields", () => {
    const result = analyticsEventSchema.safeParse({
      eventType: "purchase",
      productId: "clxyz1234567890abcdefghij",
      productSlug: "corso-foto",
      providerProductId: "variant-42",
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

  it("accepts a legacy slug in productId for backward compatibility", () => {
    const result = analyticsEventSchema.safeParse({
      eventType: "pageview",
      productId: "legacy-course",
    });
    expect(result.success).toBe(true);
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

