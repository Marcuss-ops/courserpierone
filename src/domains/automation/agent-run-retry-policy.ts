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

const PROVIDER_CODE_TO_REASON: Readonly<Record<string, AgentErrorReason>> = {
  ETIMEDOUT: "timeout",
  ESOCKETTIMEDOUT: "timeout",
  ECONNABORTED: "timeout",
  ECONNRESET: "connection_interrupted",
  EPIPE: "connection_interrupted",
  ENETUNREACH: "connection_interrupted",
  RATE_LIMIT_EXCEEDED: "rate_limit",
  TOO_MANY_REQUESTS: "rate_limit",
  INVALID_ARGUMENT: "invalid_input",
  INVALID_PARAMS: "invalid_input",
  VALIDATION_ERROR: "invalid_input",
  PERMISSION_DENIED: "permission_denied",
  FORBIDDEN: "permission_denied",
  UNAUTHORIZED: "permission_denied",
  NOT_FOUND: "missing_product",
  PRODUCT_NOT_FOUND: "missing_product",
  CONTENT_REJECTED: "rejected_content",
  POLICY_VIOLATION: "rejected_content",
  MODERATION_REJECTED: "rejected_content",
  MISSING_CONFIG: "missing_config",
  CONFIGURATION_ERROR: "missing_config",
  INTERNAL_ERROR: "server_5xx",
  INTERNAL_SERVER_ERROR: "server_5xx",
  BAD_GATEWAY: "server_5xx",
  SERVICE_UNAVAILABLE: "server_5xx",
  GATEWAY_TIMEOUT: "server_5xx",
  EMAIL_SEND_FAILED: "connection_interrupted",
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
    const code = (error).code;
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
  const canonical = code as AgentErrorReason;
  if (
    RETRYABLE_AGENT_ERROR_REASONS.has(canonical) ||
    NON_RETRYABLE_AGENT_ERROR_REASONS.has(canonical)
  ) {
    return canonical;
  }
  return PROVIDER_CODE_TO_REASON[code.toUpperCase()] ?? null;
}

/**
 * FALLBACK ONLY: maps an Error.message to a canonical reason. Brittle
 * (string matching); use only when the provider does NOT emit a
 * structured `code` field. Adding new reasons should always go through
 * `mapCodeToReason` first; this helper is the last-resort safety net.
 */
const MESSAGE_RULES: readonly {
  reason: AgentErrorReason;
  pattern: RegExp;
}[] = [
  { reason: "timeout", pattern: /aborterror|timeout|timed out/i },
  { reason: "rate_limit", pattern: /rate limit|too many requests|\b429\b/i },
  {
    reason: "server_5xx",
    pattern: /\b(500|502|503|504)\b|internal server error|bad gateway|service unavailable/i,
  },
  {
    reason: "connection_interrupted",
    pattern: /econnreset|connection reset|econnrefused|network error/i,
  },
  { reason: "invalid_input", pattern: /invalid input|validation failed/i },
  { reason: "permission_denied", pattern: /permission denied|forbidden|unauthorized/i },
  { reason: "missing_product", pattern: /product not found|missing product/i },
  { reason: "rejected_content", pattern: /rejected|policy violation|content policy/i },
  { reason: "missing_config", pattern: /missing config|configuration error/i },
];

function mapMessageToReason(error: Error): AgentErrorReason | null {
  const source = `${error.name} ${error.message}`;
  return MESSAGE_RULES.find((rule) => rule.pattern.test(source))?.reason ?? null;
}

function getMessageFromError(error: unknown): string | undefined {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return undefined;
}
