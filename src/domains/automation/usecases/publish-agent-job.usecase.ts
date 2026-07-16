/**
 * src/domains/automation/usecases/publish-agent-job.usecase.ts
 *
 * Phase 5 — Publish Agent Job Use Case.
 *
 * Publishes an approved agent output to the canonical store:
 *   1. Loads the job and transitions it to `publishing`.
 *   2. Calls `AgentPublisherPort.publish` with the agent output.
 *   3. On success, transitions to `published` and stores the
 *      verifiable references.
 *   4. On failure, classifies the error and transitions to
 *      `retryable_failed` or `permanent_failed`. Publishing failures are
 *      retried by re-running generation; `attempt_count` is incremented
 *      in `runAgentJob`, not here.
 */

import { assertValidAgentRunTransition } from "../agent-run-states";
import { classifyAgentError } from "../agent-run-retry-policy";
import { getAgent, type AgentId } from "../agent-registry";
import { applyAgentFailure } from "../rules/apply-agent-failure";
import type { AgentJobRecord } from "../agent-job-record";
import type { AgentJobRepository } from "../agent-job-repository";
import type { AgentPublisherPort } from "../agent-execution-ports";

export interface PublishAgentJobInput {
  jobId: string;
}

export interface PublishAgentJobDeps {
  repo: AgentJobRepository;
  publisher: AgentPublisherPort;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

export interface PublishAgentJobResult {
  job: AgentJobRecord;
}

/**
 * Publish an approved agent job.
 *
 * @throws Error if the job is not found.
 * @throws Error if the job is not in `approved` state.
 * @throws Error if the agent is no longer registered.
 */
export async function publishAgentJob(
  input: PublishAgentJobInput,
  deps: PublishAgentJobDeps,
): Promise<PublishAgentJobResult> {
  const job = await deps.repo.findById(input.jobId);
  if (!job) {
    throw new Error(`Agent job "${input.jobId}" not found`);
  }

  if (job.status !== "approved") {
    throw new Error(
      `Cannot publish agent job in state "${job.status}" (expected "approved")`,
    );
  }

  const manifest = getAgent(job.agent_id as AgentId);
  if (!manifest) {
    throw new Error(`Agent "${job.agent_id}" is not registered`);
  }

  const now = deps.now ?? new Date();

  const publishingJob: AgentJobRecord = {
    ...job,
    status: "publishing",
    updated_at: now,
  };
  assertValidAgentRunTransition(job.status, publishingJob.status);

  let current = await deps.repo.save(publishingJob);

  try {
    const verifiableOutput = await deps.publisher.publish(
      job.agent_id,
      job.output,
    );

    const publishedJob: AgentJobRecord = {
      ...current,
      status: "published",
      verifiable_output: verifiableOutput,
      updated_at: now,
    };
    assertValidAgentRunTransition(current.status, publishedJob.status);

    current = await deps.repo.save(publishedJob);
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
