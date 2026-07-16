/**
 * src/domains/automation/rules/apply-agent-failure.ts
 *
 * Phase 5 — Agent Job Failure (Domain rule).
 *
 * Pure helper that turns a classified error into the next job state.
 * Encapsulates the retry decision so that `run-agent-job` and
 * `publish-agent-job` share the same logic.
 */

import {
  DEFAULT_RETRY_DELAY_MS,
  type AgentErrorClassification,
} from "../agent-run-retry-policy";
import type { AgentJobRecord } from "../agent-job-record";
import type { AgentRetryPolicy } from "../agent-registry";

const MAX_ERROR_MESSAGE_LENGTH = 2048;

export interface ApplyAgentFailureInput {
  job: AgentJobRecord;
  classification: AgentErrorClassification;
  retryPolicy: AgentRetryPolicy;
  now: Date;
}

function truncateMessage(message: string): string {
  if (message.length <= MAX_ERROR_MESSAGE_LENGTH) return message;
  return message.slice(0, MAX_ERROR_MESSAGE_LENGTH) + "…";
}

/**
 * Apply a classified failure to a job record.
 *
 * Returns a new record in `retryable_failed` (with `next_attempt_at`) if
 * the error is retryable and attempts remain; otherwise returns a new
 * record in `permanent_failed`.
 */
export function applyAgentFailure(
  input: ApplyAgentFailureInput,
): AgentJobRecord {
  const { job, classification, retryPolicy, now } = input;

  const isRetryableReason =
    classification.retryable &&
    !retryPolicy.neverRetryReasons?.has(classification.reason);

  if (isRetryableReason && job.attempt_count < job.max_attempts) {
    const delayMs = Math.min(
      classification.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
      retryPolicy.defaultDelayMs,
    );
    return {
      ...job,
      status: "retryable_failed",
      last_error: {
        reason: classification.reason,
        message: truncateMessage(classification.message ?? ""),
        occurred_at: now,
      },
      next_attempt_at: new Date(now.getTime() + delayMs),
      updated_at: now,
    };
  }

  return {
    ...job,
    status: "permanent_failed",
    last_error: {
      reason: classification.reason,
      message: classification.message ?? "",
      occurred_at: now,
    },
    next_attempt_at: undefined,
    updated_at: now,
  };
}
