// ─── Error Classes — Standardized error handling ───────────

import { NextResponse } from "next/server";

// ─── Base App Error ────────────────────────────────────

/**
 * Base application error with HTTP status code.
 * All domain errors should extend this.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: string;
      /** Mark as operational (expected) vs programmer error */
      isOperational?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.isOperational = options.isOperational ?? true;
  }
}

// ─── Domain Errors ─────────────────────────────────────

/** Payment/checkout related errors (400-range) */
export class CheckoutError extends AppError {
  constructor(
    message: string,
    options: { code?: string } = {},
  ) {
    super(message, { statusCode: 400, code: options.code ?? "CHECKOUT_ERROR" });
    this.name = "CheckoutError";
  }
}

/**
 * Thrown by the canonical `CheckoutService.createCheckout` orchestrator
 * when the buyer attempts to check out a product whose `status` is
 * not `"published"`. Centralizes the gate so future callers (cron
 * replay, webhook replay, queue workers, admin reconciliation) are
 * uniformly blocked from generating a checkout session for a draft
 * or archived product.
 *
 * Matches the `CheckoutPricingError` precedent (see
 * `src/lib/commerce/checkout/pricing.ts`): a typed subclass with a
 * specific `code` so downstream `apiErrorResponse(error)` callers
 * can branch on `instanceof` without string-matching messages.
 */
export class ProductNotPublishedError extends CheckoutError {
  constructor(
    message = "Questo prodotto non è disponibile per l'acquisto al momento.",
  ) {
    super(message, { code: "PRODUCT_NOT_PUBLISHED" });
    this.name = "ProductNotPublishedError";
  }
}

/** Not found errors (404) */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, { statusCode: 404, code: "NOT_FOUND" });
    this.name = "NotFoundError";
  }
}

/**
 * 501 Not Implemented — stub for capabilities explicitly deferred to
 * a future MCR phase. A 501 means "we haven't written this yet" —
 * different ops response from a 502 (upstream provider failure).
 *
 * The `code` suffix convention (`NOT_IMPLEMENTED_PHASE_2`,
 * `NOT_IMPLEMENTED_PHASE_4`) is grep-friendly: a Phase PR can find
 * the stubs it owns without grepping on payment-provider code paths.
 */
export class NotImplementedError extends AppError {
  constructor(
    message: string,
    options: { code?: string } = {},
  ) {
    super(message, {
      statusCode: 501,
      code: options.code ?? "NOT_IMPLEMENTED",
    });
    this.name = "NotImplementedError";
  }
}

/** Validation errors (400) */
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, { statusCode: 400, code: "VALIDATION_ERROR" });
    this.name = "ValidationError";
  }
}

// ─── API Error Response Helper ──────────────────────────

/**
 * Converts any error into a consistent NextResponse for API routes.
 *
 * Usage:
 *   try { ... } catch (error) {
 *     return apiErrorResponse(error);
 *   }
 *
 * AppError → uses statusCode + code from the error
 * Unknown error → 500 with generic message
 */
export function apiErrorResponse(
  error: unknown,
  fallbackMessage?: string,
): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }

  // Unexpected errors: log and return generic 500
  if (error instanceof Error) {
    console.error("[apiErrorResponse] Unexpected error:", error.message, error.stack);
  } else {
    console.error("[apiErrorResponse] Unknown error:", error);
  }

  return NextResponse.json(
    {
      error: fallbackMessage ?? "Internal server error",
      code: "INTERNAL_ERROR",
    },
    { status: 500 },
  );
}
