/**
 * src/domains/automation/submit-agent-job.ts
 *
 * Phase 5 — Submit Agent Job Use Case.
 *
 * Creates a new agent job in `queued` state. Validates the input against
 * the agent manifest, derives an idempotency key, and returns an existing
 * job if the same (agent + creator + input) has already been submitted.
 */

import { randomUUID } from "node:crypto";
import { getAgent, type AgentId } from "./agent-registry";
import { deriveIdempotencyKey, type AgentJobRecord } from "./agent-job-record";
import type { AgentJobRepository } from "./agent-job-repository";

export interface SubmitAgentJobInput {
  agentId: AgentId;
  creatorId: string;
  input: unknown;
}

export interface SubmitAgentJobDeps {
  repo: AgentJobRepository;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

export interface SubmitAgentJobResult {
  job: AgentJobRecord;
  /** True when this call created a brand-new job; false on idempotent hit. */
  created: boolean;
}

/**
 * Submit a new agent job.
 *
 * @throws Error if the agent is not registered.
 * @throws Error if the input fails the agent's inputSchema validation.
 */
export async function submitAgentJob(
  input: SubmitAgentJobInput,
  deps: SubmitAgentJobDeps,
): Promise<SubmitAgentJobResult> {
  const manifest = getAgent(input.agentId);
  if (!manifest) {
    throw new Error(`Agent "${input.agentId}" is not registered`);
  }

  const parsedInput = manifest.inputSchema.parse(input.input);

  const idempotencyKey = deriveIdempotencyKey({
    agentId: input.agentId,
    creatorId: input.creatorId,
    jobInput: parsedInput,
  });

  const existing = await deps.repo.findByIdempotencyKey(idempotencyKey);
  if (existing) {
    return { job: existing, created: false };
  }

  const now = deps.now ?? new Date();
  const job: AgentJobRecord = {
    id: randomUUID(),
    idempotency_key: idempotencyKey,
    agent_id: input.agentId,
    status: "queued",
    attempt_count: 0,
    max_attempts: manifest.retryPolicy.maxAttempts,
    input: parsedInput,
    output: undefined,
    verifiable_output: undefined,
    last_error: undefined,
    next_attempt_at: undefined,
    external_operation_id: undefined,
    created_by: input.creatorId,
    approved_by: undefined,
    approved_at: undefined,
    cancelled_by: undefined,
    cancelled_at: undefined,
    created_at: now,
    updated_at: now,
  };

  const saved = await deps.repo.save(job);
  return { job: saved, created: true };
}
