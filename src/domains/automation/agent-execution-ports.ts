/**
 * src/domains/automation/agent-execution-ports.ts
 *
 * Phase 5 — Agent Execution & Publishing Ports.
 *
 * These ports live in the Domain layer and are implemented by Adapters
 * that talk to concrete providers (OpenAI, Anthropic, in-house) or
 * persistence layers. The use cases depend on the interfaces, not the
 * implementations.
 */

import type { AgentVerifiableOutput } from "./agent-job-record";

/** Executes an agent's generation logic. */
export interface AgentExecutorPort {
  /**
   * Run the agent for the given input. Returns the raw output (to be
   * validated by the caller against the manifest's outputSchema).
   * Throws on execution / provider / validation errors.
   */
  execute(agentId: string, input: unknown): Promise<unknown>;
}

/** Publishes an approved agent output to the canonical store. */
export interface AgentPublisherPort {
  /**
   * Persist the approved output and return verifiable references
   * (e.g., `{ lessonId: "..." }`). Throws on persistence / verification
   * errors.
   */
  publish(agentId: string, output: unknown): Promise<AgentVerifiableOutput>;
}
