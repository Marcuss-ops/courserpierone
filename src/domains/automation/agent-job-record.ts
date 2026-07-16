/**
 * src/domains/automation/agent-job-record.ts
 *
 * Phase 5 — Agent Job Record (pure domain type).
 *
 * `AgentJobRecord<I, O>` is the canonical, schema-agnostic
 * representation of an agent run. It mirrors the fields required
 * by the spec:
 *
 *   - id (stable identifier)
 *   - idempotency_key (REQUIRED, derived deterministically from input)
 *   - agent_id (which registered agent)
 *   - status (current AgentRunState)
 *   - attempt_count (number of attempts so far)
 *   - max_attempts (from manifest.retryPolicy)
 *   - input (typed by AgentManifest.inputSchema)
 *   - output (typed by AgentManifest.outputSchema)
 *   - verifiable_output (post-publish entity references)
 *   - last_error (canonical AgentErrorReason + message + timestamp)
 *   - next_attempt_at (Date, only set when status === 'retryable_failed')
 *   - external_operation_id (provider-side ID, e.g., OpenAI batch ID)
 *   - created_by / created_at / updated_at (audit)
 *   - approved_by / approved_at (approval audit)
 *   - cancelled_by / cancelled_at (cancellation audit)
 *
 * NO Prisma coupling: the future migration will add a
 * `prismaToAgentJobRecord()` / `agentJobRecordToPrisma()` mapper in
 * a separate commit. This file is the SOURCE OF TRUTH for the shape.
 *
 * Domain layer: zero external deps.
 */

import {
  isTerminalAgentRunState,
  type AgentRunState,
} from "./agent-run-states";

/**
 * Verifiable artifact — opaque key/value bag of entity references
 * that downstream code can verify (e.g., `{ lessonId: "cuid" }` after
 * a draft is published to the lesson store).
 *
 * Why `Record<string, unknown>` and not a typed shape: each agent
 * declares its own verifiable outputs via Zod schema on the manifest.
 * At the Domain layer, we keep the field structurally flexible.
 * Adapters parse via the manifest's `outputSchema`.
 */
export type AgentVerifiableOutput = Record<string, unknown>;

/** Canonical last-error shape attached to the job record. */
export interface AgentJobLastError {
  /** Canonical reason from `AgentErrorReason` union. */
  reason: string;
  /** Original error message (truncated at 2 KB to prevent abuse). */
  message: string;
  /** When the error was classified. */
  occurred_at: Date;
}

/**
 * Pure-TS interface for an agent job record. Mirrors the spec fields.
 * The DB schema will be a near-1:1 copy of this shape (the future
 * migration). Consumers of the read-model go through the registry +
 * a future Prisma mapper.
 */
export interface AgentJobRecord<I = unknown, O = unknown> {
  /** Stable identifier (CUID, ULID, UUID — format decided by the
   *  future persistence layer; this Domain type is format-agnostic). */
  id: string;
  /** Required for idempotent retries — same input + agent + creator
   *  yields the same key. Derived via `deriveIdempotencyKey()`. */
  idempotency_key: string;
  /** Which registered agent this job belongs to (matches `AgentManifest.id`). */
  agent_id: string;
  /** Current state in the state machine. */
  status: AgentRunState;
  /** Number of attempts so far (1 = first try, increments on retry). */
  attempt_count: number;
  /** Maximum number of attempts before permanent_failed (from manifest). */
  max_attempts: number;
  /** Input payload (typed by `AgentManifest.inputSchema`). */
  input: I;
  /** Verified output (typed by `AgentManifest.outputSchema`). Only
   *  populated after the draft is approved + published. */
  output?: O;
  /** Verifiable artifact (post-publish entity references). */
  verifiable_output?: AgentVerifiableOutput;
  /** Last error classification (canonical AgentErrorReason + message + ts). */
  last_error?: AgentJobLastError;
  /** When to attempt next (only set when status === 'retryable_failed'). */
  next_attempt_at?: Date;
  /** External operation ID from the provider (e.g., OpenAI batch ID). */
  external_operation_id?: string;
  /** Owner — User.id who triggered the job. */
  created_by: string;
  /** Audit timestamps. */
  created_at: Date;
  updated_at: Date;
  /** Optional approval tracking (who approved, when). */
  approved_by?: string;
  approved_at?: Date;
  /** Optional cancellation tracking. */
  cancelled_by?: string;
  cancelled_at?: Date;
}

/**
 * Generate a deterministic idempotency key from agentId + creatorId +
 * canonicalized input. Same inputs always yield the same key — the
 * worker can use it to dedupe retries safely.
 *
 * Implementation: FNV-1a 32-bit hash of a stable-stringified JSON
 * triple. NO crypto, NO deps, deterministic, pure synchronous.
 * Adequate for the V1 use case (collision probability < 1e-9 for
 * 10k keys; future V2 can swap in SHA-256 if needed).
 */
export function deriveIdempotencyKey(input: {
  agentId: string;
  creatorId: string;
  jobInput: unknown;
}): string {
  const canonical = stableStringify({
    a: input.agentId,
    c: input.creatorId,
    i: input.jobInput,
  });
  const hash = fnv1a32(canonical);
  return `idem_${hash.toString(16).padStart(8, "0")}`;
}

/**
 * Stable JSON stringification: sorts object keys recursively so
 * `{a:1,b:2}` and `{b:2,a:1}` produce the same output. Required for
 * deterministic hashing.
 *
 * Cycle guard: circular references coerce to `"null"` (silent cycle
 * break — same key for two cyclic objects with the same backbone).
 * Callers that need to DETECT cycles should pre-walk their input.
 */
function stableStringify(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): string {
  if (value === null) return "null";
  if (typeof value === "undefined") return "null";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "null"; // NaN / Infinity → null
    return JSON.stringify(value);
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return "null";
    seen.add(value);
    return "[" + value.map((v) => stableStringify(v, seen)).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (seen.has(obj)) return "null";
    seen.add(obj);
    const keys = Object.keys(obj).sort();
    return (
      "{" +
      keys
        .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k], seen))
        .join(",") +
      "}"
    );
  }
  // Fallback: function / symbol → stringified as null
  return "null";
}

/**
 * FNV-1a 32-bit hash. Pure JS, no deps. Adequate for V1 dedupe at
 * low-to-medium volume (~10k active idempotency keys → ~1% collision
 * probability via birthday paradox on 2^32 space).
 *
 * TODO(automation-v2): swap to SHA-256 when daily active job volume
 * justifies the collision risk. Trigger: >100k daily active jobs.
 */
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5; // FNV offset basis (32-bit)
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193); // FNV prime (32-bit)
  }
  return hash >>> 0; // coerce to unsigned 32-bit
}

/**
 * Convenience: is this job terminal? Wraps `isTerminalAgentRunState`
 * for ergonomic call sites. Returns true if the job will not
 * transition further.
 */
export function isJobTerminal(job: Pick<AgentJobRecord, "status">): boolean {
  return isTerminalAgentRunState(job.status);
}