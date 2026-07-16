/**
 * src/domains/automation/agent-run-retry-policy.test.ts
 *
 * Unit tests for the AgentErrorReason classifier.
 *
 * Coverage:
 *   - RETRYABLE_AGENT_ERROR_REASONS: exactly 4 reasons
 *   - NON_RETRYABLE_AGENT_ERROR_REASONS: exactly 5 reasons
 *   - classifyAgentError: structured `code` field mapping
 *   - classifyAgentError: Error.message heuristics for each reason
 *   - classifyAgentError: unknown / non-Error fallback
 *   - retryDelayMs: present for retryable, absent for non-retryable
 *   - code field mapping (provider codes \u2192 canonical reason)
 */

import { describe, expect, it } from "vitest";

import {
  classifyAgentError,
  DEFAULT_RETRY_DELAY_MS,
  NON_RETRYABLE_AGENT_ERROR_REASONS,
  RETRYABLE_AGENT_ERROR_REASONS,
  type AgentErrorReason,
} from "./agent-run-retry-policy";

const RETRYABLE_REASONS: AgentErrorReason[] = [
  "timeout",
  "rate_limit",
  "server_5xx",
  "connection_interrupted",
];

const NON_RETRYABLE_REASONS: AgentErrorReason[] = [
  "invalid_input",
  "permission_denied",
  "missing_product",
  "rejected_content",
  "missing_config",
];

describe("RETRYABLE_AGENT_ERROR_REASONS — canonical set", () => {
  it("contains exactly 4 retryable reasons", () => {
    expect(RETRYABLE_AGENT_ERROR_REASONS.size).toBe(4);
  });

  it.each(RETRYABLE_REASONS)("includes '%s'", (reason) => {
    expect(RETRYABLE_AGENT_ERROR_REASONS.has(reason)).toBe(true);
  });

  it("does NOT include non-retryable reasons", () => {
    for (const reason of NON_RETRYABLE_REASONS) {
      expect(RETRYABLE_AGENT_ERROR_REASONS.has(reason)).toBe(false);
    }
  });
});

describe("NON_RETRYABLE_AGENT_ERROR_REASONS — canonical set", () => {
  it("contains exactly 5 non-retryable reasons", () => {
    expect(NON_RETRYABLE_AGENT_ERROR_REASONS.size).toBe(5);
  });

  it.each(NON_RETRYABLE_REASONS)("includes '%s'", (reason) => {
    expect(NON_RETRYABLE_AGENT_ERROR_REASONS.has(reason)).toBe(true);
  });
});

describe("classifyAgentError — structured `code` field (preferred path)", () => {
  it.each(RETRYABLE_REASONS)("classifies canonical retryable code '%s'", (code) => {
    const result = classifyAgentError({ code });
    expect(result.retryable).toBe(true);
    expect(result.reason).toBe(code);
    expect(result.retryDelayMs).toBeGreaterThan(0);
  });

  it.each(NON_RETRYABLE_REASONS)(
    "classifies canonical non-retryable code '%s'",
    (code) => {
      const result = classifyAgentError({ code });
      expect(result.retryable).toBe(false);
      expect(result.reason).toBe(code);
      expect(result.retryDelayMs).toBeUndefined();
    },
  );

  it("classifies provider-specific code RATE_LIMIT_EXCEEDED \u2192 rate_limit (retryable)", () => {
    const result = classifyAgentError({ code: "RATE_LIMIT_EXCEEDED" });
    expect(result.retryable).toBe(true);
    expect(result.reason).toBe("rate_limit");
  });

  it("classifies provider code CONTENT_REJECTED \u2192 rejected_content (non-retryable)", () => {
    const result = classifyAgentError({ code: "CONTENT_REJECTED" });
    expect(result.retryable).toBe(false);
    expect(result.reason).toBe("rejected_content");
  });

  it("classifies provider code ECONNRESET \u2192 connection_interrupted (retryable)", () => {
    const result = classifyAgentError({ code: "ECONNRESET" });
    expect(result.retryable).toBe(true);
    expect(result.reason).toBe("connection_interrupted");
  });

  it("classifies provider code SERVICE_UNAVAILABLE \u2192 server_5xx (retryable)", () => {
    const result = classifyAgentError({ code: "SERVICE_UNAVAILABLE" });
    expect(result.retryable).toBe(true);
    expect(result.reason).toBe("server_5xx");
  });
});

