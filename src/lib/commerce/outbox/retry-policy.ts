import { Prisma } from "@prisma/client";
import { z } from "zod";

export const OUTBOX_BASE_BACKOFF_MS = 5_000;

export interface OutboxErrorClassification {
  retryable: boolean;
  reason: "payload_invalid" | "transient_infrastructure" | "permanent_failure";
}

/**
 * Retry decisions belong to the outbox infrastructure, not to an unrelated
 * domain such as automation. Invalid durable payloads are permanently failed;
 * transport/database outages are retried; unknown application failures use a
 * conservative terminal decision until explicitly classified.
 */
export function classifyOutboxError(error: unknown): OutboxErrorClassification {
  if (error instanceof z.ZodError) {
    return { retryable: false, reason: "payload_invalid" };
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return isTransientPrismaCode(error.code)
      ? { retryable: true, reason: "transient_infrastructure" }
      : { retryable: false, reason: "permanent_failure" };
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && isTransientCode(code)) {
      return { retryable: true, reason: "transient_infrastructure" };
    }
  }

  if (error instanceof Error && isTransientMessage(error.message)) {
    return { retryable: true, reason: "transient_infrastructure" };
  }

  return { retryable: false, reason: "permanent_failure" };
}

export function outboxBackoffMs(attemptCount: number): number {
  return OUTBOX_BASE_BACKOFF_MS * 2 ** Math.max(0, attemptCount - 1);
}

function isTransientPrismaCode(code: string): boolean {
  return ["P1001", "P1008", "P1017", "P2024", "P2034"].includes(code);
}

function isTransientCode(code: string): boolean {
  return [
    "EMAIL_SEND_FAILED",
    "ETIMEDOUT",
    "ECONNABORTED",
    "ECONNRESET",
    "EPIPE",
    "ENETUNREACH",
    "RATE_LIMIT_EXCEEDED",
    "TOO_MANY_REQUESTS",
    "INTERNAL_ERROR",
    "INTERNAL_SERVER_ERROR",
    "BAD_GATEWAY",
    "SERVICE_UNAVAILABLE",
    "GATEWAY_TIMEOUT",
  ].includes(code.toUpperCase());
}

function isTransientMessage(message: string): boolean {
  return /timeout|timed out|connection reset|connection refused|network error|rate limit|\b429\b|\b5\d{2}\b/i.test(
    message,
  );
}
