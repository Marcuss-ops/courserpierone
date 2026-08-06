import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  classifyOutboxError,
  outboxBackoffMs,
  OUTBOX_BASE_BACKOFF_MS,
} from "./retry-policy";

describe("outbox retry policy", () => {
  it("dead-letters invalid Zod payloads", () => {
    const result = classifyOutboxError(
      z.object({ value: z.string() }).safeParse({ value: 1 }).error,
    );

    expect(result).toEqual({
      retryable: false,
      reason: "payload_invalid",
    });
  });

  it("retries transient provider failures", () => {
    const error = Object.assign(new Error("SMTP timeout"), {
      code: "EMAIL_SEND_FAILED",
    });

    expect(classifyOutboxError(error)).toEqual({
      retryable: true,
      reason: "transient_infrastructure",
    });
  });

  it("retries transient Prisma infrastructure errors", () => {
    const error = new Prisma.PrismaClientKnownRequestError("timeout", {
      code: "P2024",
      clientVersion: "5.22.0",
    });

    expect(classifyOutboxError(error)).toEqual({
      retryable: true,
      reason: "transient_infrastructure",
    });
  });

  it("uses a conservative terminal decision for unknown errors", () => {
    expect(classifyOutboxError(new Error("unexpected business failure"))).toEqual({
      retryable: false,
      reason: "permanent_failure",
    });
  });

  it("uses exponential infrastructure backoff", () => {
    expect(outboxBackoffMs(1)).toBe(OUTBOX_BASE_BACKOFF_MS);
    expect(outboxBackoffMs(2)).toBe(OUTBOX_BASE_BACKOFF_MS * 2);
    expect(outboxBackoffMs(3)).toBe(OUTBOX_BASE_BACKOFF_MS * 4);
  });
});
