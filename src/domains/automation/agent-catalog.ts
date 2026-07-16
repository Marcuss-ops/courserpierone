/**
 * src/domains/automation/agent-catalog.ts
 *
 * Agent Catalog — meta-registry of canonical agent enums + default
 * retry policy (Courssy). Pairs with agent-registry.ts (which holds
 * AGENT_REGISTRY runtime Map + AgentManifest interface).
 *
 * This file is NOT a runtime registration surface — use
 * agent-registry.ts for live registration / dispatch. The catalog
 * here is the Zod-validated metadata layer that:
 *
 *   1. pins the AgentAction / AgentProvider / ApprovalRequirement
 *      enum values as Zod schemas (so route handlers, payload
 *      parsers, and admin UIs validate against the SAME enum strings
 *      the registry uses);
 *   2. exports the canonical DEFAULT_RETRY_POLICY (maxAttempts +
 *      defaultDelayMs) which Agent manifests inherit by default;
 *   3. self-validates on load: any drift between code and metadata
 *      throws at module import \u2014 a typo in a provider name fails
 *      fast (vs silent production drift).
 *
 * Why a separate file vs the registry Map:
 *   - The Map is hot-loaded with side effects (registerAgent stores);
 *     catalog is metadata-only.
 *   - Adding a field to AgentManifest affects registration+execution
 *     but NOT catalog (catalog is a frozen, validated subset).
 *   - Zod self-validation at module-load catches drift instantly.
 */

import { z } from "zod";

// ─── Agent action enum ───────────────────────────────────────────

/** What the agent does — typed enum for UI/route filter. */
export const AGENT_ACTIONS = [
  "generate_post",
  "generate_lesson_outline",
  "translate_content",
  "summarize_lesson",
  "draft_email",
  "generate_quiz",
] as const;

export const agentActionSchema = z.enum(AGENT_ACTIONS);

export type AgentAction = z.infer<typeof agentActionSchema>;

// ─── Agent provider enum ─────────────────────────────────────────

/** Which provider executes the agent. "noop" is for tests + deterministic flows. */
export const AGENT_PROVIDERS = [
  "openai",
  "anthropic",
  "inhouse",
  "noop",
] as const;

export const agentProviderSchema = z.enum(AGENT_PROVIDERS);

export type AgentProvider = z.infer<typeof agentProviderSchema>;

// ─── Approval requirement enum ──────────────────────────────────

/** Whether the agent requires human approval before publishing. */
export const APPROVAL_REQUIREMENTS = [
  "always",
  "never",
  "configurable",
] as const;

export const approvalRequirementSchema = z.enum(APPROVAL_REQUIREMENTS);

export type ApprovalRequirement = z.infer<typeof approvalRequirementSchema>;

// ─── Default retry policy ------------------------------------------

/**
 * Default retry policy for agents that don&rsquo;t carry one explicitly.
 * Mirrors the canonical defaults in agent-registry.ts#AgentRetryPolicy.
 * Per-agent overrides live on `AgentManifest.retryPolicy`.
 */
export const DEFAULT_RETRY_POLICY = {
  maxAttempts: 3,
  defaultDelayMs: 5_000,
} as const;

export const defaultRetryPolicySchema = z.object({
  maxAttempts: z.number().int().positive(),
  defaultDelayMs: z.number().int().nonnegative(),
});

// ─── Self-validation on module load ─────────────────────────────

// Validate enum lengths + the default retry policy at import time.
if (AGENT_ACTIONS.length !== new Set(AGENT_ACTIONS).size) {
  throw new Error(
    `AGENT_ACTIONS has ${AGENT_ACTIONS.length} entries but only ${new Set(AGENT_ACTIONS).size} unique values (duplicate in catalog)`,
  );
}
if (AGENT_PROVIDERS.length !== new Set(AGENT_PROVIDERS).size) {
  throw new Error(
    `AGENT_PROVIDERS has ${AGENT_PROVIDERS.length} entries but only ${new Set(AGENT_PROVIDERS).size} unique values (duplicate in catalog)`,
  );
}
if (APPROVAL_REQUIREMENTS.length !== new Set(APPROVAL_REQUIREMENTS).size) {
  throw new Error(
    `APPROVAL_REQUIREMENTS has ${APPROVAL_REQUIREMENTS.length} entries but only ${new Set(APPROVAL_REQUIREMENTS).size} unique values (duplicate in catalog)`,
  );
}
defaultRetryPolicySchema.parse(DEFAULT_RETRY_POLICY);

// ─── Lookup helpers ─────────────────────────────────────────────

/** Count of agent actions (for analytics / admin-UI dropdowns). */
export const AGENT_ACTION_COUNT = AGENT_ACTIONS.length;

/** Count of providers. */
export const AGENT_PROVIDER_COUNT = AGENT_PROVIDERS.length;

/** Count of approval requirement values. */
export const APPROVAL_REQUIREMENT_COUNT = APPROVAL_REQUIREMENTS.length;

/** Runtime check: is `value` a valid AgentAction? */
export function isAgentAction(value: unknown): value is AgentAction {
  return agentActionSchema.safeParse(value).success;
}

/** Runtime check: is `value` a valid AgentProvider? */
export function isAgentProvider(value: unknown): value is AgentProvider {
  return agentProviderSchema.safeParse(value).success;
}

/** Runtime check: is `value` a valid ApprovalRequirement? */
export function isApprovalRequirement(
  value: unknown,
): value is ApprovalRequirement {
  return approvalRequirementSchema.safeParse(value).success;
}
