/**
 * src/domains/automation/agent-catalog.test.ts
 *
 * Unit tests for the Agent Catalog metadata layer (Courssy).
 *
 * Coverage:
 *   - module load: AGENT_ACTIONS / AGENT_PROVIDERS / APPROVAL_REQUIREMENTS
 *     parse cleanly (self-validation passed at import time)
 *   - counts: each enum matches its expected count
 *   - unique values: no duplicates in any enum
 *   - Zod schemas: accept each value + reject invalid
 *   - default retry policy: passes zod validation
 *   - lookup helpers: isAgentAction / isAgentProvider / isApprovalRequirement
 *     accept valid + reject non-string + reject invalid
 */

import { describe, it, expect } from "vitest";

import {
  AGENT_ACTIONS,
  AGENT_ACTION_COUNT,
  AGENT_PROVIDERS,
  AGENT_PROVIDER_COUNT,
  APPROVAL_REQUIREMENTS,
  APPROVAL_REQUIREMENT_COUNT,
  DEFAULT_RETRY_POLICY,
  agentActionSchema,
  agentProviderSchema,
  approvalRequirementSchema,
  isAgentAction,
  isAgentProvider,
  isApprovalRequirement,
  defaultRetryPolicySchema,
} from "./agent-catalog";

// ─── AGENT_ACTIONS ────────────────────────────────────────────────

describe("AGENT_ACTIONS \u2014 module-level integrity", () => {
  it("contains exactly 6 unique actions", () => {
    expect(AGENT_ACTIONS.length).toBe(6);
    expect(AGENT_ACTION_COUNT).toBe(6);
    expect(new Set(AGENT_ACTIONS).size).toBe(6);
  });

  it("all 6 expected actions are present", () => {
    expect(AGENT_ACTIONS).toContain("generate_post");
    expect(AGENT_ACTIONS).toContain("generate_lesson_outline");
    expect(AGENT_ACTIONS).toContain("translate_content");
    expect(AGENT_ACTIONS).toContain("summarize_lesson");
    expect(AGENT_ACTIONS).toContain("draft_email");
    expect(AGENT_ACTIONS).toContain("generate_quiz");
  });
});

describe("agentActionSchema \u2014 Zod validation", () => {
  it("accepts every value in AGENT_ACTIONS", () => {
    for (const action of AGENT_ACTIONS) {
      expect(agentActionSchema.parse(action)).toBe(action);
    }
  });

  it("rejects unknown actions", () => {
    expect(() => agentActionSchema.parse("generate_essay")).toThrow();
    expect(() => agentActionSchema.parse("")).toThrow();
    expect(() => agentActionSchema.parse("GENERATE_POST")).toThrow(); // case-sensitive
    expect(() => agentActionSchema.parse(null)).toThrow();
    expect(() => agentActionSchema.parse(undefined)).toThrow();
  });
});

// ─── AGENT_PROVIDERS ──────────────────────────────────────────────

describe("AGENT_PROVIDERS \u2014 module-level integrity", () => {
  it("contains exactly 4 unique providers", () => {
    expect(AGENT_PROVIDERS.length).toBe(4);
    expect(AGENT_PROVIDER_COUNT).toBe(4);
    expect(new Set(AGENT_PROVIDERS).size).toBe(4);
  });

  it("all 4 expected providers are present", () => {
    expect(AGENT_PROVIDERS).toContain("openai");
    expect(AGENT_PROVIDERS).toContain("anthropic");
    expect(AGENT_PROVIDERS).toContain("inhouse");
    expect(AGENT_PROVIDERS).toContain("noop");
  });
});

describe("agentProviderSchema \u2014 Zod validation", () => {
  it("accepts every value in AGENT_PROVIDERS", () => {
    for (const provider of AGENT_PROVIDERS) {
      expect(agentProviderSchema.parse(provider)).toBe(provider);
    }
  });

  it("rejects unknown providers", () => {
    expect(() => agentProviderSchema.parse("gemini")).toThrow();
    expect(() => agentProviderSchema.parse("OPENAI")).toThrow();
    expect(() => agentProviderSchema.parse(undefined)).toThrow();
  });
});