describe("classifyAgentError — Error.message heuristics (fallback)", () => {
  it("classifies Error('Request timeout') \u2192 timeout (retryable)", () => {
    const result = classifyAgentError(new Error("Request timeout exceeded"));
    expect(result.reason).toBe("timeout");
    expect(result.retryable).toBe(true);
  });

  it("classifies Error('429 Too Many Requests') \u2192 rate_limit (retryable)", () => {
    const result = classifyAgentError(new Error("Server returned 429 Too Many Requests"));
    expect(result.reason).toBe("rate_limit");
    expect(result.retryable).toBe(true);
  });

  it("classifies Error('500 Internal Server Error') \u2192 server_5xx (retryable)", () => {
    const result = classifyAgentError(new Error("500 Internal Server Error"));
    expect(result.reason).toBe("server_5xx");
    expect(result.retryable).toBe(true);
  });

  it("classifies AbortError \u2192 timeout (retryable)", () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    const result = classifyAgentError(err);
    expect(result.reason).toBe("timeout");
    expect(result.retryable).toBe(true);
  });

  it("classifies Error('ECONNRESET') \u2192 connection_interrupted (retryable)", () => {
    const result = classifyAgentError(new Error("ECONNRESET: read ECONNRESET"));
    expect(result.reason).toBe("connection_interrupted");
    expect(result.retryable).toBe(true);
  });

  it("classifies Error('validation failed: missing field') \u2192 invalid_input (non-retryable)", () => {
    const result = classifyAgentError(new Error("validation failed: missing field"));
    expect(result.reason).toBe("invalid_input");
    expect(result.retryable).toBe(false);
  });

  it("classifies Error('Permission denied') \u2192 permission_denied (non-retryable)", () => {
    const result = classifyAgentError(new Error("Permission denied"));
    expect(result.reason).toBe("permission_denied");
    expect(result.retryable).toBe(false);
  });

  it("classifies Error('Content rejected by policy') \u2192 rejected_content (non-retryable)", () => {
    const result = classifyAgentError(new Error("Content rejected by policy"));
    expect(result.reason).toBe("rejected_content");
    expect(result.retryable).toBe(false);
  });
});

describe("classifyAgentError — fallback path", () => {
  it("returns reason='unknown' for non-Error, non-structured input", () => {
    const result = classifyAgentError("just a string");
    expect(result.reason).toBe("unknown");
    expect(result.retryable).toBe(false);
  });

  it("returns reason='unknown' for null", () => {
    const result = classifyAgentError(null);
    expect(result.reason).toBe("unknown");
    expect(result.retryable).toBe(false);
  });

  it("returns reason='unknown' for unrecognized Error.message", () => {
    const result = classifyAgentError(new Error("Something completely unexpected"));
    expect(result.reason).toBe("unknown");
    expect(result.retryable).toBe(false);
  });
});

describe("classifyAgentError — retryDelayMs invariant", () => {
  it("retryable results always include retryDelayMs", () => {
    for (const code of RETRYABLE_REASONS) {
      const result = classifyAgentError({ code });
      expect(result.retryDelayMs).toBeGreaterThan(0);
    }
  });

  it("non-retryable results never include retryDelayMs", () => {
    for (const code of NON_RETRYABLE_REASONS) {
      const result = classifyAgentError({ code });
      expect(result.retryDelayMs).toBeUndefined();
    }
  });

  it("DEFAULT_RETRY_DELAY_MS is a positive number", () => {
    expect(DEFAULT_RETRY_DELAY_MS).toBeGreaterThan(0);
  });
});

describe("classifyAgentError — message preservation", () => {
  it("preserves Error.message when classifying", () => {
    const err = new Error("specific error context");
    const result = classifyAgentError(err);
    expect(result.message).toBe("specific error context");
  });

  it("preserves string message when input is a string", () => {
    const result = classifyAgentError("plain string error");
    expect(result.message).toBe("plain string error");
  });
});