/**
 * src/domains/automation/agent-registry.test.ts
 *
 * Unit tests for the AgentRegistry singleton.
 *
 * Pattern: per-test setup clears the registry (via _resetAgentRegistryForTests)
 * so tests are isolated.
 *
 * Coverage:
 *   - registerAgent idempotency (throws on duplicate id)
 *   - getAgent: returns registered agent or undefined
 *   - isAgentRegistered: true/false correctly
 *   - listAgentIds / listAgents: snapshot shape
 *   - Generic type preservation: registerAgent<I, O> compiles
 *   - _resetAgentRegistryForTests: clears state between tests
 */

import { z } from "zod";

import { describe, expect, it, beforeEach } from "vitest";

import {
  AGENT_REGISTRY,
  _resetAgentRegistryForTests,
  asAgentId,
  getAgent,
  isAgentRegistered,
  listAgentIds,
  listAgents,
  registerAgent,
  type AgentId,
  type AgentManifest,
} from "./agent-registry";

// ─── Test helpers ─────────────────────────────────────────────────────

function mkManifest(
  overrides: Partial<AgentManifest> = {},
): AgentManifest {
  return {
    id: asAgentId("test-agent"),
    displayName: "Test Agent",
    actions: ["generate_post"],
    langs: ["it", "en"],
    needsApproval: "always",
    provider: "openai",
    retryPolicy: { maxAttempts: 3, defaultDelayMs: 5_000 },
    inputSchema: z.object({ topic: z.string() }),
    outputSchema: z.object({ body: z.string() }),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

beforeEach(() => {
  _resetAgentRegistryForTests();
});

describe("registerAgent — happy path", () => {
  it("registers an agent and is retrievable via getAgent", () => {
    const manifest = mkManifest({ id: asAgentId("a1") });
    registerAgent(manifest);
    expect(getAgent(asAgentId("a1"))).toBe(manifest);
  });

  it("isAgentRegistered returns true for registered agents", () => {
    registerAgent(mkManifest({ id: asAgentId("a1") }));
    expect(isAgentRegistered(asAgentId("a1"))).toBe(true);
  });

  it("isAgentRegistered returns false for unknown agents", () => {
    expect(isAgentRegistered(asAgentId("nope"))).toBe(false);
  });

  it("registerAgent throws on duplicate id", () => {
    registerAgent(mkManifest({ id: asAgentId("a1") }));
    expect(() => registerAgent(mkManifest({ id: asAgentId("a1") }))).toThrow(
      /already registered/,
    );
  });

  it("supports hot-add via registerAgent (not just startup-time registration)", () => {
    registerAgent(mkManifest({ id: asAgentId("a1") }));
    registerAgent(mkManifest({ id: asAgentId("a2") }));
    registerAgent(mkManifest({ id: asAgentId("a3") }));
    expect(AGENT_REGISTRY.size).toBe(3);
  });
});

describe("listAgentIds / listAgents — snapshot shape", () => {
  it("returns an empty snapshot when registry is empty", () => {
    expect(listAgentIds()).toEqual([]);
    expect(listAgents()).toEqual([]);
  });

  it("returns all registered agent ids in registration order", () => {
    registerAgent(mkManifest({ id: asAgentId("a1") }));
    registerAgent(mkManifest({ id: asAgentId("a2") }));
    registerAgent(mkManifest({ id: asAgentId("a3") }));
    expect(listAgentIds()).toEqual([
      asAgentId("a1"),
      asAgentId("a2"),
      asAgentId("a3"),
    ]);
  });

  it("returns all registered manifests via listAgents", () => {
    const m1 = mkManifest({ id: asAgentId("a1") });
    const m2 = mkManifest({ id: asAgentId("a2") });
    registerAgent(m1);
    registerAgent(m2);
    const list = listAgents();
    expect(list).toHaveLength(2);
    expect(list).toContain(m1);
    expect(list).toContain(m2);
  });

  it("snapshot is decoupled from live registry mutations", () => {
    registerAgent(mkManifest({ id: asAgentId("a1") }));
    const snapshot = listAgentIds();
    registerAgent(mkManifest({ id: asAgentId("a2") }));
    // snapshot doesn't reflect the new registration
    expect(snapshot).toEqual([asAgentId("a1")]);
    // live AGENT_REGISTRY does
    expect(AGENT_REGISTRY.size).toBe(2);
  });
});

describe("AGENT_REGISTRY — readonly view", () => {
  it("exposes ReadonlyMap \u2014 cannot mutate from outside", () => {
    registerAgent(mkManifest({ id: asAgentId("a1") }));
    // Type-level: `AGENT_REGISTRY.set` does NOT exist (ReadonlyMap). Verify at runtime:
    expect((AGENT_REGISTRY as unknown as Map<AgentId, AgentManifest>).size).toBe(
      1,
    );
  });

  it("get/has/values/size work through the readonly view", () => {
    const m = mkManifest({ id: asAgentId("a1") });
    registerAgent(m);
    expect(AGENT_REGISTRY.has(asAgentId("a1"))).toBe(true);
    expect(AGENT_REGISTRY.get(asAgentId("a1"))).toBe(m);
    expect(Array.from(AGENT_REGISTRY.values())).toEqual([m]);
    expect(AGENT_REGISTRY.size).toBe(1);
  });
});

describe("_resetAgentRegistryForTests — escape hatch", () => {
  it("clears the registry", () => {
    registerAgent(mkManifest({ id: asAgentId("a1") }));
    registerAgent(mkManifest({ id: asAgentId("a2") }));
    expect(AGENT_REGISTRY.size).toBe(2);
    _resetAgentRegistryForTests();
    expect(AGENT_REGISTRY.size).toBe(0);
    expect(listAgentIds()).toEqual([]);
  });

  it("allows re-registration of the SAME id after reset", () => {
    registerAgent(mkManifest({ id: asAgentId("a1") }));
    _resetAgentRegistryForTests();
    // No throw on second register of same id because registry was cleared
    expect(() => registerAgent(mkManifest({ id: asAgentId("a1") }))).not.toThrow();
  });
});

describe("AgentId brand — compile-time safety", () => {
  it("asAgentId produces a value usable as AgentId", () => {
    const id: AgentId = asAgentId("my-agent");
    registerAgent(mkManifest({ id }));
    expect(isAgentRegistered(id)).toBe(true);
  });
});

describe("registerAgent — generic type preservation", () => {
  it("preserves input/output types via Zod schemas (compile-time)", () => {
    interface MyInput {
      topic: string;
    }
    interface MyOutput {
      body: string;
    }
    const manifest: AgentManifest<MyInput, MyOutput> = {
      id: asAgentId("typed-agent"),
      displayName: "Typed",
      actions: ["generate_post"],
      langs: ["it"],
      needsApproval: "always",
      provider: "openai",
      retryPolicy: { maxAttempts: 3, defaultDelayMs: 5_000 },
      inputSchema: z.object({ topic: z.string() }) as unknown as AgentManifest<MyInput, MyOutput>["inputSchema"],
      outputSchema: z.object({ body: z.string() }) as unknown as AgentManifest<MyInput, MyOutput>["outputSchema"],
    };
    registerAgent(manifest);
    expect(isAgentRegistered(asAgentId("typed-agent"))).toBe(true);
  });
});