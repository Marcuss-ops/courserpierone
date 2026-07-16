/**
 * src/domains/automation/usecases/run-agent-job.usecase.test.ts
 *
 * Unit tests for the run-agent-job use case.
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
import type { AgentExecutorPort } from "../agent-execution-ports";
import { createInMemoryAgentJobRepository } from "./in-memory-agent-job-repository";
import { runAgentJob } from "./run-agent-job.usecase";

const AGENT_ID: AgentId = asAgentId("test-post-generator");

const inputSchema = z.object({ topic: z.string() });
const outputSchema = z.object({ title: z.string() });

function registerTestAgent(needsApproval: "always" | "never" | "configurable") {
  registerAgent({
    id: AGENT_ID,
    displayName: "Test Post Generator",
    actions: ["generate_post"],
    langs: ["it"],
    needsApproval,
    provider: "noop",
    retryPolicy: { maxAttempts: 3, defaultDelayMs: 5_000 },
    inputSchema,
    outputSchema,
  });
}

function makeExecutor(output?: unknown): AgentExecutorPort {
  return {
    async execute() {
      return output;
    },
  };
}

function makeFailingExecutor(error: unknown): AgentExecutorPort {
  return {
    async execute() {
      throw error;
    },
  };
}

describe("runAgentJob", () => {
  beforeEach(() => {
    _resetAgentRegistryForTests();
  });

  it("transitions a queued job to awaiting_approval when approval is required", async () => {
    registerTestAgent("always");
    const repo = createInMemoryAgentJobRepository();
    const { job: submitted } = await submitAgentJob(
      { agentId: AGENT_ID, creatorId: "creator-1", input: { topic: "AI" } },
      { repo },
    );

    const { job } = await runAgentJob(
      { jobId: submitted.id },
      { repo, executor: makeExecutor({ title: "Hello" }) },
    );

    expect(job.status).toBe("awaiting_approval");
    expect(job.output).toEqual({ title: "Hello" });
    expect(job.attempt_count).toBe(1);
  });

  it("transitions a queued job directly to approved when approval is never required", async () => {
    registerTestAgent("never");
    const repo = createInMemoryAgentJobRepository();
    const { job: submitted } = await submitAgentJob(
      { agentId: AGENT_ID, creatorId: "creator-1", input: { topic: "AI" } },
      { repo },
    );

    const { job } = await runAgentJob(
      { jobId: submitted.id },
      { repo, executor: makeExecutor({ title: "Hello" }) },
    );

    expect(job.status).toBe("approved");
    expect(job.output).toEqual({ title: "Hello" });
  });

  it("transitions a retryable_failed job back to running and then awaiting_approval", async () => {
    registerTestAgent("always");
    const repo = createInMemoryAgentJobRepository();
    const { job: submitted } = await submitAgentJob(
      { agentId: AGENT_ID, creatorId: "creator-1", input: { topic: "AI" } },
      { repo },
    );

    await runAgentJob(
      { jobId: submitted.id },
      { repo, executor: makeFailingExecutor({ code: "timeout" }) },
    );

    const first = await repo.findById(submitted.id);
    expect(first?.status).toBe("retryable_failed");
    expect(first?.attempt_count).toBe(1);

    const { job } = await runAgentJob(
      { jobId: submitted.id },
      { repo, executor: makeExecutor({ title: "Hello" }) },
    );

    expect(job.status).toBe("awaiting_approval");
    expect(job.attempt_count).toBe(2);
    expect(job.last_error).toBeUndefined();
    expect(job.next_attempt_at).toBeUndefined();
  });

  it("sets retryable_failed with next_attempt_at on transient errors", async () => {
    registerTestAgent("always");
    const repo = createInMemoryAgentJobRepository();
    const { job: submitted } = await submitAgentJob(
      { agentId: AGENT_ID, creatorId: "creator-1", input: { topic: "AI" } },
      { repo },
    );

    const now = new Date("2026-07-16T00:00:00.000Z");
    const { job } = await runAgentJob(
      { jobId: submitted.id },
      { repo, executor: makeFailingExecutor({ code: "rate_limit" }), now },
    );

    expect(job.status).toBe("retryable_failed");
    expect(job.last_error?.reason).toBe("rate_limit");
    expect(job.next_attempt_at).toBeDefined();
    expect(job.next_attempt_at!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("transitions to permanent_failed on non-retryable errors", async () => {
    registerTestAgent("always");
    const repo = createInMemoryAgentJobRepository();
    const { job: submitted } = await submitAgentJob(
      { agentId: AGENT_ID, creatorId: "creator-1", input: { topic: "AI" } },
      { repo },
    );

    const { job } = await runAgentJob(
      { jobId: submitted.id },
      { repo, executor: makeFailingExecutor({ code: "invalid_input" }) },
    );

    expect(job.status).toBe("permanent_failed");
    expect(job.last_error?.reason).toBe("invalid_input");
    expect(job.next_attempt_at).toBeUndefined();
  });

  it("transitions to permanent_failed when max attempts are exhausted", async () => {
    registerTestAgent("always");
    const repo = createInMemoryAgentJobRepository();
    const { job: submitted } = await submitAgentJob(
      { agentId: AGENT_ID, creatorId: "creator-1", input: { topic: "AI" } },
      { repo },
    );

    await runAgentJob(
      { jobId: submitted.id },
      { repo, executor: makeFailingExecutor({ code: "timeout" }) },
    );
    await runAgentJob(
      { jobId: submitted.id },
      { repo, executor: makeFailingExecutor({ code: "timeout" }) },
    );
    const { job } = await runAgentJob(
      { jobId: submitted.id },
      { repo, executor: makeFailingExecutor({ code: "timeout" }) },
    );

    expect(job.status).toBe("permanent_failed");
    expect(job.attempt_count).toBe(3);
  });

  it("throws when the job is not in a runnable state", async () => {
    registerTestAgent("always");
    const repo = createInMemoryAgentJobRepository();
    const { job: submitted } = await submitAgentJob(
      { agentId: AGENT_ID, creatorId: "creator-1", input: { topic: "AI" } },
      { repo },
    );
    await runAgentJob(
      { jobId: submitted.id },
      { repo, executor: makeExecutor({ title: "Hello" }) },
    );

    await expect(
      runAgentJob({ jobId: submitted.id }, { repo, executor: makeExecutor() }),
    ).rejects.toThrow(/Cannot run agent job/);
  });
});
