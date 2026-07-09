import { NextResponse } from "next/server";
import { z } from "zod";

// ─── Analytics ─────────────────────────────────────────────
export const analyticsEventSchema = z.object({
  eventType: z.enum([
    "pageview",
    "scroll_deep",
    "click_buy",
    "checkout_open",
    "checkout_complete",
    "purchase",
    "lesson_start",
    "lesson_complete",
  ]),
  productId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
});

// ─── Checkout ──────────────────────────────────────────────
export const checkoutSchema = z.object({
  productId: z.string().min(1, "ID prodotto richiesto"),
  locale: z.string().min(2).max(10).optional().default("it"),
  currency: z.string().length(3).optional(),
  channelId: z.string().optional(),
  email: z.string().email().optional(),
  couponCode: z.string().optional(),
});

// ─── Product ───────────────────────────────────────────────
export const createProductSchema = z.object({
  slug: z.string().min(1, "Slug richiesto").max(100).regex(/^[a-z0-9-]+$/, "Slug non valido (solo lettere minuscole, numeri e trattini)"),
  price: z.number().int().min(0).optional(),
  coverUrl: z.string().url().optional().nullable(),
  templateId: z.enum(["lumio", "h612", "horizon", "book-claude", "amish"]).optional(),
  lemonVariantId: z.string().optional().nullable(),
  sourceLocale: z.string().optional(),
  translations: z.record(z.string(), z.string()).optional(),
  lessons: z.array(z.object({
    title: z.string().min(1),
    videoUrl: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
});

// ─── Progress ──────────────────────────────────────────────
export const progressSchema = z.object({
  lessonId: z.string().min(1),
  completed: z.boolean().optional().default(true),
});

// ─── Config Generate ───────────────────────────────────────
export const generateConfigSchema = z.object({
  slug: z.string().min(1, "Slug richiesto"),
});

// ─── Translation ───────────────────────────────────────────
export const translateSchema = z.object({
  sourceLocale: z.string().min(2).max(5),
  targetLocales: z.array(z.string().min(2).max(5)).min(1, "Almeno una lingua target richiesta"),
  sections: z.record(z.string(), z.string()),
});

/**
 * Helper to create a NextResponse for validation errors.
 */
export function validationErrorResponse(errors: { field: string; message: string }[]) {
  return NextResponse.json(
    { error: "Validation failed", details: errors },
    { status: 400 }
  );
}

// ─── Community Feed ───────────────────────────────────────
export const createDiscussionPostSchema = z.object({
  title: z.string().trim().min(1, "Titolo richiesto").max(200, "Titolo troppo lungo"),
  content: z.string().trim().min(1, "Contenuto richiesto").max(10000, "Contenuto troppo lungo"),
  pinned: z.boolean().optional().default(false),
});

export const createDiscussionCommentSchema = z.object({
  content: z.string().trim().min(1, "Commento richiesto").max(5000, "Commento troppo lungo"),
});
