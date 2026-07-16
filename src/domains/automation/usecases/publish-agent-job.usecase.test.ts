/**
 * src/domains/automation/usecases/publish-agent-job.usecase.test.ts
 *
 * Unit tests for the publish-agent-job use case.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { z } from "zod";

import {
  registerAgent,
  _resetAgentRegistryForTests,
  asAgentId,
  type AgentId,
} from "../agent-registry";
import { submitAgentJob } from "../submit-agent-job";
import type { AgentExecutorPort, AgentPublisherPort } from "../agent-execution-ports";
import { createInMemoryAgentJobRepository } from "./in-memory-agent-job-repository";
import { runAgentJob } from "./run-agent-job.usecase";
import { approveAgentJob } from "./approve-agent-job.usecase";
import { publishAgentJob } from "./publish-agent-job.usecase";

const AGENT_ID: AgentId = asAgentId("test-post-generator");

function registerTestAgent() {
  registerAgent({
    id: AGENT_ID,
    displayName: "Test Post Generator",
    actions: ["generate_post"],
    langs: ["it"],
    needsApproval: "always",
    provider: "noop",
    retryPolicy: { maxAttempts: 3, defaultDelayMs: 5_000 },
    inputSchema: z.object({ topic: z.string() }),
    outputSchema: z.object({ title: z.string() }),
  });
}

function makeExecutor(output?: unknown): AgentExecutorPort {
  return {
    async execute() {
      return output;
    },
  };
}

function makePublisher(output?: Record<string, unknown>): AgentPublisherPort {
  return {
    async publish() {
      if (!output) throw new Error("publisher not configured");
      return output;
    },
  };
}

function makeFailingPublisher(error: unknown): AgentPublisherPort {
  return {
    async publish() {
      throw error;
    },
  };
}

describe("publishAgentJob", () => {
  beforeEach(() => {
    _resetAgentRegistryForTests();
  });

  it("publishes an approved job and transitions to published", async () => {
    registerTestAgent();
    const repo = createInMemoryAgentJobRepository();
    const { job: submitted } = await submitAgentJob(
      { agentId: AGENT_ID, creatorId: "creator-1", input: { topic: "AI" } },
      { repo },
    );
    await runAgentJob(
      { jobId: submitted.id },
      { repo, executor: makeExecutor({ title: "Hello" }) },
    );
    await approveAgentJob(
      { jobId: submitted.id, approvedBy: "creator-1" },
      { repo },
    );

    const { job } = await publishAgentJob(
      { jobId: submitted.id },
      {
        repo,
        publisher: makePublisher({ postId: "post-1" }),
      },
    );

    expect(job.status).toBe("published");
    expect(job.verifiable_output).toEqual({ postId: "post-1" });
  });

  it("transitions to retryable_failed on transient publisher errors", async () => {
    registerTestAgent();
    const repo = createInMemoryAgentJobRepository();
    const { job: submitted } = await submitAgentJob(
      { agentId: AGENT_ID, creatorId: "creator-1", input: { topic: "AI" } },
      { repo },
    );
    await runAgentJob(
      { jobId: submitted.id },
      { repo, executor: makeExecutor({ title: "Hello" }) },
    );
    await approveAgentJob(
      { jobId: submitted.id, approvedBy: "creator-1" },
      { repo },
    );

    const now = new Date("2026-07-16T00:00:00.000Z");
    const { job } = await publishAgentJob(
      { jobId: submitted.id },
      {
        repo,
        publisher: makeFailingPublisher({ code: "timeout" }),
        now,
      },
    );

    expect(job.status).toBe("retryable_failed");
    expect(job.last_error?.reason).toBe("timeout");
    expect(job.next_attempt_at).toBeDefined();
  });

  it("transitions to permanent_failed on non-retryable publisher errors", async () => {
    registerTestAgent();
    const repo = createInMemoryAgentJobRepository();
    const { job: submitted } = await submitAgentJob(
      { agentId: AGENT_ID, creatorId: "creator-1", input: { topic: "AI" } },
      { repo },
    );
    await runAgentJob(
      { jobId: submitted.id },
      { repo, executor: makeExecutor({ title: "Hello" }) },
    );
    await approveAgentJob(
      { jobId: submitted.id, approvedBy: "creator-1" },
      { repo },
    );

    const { job } = await publishAgentJob(
      { jobId: submitted.id },
      {
        repo,
        publisher: makeFailingPublisher({ code: "invalid_input" }),
      },
    );

    expect(job.status).toBe("permanent_failed");
    expect(job.last_error?.reason).toBe("invalid_input");
  });

  it("throws when the job is not approved", async () => {
    registerTestAgent();
    const repo = createInMemoryAgentJobRepository();
    const { job: submitted } = await submitAgentJob(
      { agentId: AGENT_ID, creatorId: "creator-1", input: { topic: "AI" } },
      { repo },
    );

    await expect(
      publishAgentJob(
        { jobId: submitted.id },
        { repo, publisher: makePublisher() },
      ),
    ).rejects.toThrow(/Cannot publish agent job/);
  });
});
