/**
 * src/domains/automation/usecases/run-agent-job.usecase.ts
 *
 * Phase 5 — Run Agent Job Use Case.
 *
 * Orchestrates a single execution attempt of an agent job:
 *   1. Loads the job and transitions it to `running`.
 *   2. Executes the agent via the `AgentExecutorPort`.
 *   3. Validates the raw output against the manifest's `outputSchema`.
 *   4. Transitions to `awaiting_approval` (default) or `approved` (when
 *      the manifest declares `needsApproval: "never"`). `configurable` is
 *      treated as requiring approval until a runtime flag is added.
 *   5. On failure, classifies the error and transitions to
 *      `retryable_failed` or `permanent_failed`.
 */

import { assertValidAgentRunTransition } from "../agent-run-states";
import { classifyAgentError } from "../agent-run-retry-policy";
import { getAgent, type AgentId } from "../agent-registry";
import { applyAgentFailure } from "../rules/apply-agent-failure";
import type { AgentJobRecord } from "../agent-job-record";
import type { AgentJobRepository } from "../agent-job-repository";
import type { AgentExecutorPort } from "../agent-execution-ports";

export interface RunAgentJobInput {
  jobId: string;
}

export interface RunAgentJobDeps {
  repo: AgentJobRepository;
  executor: AgentExecutorPort;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

export interface RunAgentJobResult {
  job: AgentJobRecord;
}

/**
 * Run a single execution attempt for the given agent job.
 *
 * @throws Error if the job is not found.
 * @throws Error if the job is not in a runnable state.
 * @throws Error if the agent is no longer registered.
 */
export async function runAgentJob(
  input: RunAgentJobInput,
  deps: RunAgentJobDeps,
): Promise<RunAgentJobResult> {
  const job = await deps.repo.findById(input.jobId);
  if (!job) {
    throw new Error(`Agent job "${input.jobId}" not found`);
  }

  if (job.status !== "queued" && job.status !== "retryable_failed") {
    throw new Error(
      `Cannot run agent job in state "${job.status}" (expected "queued" or "retryable_failed")`,
    );
  }

  const manifest = getAgent(job.agent_id as AgentId);
  if (!manifest) {
    throw new Error(`Agent "${job.agent_id}" is not registered`);
  }

  const now = deps.now ?? new Date();
  const nextAttemptCount = job.attempt_count + 1;

  const runningJob: AgentJobRecord = {
    ...job,
    status: "running",
    attempt_count: nextAttemptCount,
    last_error: undefined,
    next_attempt_at: undefined,
    updated_at: now,
  };
  assertValidAgentRunTransition(job.status, runningJob.status);

  let current = await deps.repo.save(runningJob);

  try {
    const rawOutput = await deps.executor.execute(job.agent_id, job.input);
    const parsedOutput = manifest.outputSchema.parse(rawOutput);

    const nextStatus = manifest.needsApproval === "never" ? "approved" : "awaiting_approval";
    const nextJob: AgentJobRecord = {
      ...current,
      status: nextStatus,
      output: parsedOutput,
      updated_at: now,
    };
    assertValidAgentRunTransition(current.status, nextJob.status);

    current = await deps.repo.save(nextJob);
    return { job: current };
  } catch (error) {
    const classification = classifyAgentError(error);
    const failedJob = applyAgentFailure({
      job: current,
      classification,
      retryPolicy: manifest.retryPolicy,
      now,
    });
    assertValidAgentRunTransition(current.status, failedJob.status);

    current = await deps.repo.save(failedJob);
    return { job: current };
  }
}
