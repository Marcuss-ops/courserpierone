/**
 * src/domains/automation/usecases/approve-agent-job.usecase.test.ts
 *
 * Unit tests for the approve-agent-job use case.
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
import { approveAgentJob } from "./approve-agent-job.usecase";

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

describe("approveAgentJob", () => {
  beforeEach(() => {
    _resetAgentRegistryForTests();
  });

  it("transitions an awaiting_approval job to approved", async () => {
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

    const now = new Date("2026-07-16T00:00:00.000Z");
    const { job } = await approveAgentJob(
      { jobId: submitted.id, approvedBy: "creator-1" },
      { repo, now },
    );

    expect(job.status).toBe("approved");
    expect(job.approved_by).toBe("creator-1");
    expect(job.approved_at).toEqual(now);
  });

  it("throws when the job is not awaiting approval", async () => {
    registerTestAgent();
    const repo = createInMemoryAgentJobRepository();
    const { job: submitted } = await submitAgentJob(
      { agentId: AGENT_ID, creatorId: "creator-1", input: { topic: "AI" } },
      { repo },
    );

    await expect(
      approveAgentJob(
        { jobId: submitted.id, approvedBy: "creator-1" },
        { repo },
      ),
    ).rejects.toThrow(/Cannot approve agent job/);
  });
});
