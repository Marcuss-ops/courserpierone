/**
 * src/domains/automation/agent-run-retry-policy.ts
 *
 * Phase 5 — Agent Run Retry Policy (Domain layer).
 *
 * Canonical retry classifier per spec:
 *   RETRY (transient):       timeout / rate_limit / server_5xx / connection_interrupted
 *   NEVER retry (deterministic): invalid_input / permission_denied / missing_product / rejected_content / missing_config
 *
 * Pure function classifier, no retry engine. Caller schedules retries.
 * Per-agent overrides declared on `AgentManifest.retryPolicy` (see agent-registry.ts).
 *
 * Domain layer: zero external deps.
 */

export type AgentErrorReason =
  // Transient (retryable)
  | "timeout"
  | "rate_limit"
  | "server_5xx"
  | "connection_interrupted"
  // Deterministic (NEVER retry)
  | "invalid_input"
  | "permission_denied"
  | "missing_product"
  | "rejected_content"
  | "missing_config"
  // Catch-all
  | "unknown";

/** Reasons that ARE retryable (canonical set). */
export const RETRYABLE_AGENT_ERROR_REASONS: ReadonlySet<AgentErrorReason> =
  new Set<AgentErrorReason>([
    "timeout",
    "rate_limit",
    "server_5xx",
    "connection_interrupted",
  ]);

/** Reasons that are NEVER retryable (canonical set). */
export const NON_RETRYABLE_AGENT_ERROR_REASONS: ReadonlySet<AgentErrorReason> =
  new Set<AgentErrorReason>([
    "invalid_input",
    "permission_denied",
    "missing_product",
    "rejected_content",
    "missing_config",
  ]);

export interface AgentErrorClassification {
  retryable: boolean;
  reason: AgentErrorReason;
  /** Present iff retryable=true. Omitted otherwise to keep the union minimal. */
  retryDelayMs?: number;
  /** Original error message (for the audit log on the job record). */
  message?: string;
}

/** Fallback delay when a reason has no specific default. */
export const DEFAULT_RETRY_DELAY_MS = 5_000;

/**
 * Per-reason default retry delay (ms). The job runner should use
 * `min(reasonDelay, agentManifest.retryPolicy.defaultDelayMs)` when
 * honoring a per-agent cap.
 */
const REASON_DEFAULT_DELAY_MS: Readonly<Record<AgentErrorReason, number>> = {
  timeout: 5_000,
  rate_limit: 30_000,
  server_5xx: 10_000,
  connection_interrupted: 5_000,
  invalid_input: 0,
  permission_denied: 0,
  missing_product: 0,
  rejected_content: 0,
  missing_config: 0,
  unknown: 0,
};

/**
 * Classify an unknown error into a canonical retry decision.
 *
 * Lookup order (preferred → fallback):
 *   1. Structured `code` field on the thrown value (preferred — provider adapters
 *      emit this).
 *   2. Error.message heuristics (FALLBACK ONLY — brittle, may misclassify).
 *   3. Non-Error / unrecognized → reason="unknown", retryable=false (safe default).
 */
export function classifyAgentError(error: unknown): AgentErrorClassification {
  // Path 1: structured `code` field
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === "string") {
      const reason = mapCodeToReason(code);
      if (reason !== null) {
        return buildClassification(reason, getMessageFromError(error));
      }
    }
  }

  // Path 2: Error.message heuristics (FALLBACK ONLY — see mapMessageToReason JSDoc)
  if (error instanceof Error) {
    const reason = mapMessageToReason(error);
    if (reason !== null) {
      return buildClassification(reason, error.message);
    }
  }

  // Path 3: conservative default
  return { retryable: false, reason: "unknown", message: getMessageFromError(error) };
}

