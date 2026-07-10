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

/** Payment provider errors (upstream Stripe/LemonSqueezy failure) */
export class PaymentError extends AppError {
  constructor(
    message: string,
    options: { code?: string; statusCode?: number } = {},
  ) {
    super(message, {
      statusCode: options.statusCode ?? 502,
      code: options.code ?? "PAYMENT_PROVIDER_ERROR",
    });
    this.name = "PaymentError";
  }
}

/** Not found errors (404) */
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, { statusCode: 404, code: "NOT_FOUND" });
    this.name = "NotFoundError";
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
