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

// ─── Progress ──────────────────────────────────────────────
export const progressSchema = z.object({
  lessonId: z.string().min(1),
  completed: z.boolean().optional().default(true),
});

// ─── Config Generate ───────────────────────────────────────
// createProductSchema, generateConfigSchema, translateSchema → removed (dead code)

/**
 * Helper to create a NextResponse for validation errors.
 */
export function validationErrorResponse(errors: { field: string; message: string }[]) {
  return NextResponse.json(
    { error: "Validation failed", details: errors },
    { status: 400 }
  );
}