// ─── APPROVAL_REQUIREMENTS ──────────────────────────────────────

describe("APPROVAL_REQUIREMENTS \u2014 module-level integrity", () => {
  it("contains exactly 3 unique values", () => {
    expect(APPROVAL_REQUIREMENTS.length).toBe(3);
    expect(APPROVAL_REQUIREMENT_COUNT).toBe(3);
    expect(new Set(APPROVAL_REQUIREMENTS).size).toBe(3);
  });

  it("all 3 expected approval outcomes are present", () => {
    expect(APPROVAL_REQUIREMENTS).toContain("always");
    expect(APPROVAL_REQUIREMENTS).toContain("never");
    expect(APPROVAL_REQUIREMENTS).toContain("configurable");
  });
});

describe("approvalRequirementSchema \u2014 Zod validation", () => {
  it("accepts every value in APPROVAL_REQUIREMENTS", () => {
    for (const v of APPROVAL_REQUIREMENTS) {
      expect(approvalRequirementSchema.parse(v)).toBe(v);
    }
  });

  it("rejects unknown approval values", () => {
    expect(() => approvalRequirementSchema.parse("sometimes")).toThrow();
    expect(() => approvalRequirementSchema.parse("ALWAYS")).toThrow();
    expect(() => approvalRequirementSchema.parse(null)).toThrow();
  });
});

// ─── DEFAULT_RETRY_POLICY ────────────────────────────────────────

describe("DEFAULT_RETRY_POLICY", () => {
  it("has expected maxAttempts + defaultDelayMs", () => {
    expect(DEFAULT_RETRY_POLICY.maxAttempts).toBe(3);
    expect(DEFAULT_RETRY_POLICY.defaultDelayMs).toBe(5_000);
  });

  it("passes zod validation at module load", () => {
    expect(() =>
      defaultRetryPolicySchema.parse(DEFAULT_RETRY_POLICY),
    ).not.toThrow();
  });

  it("rejects invalid retry policy (zero maxAttempts)", () => {
    expect(() =>
      defaultRetryPolicySchema.parse({ maxAttempts: 0, defaultDelayMs: 1000 }),
    ).toThrow();
  });

  it("rejects negative delays", () => {
    expect(() =>
      defaultRetryPolicySchema.parse({ maxAttempts: 1, defaultDelayMs: -1 }),
    ).toThrow();
  });
});

// ─── Type-narrowing helpers ──────────────────────────────────────

describe("isAgentAction", () => {
  it("returns true for every valid action", () => {
    for (const action of AGENT_ACTIONS) {
      expect(isAgentAction(action)).toBe(true);
    }
  });

  it("returns false for unknown + non-string inputs", () => {
    expect(isAgentAction("generate_essay")).toBe(false);
    expect(isAgentAction("")).toBe(false);
    expect(isAgentAction("GENERATE_POST")).toBe(false);
    expect(isAgentAction(undefined)).toBe(false);
    expect(isAgentAction(null)).toBe(false);
    expect(isAgentAction(42)).toBe(false);
    expect(isAgentAction({})).toBe(false);
  });
});

describe("isAgentProvider", () => {
  it("returns true for every valid provider", () => {
    for (const provider of AGENT_PROVIDERS) {
      expect(isAgentProvider(provider)).toBe(true);
    }
  });

  it("returns false for unknown + non-string inputs", () => {
    expect(isAgentProvider("gemini")).toBe(false);
    expect(isAgentProvider("OPENAI")).toBe(false);
    expect(isAgentProvider(undefined)).toBe(false);
    expect(isAgentProvider(42)).toBe(false);
  });
});

describe("isApprovalRequirement", () => {
  it("returns true for every valid value", () => {
    for (const v of APPROVAL_REQUIREMENTS) {
      expect(isApprovalRequirement(v)).toBe(true);
    }
  });

  it("returns false for unknown approval values", () => {
    expect(isApprovalRequirement("sometimes")).toBe(false);
    expect(isApprovalRequirement("ALWAYS")).toBe(false);
    expect(isApprovalRequirement(undefined)).toBe(false);
    expect(isApprovalRequirement(42)).toBe(false);
  });
});