function buildClassification(
  reason: AgentErrorReason,
  message?: string,
): AgentErrorClassification {
  const retryable = RETRYABLE_AGENT_ERROR_REASONS.has(reason);
  return {
    retryable,
    reason,
    ...(retryable
      ? { retryDelayMs: REASON_DEFAULT_DELAY_MS[reason] ?? DEFAULT_RETRY_DELAY_MS }
      : {}),
    ...(message ? { message } : {}),
  };
}

function mapCodeToReason(code: string): AgentErrorReason | null {
  // Direct canonical match (case-sensitive — callers should pass lowercase canonical)
  if (
    RETRYABLE_AGENT_ERROR_REASONS.has(code as AgentErrorReason) ||
    NON_RETRYABLE_AGENT_ERROR_REASONS.has(code as AgentErrorReason)
  ) {
    return code as AgentErrorReason;
  }
  // Provider-specific codes (uppercase). Add new mappings here when adding
  // a new provider; the canonical-reason matches above are checked first.
  switch (code.toUpperCase()) {
    case "ETIMEDOUT":
    case "ESOCKETTIMEDOUT":
    case "ECONNABORTED":
      return "timeout";
    case "ECONNRESET":
    case "EPIPE":
    case "ENETUNREACH":
      return "connection_interrupted";
    case "RATE_LIMIT_EXCEEDED":
    case "TOO_MANY_REQUESTS":
      return "rate_limit";
    case "INVALID_ARGUMENT":
    case "INVALID_PARAMS":
    case "VALIDATION_ERROR":
      return "invalid_input";
    case "PERMISSION_DENIED":
    case "FORBIDDEN":
    case "UNAUTHORIZED":
      return "permission_denied";
    case "NOT_FOUND":
    case "PRODUCT_NOT_FOUND":
      return "missing_product";
    case "CONTENT_REJECTED":
    case "POLICY_VIOLATION":
    case "MODERATION_REJECTED":
      return "rejected_content";
    case "MISSING_CONFIG":
    case "CONFIGURATION_ERROR":
      return "missing_config";
    case "INTERNAL_ERROR":
    case "INTERNAL_SERVER_ERROR":
    case "BAD_GATEWAY":
    case "SERVICE_UNAVAILABLE":
    case "GATEWAY_TIMEOUT":
      return "server_5xx";
    default:
      return null;
  }
}

/**
 * FALLBACK ONLY: maps an Error.message to a canonical reason. Brittle
 * (string matching); use only when the provider does NOT emit a
 * structured `code` field. Adding new reasons should always go through
 * `mapCodeToReason` first; this helper is the last-resort safety net.
 */
function mapMessageToReason(error: Error): AgentErrorReason | null {
  const msg = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  if (name === "aborterror" || msg.includes("timeout") || msg.includes("timed out")) {
    return "timeout";
  }
  if (msg.includes("rate limit") || msg.includes("too many requests") || msg.includes(" 429")) {
    return "rate_limit";
  }
  if (
    /\b(500|502|503|504)\b/.test(msg) ||
    msg.includes("internal server error") ||
    msg.includes("bad gateway") ||
    msg.includes("service unavailable")
  ) {
    return "server_5xx";
  }
  if (
    msg.includes("econnreset") ||
    msg.includes("connection reset") ||
    msg.includes("econnrefused") ||
    msg.includes("network error")
  ) {
    return "connection_interrupted";
  }
  if (msg.includes("invalid input") || msg.includes("validation failed")) {
    return "invalid_input";
  }
  if (
    msg.includes("permission denied") ||
    msg.includes("forbidden") ||
    msg.includes("unauthorized")
  ) {
    return "permission_denied";
  }
  if (msg.includes("product not found") || msg.includes("missing product")) {
    return "missing_product";
  }
  if (
    msg.includes("rejected") ||
    msg.includes("policy violation") ||
    msg.includes("content policy")
  ) {
    return "rejected_content";
  }
  if (msg.includes("missing config") || msg.includes("configuration error")) {
    return "missing_config";
  }
  return null;
}

function getMessageFromError(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return undefined;
}