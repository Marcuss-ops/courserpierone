/**
 * src/domains/automation/usecases/approve-agent-job.usecase.ts
 *
 * Phase 5 — Approve Agent Job Use Case.
 *
 * Transitions a job from `awaiting_approval` to `approved`.
 * Only the creator (or an authorized user) should be allowed to call
 * this use case; the caller is responsible for authorization.
 */

import { assertValidAgentRunTransition } from "../agent-run-states";
import type { AgentJobRecord } from "../agent-job-record";
import type { AgentJobRepository } from "../agent-job-repository";

export interface ApproveAgentJobInput {
  jobId: string;
  approvedBy: string;
}

export interface ApproveAgentJobDeps {
  repo: AgentJobRepository;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

export interface ApproveAgentJobResult {
  job: AgentJobRecord;
}

/**
 * Approve an agent job that is currently awaiting review.
 *
 * @throws Error if the job is not found.
 * @throws Error if the job is not in `awaiting_approval` state.
 */
export async function approveAgentJob(
  input: ApproveAgentJobInput,
  deps: ApproveAgentJobDeps,
): Promise<ApproveAgentJobResult> {
  const job = await deps.repo.findById(input.jobId);
  if (!job) {
    throw new Error(`Agent job "${input.jobId}" not found`);
  }

  if (job.status !== "awaiting_approval") {
    throw new Error(
      `Cannot approve agent job in state "${job.status}" (expected "awaiting_approval")`,
    );
  }

  const now = deps.now ?? new Date();

  const approvedJob: AgentJobRecord = {
    ...job,
    status: "approved",
    approved_by: input.approvedBy,
    approved_at: now,
    updated_at: now,
  };
  assertValidAgentRunTransition(job.status, approvedJob.status);

  const saved = await deps.repo.save(approvedJob);
  return { job: saved };
}
