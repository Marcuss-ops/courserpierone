/**
 * src/domains/automation/agent-registry.ts
 *
 * Phase 5 — Agent Registry (Domain layer).
 *
 * The canonical registry of all agent manifests the platform knows
 * about. Each manifest declares:
 *
 *   - id                  → stable identifier (AgentId brand)
 *   - displayName         → human-readable label for the UI
 *   - actions             → what the agent can do (typed enum)
 *   - langs               → supported output locales (empty = agnostic)
 *   - needsApproval       → "always" | "never" | "configurable"
 *   - provider            → which provider executes the agent
 *   - retryPolicy         → per-agent retry config (max attempts, base delay)
 *   - inputSchema         → Zod schema for the input payload
 *   - outputSchema        → Zod schema for the output payload
 *
 * Pattern: module-level `Map` singleton. Mirrors `RANKING_POLICIES`
 * from `src/domains/discovery/policies/policy-registry.ts`:
 *   - Frozen-style access via `ReadonlyMap`
 *   - Private mutable Map + `registerAgent()` mutation surface
 *   - Hot-add supported but rare (most agents registered at startup)
 *
 * Generic `AgentManifest<I, O>` keeps per-agent type-safety via the
 * Zod schemas; the registry's Map values are erased to
 * `AgentManifest` (input/output typed as `unknown`). Per-agent generic
 * typing is restored at the call site via the inputSchema/outputSchema.
 *
 * Domain layer: imports zod only. NO Prisma.
 */

import type { z } from "zod";

import type { AgentErrorReason } from "./agent-run-retry-policy";

// ─── Branded AgentId ────────────────────────────────────────────────

/**
 * Branded string to prevent cross-agent key confusion at compile time.
 * Use `asAgentId(value)` to mint a value at runtime; declare literals
 * directly (`const id: AgentId = "post-generator-it"`).
 */
export type AgentId = string & { readonly __brand: "AgentId" };

/** Mint an AgentId from a plain string. Pure function. */
export function asAgentId(value: string): AgentId {
  return value as AgentId;
}

// ─── Agent enum types ───────────────────────────────────────────────

/** What the agent does — typed enum for UI/route filter. */
export type AgentAction =
  | "generate_post"
  | "generate_lesson_outline"
  | "translate_content"
  | "summarize_lesson"
  | "draft_email"
  | "generate_quiz";

/** Which provider executes the agent. "noop" is for tests + deterministic flows. */
export type AgentProvider =
  | "openai"
  | "anthropic"
  | "inhouse"
  | "noop";

/** Whether the agent requires human approval before publishing. */
export type ApprovalRequirement = "always" | "never" | "configurable";

// ─── Retry policy ────────────────────────────────────────────────────

export interface AgentRetryPolicy {
  /** Max attempts (1 = no retry, just first try; 3 = up to 3 tries). */
  maxAttempts: number;
  /**
   * Per-agent cap on retry delay (ms). The job runner uses
   * `min(reasonDefaultDelay, defaultDelayMs)` — reason-specific delays
   * come from `REASON_DEFAULT_DELAY_MS` in `agent-run-retry-policy.ts`.
   * Defaults: 5000 for timeout / connection_interrupted, 10000 for
   * server_5xx, 30000 for rate_limit. This cap applies ON TOP.
   */
  defaultDelayMs: number;
  /**
   * Optional per-agent override: which error reasons are NEVER retryable
   * for THIS agent, regardless of the canonical retryable set.
   * Use case: an agent that handles rate limits internally and never
   * wants to be retried on `rate_limit`. Empty Set = use the canonical
   * RETRYABLE_AGENT_ERROR_REASONS set.
   */
  neverRetryReasons?: ReadonlySet<AgentErrorReason>;
}

// ─── Agent manifest ─────────────────────────────────────────────────

export interface AgentManifest<I = unknown, O = unknown> {
  /** Stable identifier (slug, e.g., "post-generator-it"). */
  id: AgentId;
  /** Human-readable label for the UI. */
  displayName: string;
  /** What the agent does — one or more actions. */
  actions: readonly AgentAction[];
  /** Supported output locales. Empty array = locale-agnostic. */
  langs: readonly string[];
  /** Approval requirement before publishing. */
  needsApproval: ApprovalRequirement;
  /** Which provider executes the agent. */
  provider: AgentProvider;
  /** Per-agent retry configuration. */
  retryPolicy: AgentRetryPolicy;
  /** Zod schema to validate the input payload (parsed at submit time). */
  inputSchema: z.ZodType<I>;
  /** Zod schema to validate the output payload (parsed before saving). */
  outputSchema: z.ZodType<O>;
}

// ─── Registry singleton ─────────────────────────────────────────────

/**
 * Module-private mutable Map. Exposed read-only via `AGENT_REGISTRY`
 * for the public access surface. Mutation goes through `registerAgent`
 * (which can throw on duplicate ids).
 */
const _registry = new Map<AgentId, AgentManifest>();

/**
 * Public read-only view of the registry. Read with `AGENT_REGISTRY.get(id)`,
 * `AGENT_REGISTRY.has(id)`, or `AGENT_REGISTRY.values()`. Mutate via
 * `registerAgent()` (which is the only sanctioned mutation path).
 */
export const AGENT_REGISTRY: ReadonlyMap<AgentId, AgentManifest> = _registry;

/**
 * Register an agent manifest. Throws on duplicate id (the registry
 * must be deterministic; an idempotent register-twice would silently
 * mask config drift).
 *
 * The function is generic `<I, O>` so per-agent input/output types
 * are preserved at the call site, but the registry stores them
 * erased (the Map value is `AgentManifest`).
 */
export function registerAgent<I, O>(
  manifest: AgentManifest<I, O>,
): void {
  if (_registry.has(manifest.id)) {
    throw new Error(
      `Agent "${manifest.id}" is already registered. ` +
        `Use _resetAgentRegistryForTests() in test setup if you intend to re-register.`,
    );
  }
  _registry.set(manifest.id, manifest);
}

/** Lookup an agent by id. Returns undefined if not registered. */
export function getAgent(id: AgentId): AgentManifest | undefined {
  return _registry.get(id);
}

/** True if the agent id is registered. */
export function isAgentRegistered(id: AgentId): boolean {
  return _registry.has(id);
}

/** Snapshot of all registered agent ids (snapshot, not live view). */
export function listAgentIds(): readonly AgentId[] {
  return Array.from(_registry.keys());
}

/** Snapshot of all registered manifests (snapshot, not live view). */
export function listAgents(): readonly AgentManifest[] {
  return Array.from(_registry.values());
}

/**
 * Test-only escape hatch: clears the registry between test runs.
 * NOT exported via the index barrel — test files import it directly
 * from this module. Marked with the underscore prefix as a visual
 * signal that production code should not call this.
 */
export function _resetAgentRegistryForTests(): void {
  _registry.clear();
}