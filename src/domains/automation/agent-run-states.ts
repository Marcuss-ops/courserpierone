/**
 * src/domains/automation/agent-run-states.ts
 *
 * Phase 5 — Agent Run State Machine.
 *
 * Canonical 9 states for the draft-first agent flow. NO boolean `success`
 * field — the state is the source of truth. Terminal states
 * (`published`, `permanent_failed`, `cancelled`) are explicitly tagged.
 *
 * Mirrors `offer-card-discriminator.ts` pattern:
 *   - typed union of string literals
 *   - `ReadonlySet` of all canonical states (size invariant = 9)
 *   - transition matrix as `Record<from, ReadonlySet<to>>`
 *   - `isValidAgentRunTransition(from, to)` runtime helper
 *   - `isTerminalAgentRunState(state)` runtime helper
 *
 * Domain layer: zero external deps. Used by `agent-job-record.ts`,
 * `agent-registry.ts`, future route handlers, and Prisma mappers.
 *
 * Why a state machine instead of a boolean:
 *   - Retryability is encoded by state transition rules, not by ad-hoc
 *     `if (job.success) ...` branches scattered across the codebase.
 *   - Future status filters (e.g., "show me jobs awaiting approval")
 *     are first-class lookups against the canonical set.
 *   - Schema-level constraint `status: AgentRunState` enforces the
 *     union at the DB boundary when the migration lands.
 */

export type AgentRunState =
  // ── Happy path ────────────────────────────────────────
  | "queued"             // Job submitted, awaiting worker pickup
  | "running"            // Worker actively executing generation
  | "awaiting_approval"  // Draft ready, human review required (per manifest.needsApproval)
  | "approved"           // Creator clicked approve; ready to publish
  | "publishing"         // Worker persisting output to the canonical store
  | "published"          // Output persisted + verified (TERMINAL)
  // ── Failure paths ─────────────────────────────────────
  | "retryable_failed"   // Transient error, will be retried (NOT terminal)
  | "permanent_failed"   // Logic-level / config-level / rejected (TERMINAL)
  // ── Cancellation ─────────────────────────────────────
  | "cancelled";         // User or system cancelled (TERMINAL)

/**
 * Canonical set — size invariant is 9. Tests assert this size to
 * catch drift in the union when adding states (forgotten update of
 * `AGENT_RUN_STATES` causes test failure).
 */
export const AGENT_RUN_STATES: ReadonlySet<AgentRunState> = new Set([
  "queued",
  "running",
  "awaiting_approval",
  "approved",
  "publishing",
  "published",
  "retryable_failed",
  "permanent_failed",
  "cancelled",
]);

/** States from which no further transition is allowed. */
export const TERMINAL_AGENT_RUN_STATES: ReadonlySet<AgentRunState> = new Set([
  "published",
  "permanent_failed",
  "cancelled",
]);

/**
 * Transition matrix: maps each state to the set of states it can
 * legally transition to. Edit BOTH the union AND this matrix when
 * adding a new state — the `canTransition` helper is the runtime
 * check; `isTerminalAgentRunState` is a fast terminal-state lookup.
 *
 * Diagram (visual reference):
 *   queued ─────────► running ──────► awaiting_approval ──► approved ──► publishing ──► published ✓
 *     │                │ │ │              │ │                    │ │            │ │
 *     ▼                ▼ ▼ ▼              ▼ ▼                    ▼ ▼            ▼ ▼
 *   cancelled      cancelled          cancelled              cancelled      permanent_failed
 *                    retryable_failed    permanent_failed      retryable_failed   retryable_failed
 *                    permanent_failed                        permanent_failed
 *
 *   retryable_failed ──► running (retry) | permanent_failed | cancelled
 *
 * Note on "approved" vs "publishing" skipping "awaiting_approval":
 *   - Some agents set `needsApproval = "never"`. The state machine
 *     still surfaces them as "approved" → "publishing" for symmetry
 *     with the approval-required path; the difference is the UI
 *     doesn't render a review screen.
 */
export const AGENT_RUN_STATE_TRANSITIONS: ReadonlyMap<
  AgentRunState,
  ReadonlySet<AgentRunState>
> = new Map<AgentRunState, ReadonlySet<AgentRunState>>([
  [
    "queued",
    new Set<AgentRunState>(["running", "cancelled"]),
  ],
  [
    "running",
    new Set<AgentRunState>([
      "awaiting_approval",
      "approved",
      "retryable_failed",
      "permanent_failed",
      "cancelled",
    ]),
  ],
  [
    "awaiting_approval",
    new Set<AgentRunState>(["approved", "permanent_failed", "cancelled"]),
  ],
  [
    "approved",
    new Set<AgentRunState>([
      "publishing",
      "retryable_failed",
      "permanent_failed",
      "cancelled",
    ]),
  ],
  [
    "publishing",
    new Set<AgentRunState>(["published", "retryable_failed", "permanent_failed"]),
  ],
  ["published", new Set<AgentRunState>([])],
  [
    "retryable_failed",
    new Set<AgentRunState>(["running", "permanent_failed", "cancelled"]),
  ],
  ["permanent_failed", new Set<AgentRunState>([])],
  ["cancelled", new Set<AgentRunState>([])],
]);

/**
 * Runtime check: can the job transition from `from` to `to`?
 * Returns false for terminal states (no outgoing edges) and for
 * any state pair not in the transition matrix.
 */
export function isValidAgentRunTransition(
  from: AgentRunState,
  to: AgentRunState,
): boolean {
  return AGENT_RUN_STATE_TRANSITIONS.get(from)?.has(to) ?? false;
}

/**
 * Fast lookup: is the given state a terminal state?
 * Terminal = no outgoing edges. The published / permanent_failed /
 * cancelled states are the only terminal states in the canonical
 * 9-state machine.
 */
export function isTerminalAgentRunState(state: AgentRunState): boolean {
  return TERMINAL_AGENT_RUN_STATES.has(state);
}

/**
 * Convenience: assertion that throws if a transition is illegal.
 * Use at job-update boundaries (worker, API route) to fail-fast on
 * state-machine corruption.
 */
export function assertValidAgentRunTransition(
  from: AgentRunState,
  to: AgentRunState,
): void {
  if (!isValidAgentRunTransition(from, to)) {
    throw new Error(
      `Invalid AgentRunState transition: ${from} → ${to}. ` +
        `Allowed transitions from ${from}: ${
          Array.from(AGENT_RUN_STATE_TRANSITIONS.get(from) ?? []).join(", ") ||
          "(none — terminal state)"
        }`,
    );
  }
}