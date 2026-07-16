/**
 * src/domains/automation/agent-run-states.test.ts
 *
 * Unit tests for the AgentRunState state machine.
 *
 * Coverage:
 *   - AGENT_RUN_STATES size invariant (exactly 9 states)
 *   - TERMINAL_AGENT_RUN_STATES (published / permanent_failed / cancelled)
 *   - isValidAgentRunTransition: every documented transition
 *   - isValidAgentRunTransition: every ILLEGAL transition throws/false
 *   - isTerminalAgentRunState: yes for terminal, no for non-terminal
 *   - assertValidAgentRunTransition: throws on illegal transition
 *   - assertValidAgentRunTransition: returns void on legal transition
 */

import { describe, expect, it } from "vitest";

import {
  AGENT_RUN_STATES,
  AGENT_RUN_STATE_TRANSITIONS,
  TERMINAL_AGENT_RUN_STATES,
  assertValidAgentRunTransition,
  isTerminalAgentRunState,
  isValidAgentRunTransition,
  type AgentRunState,
} from "./agent-run-states";

const ALL_STATES: readonly AgentRunState[] = [
  "queued",
  "running",
  "awaiting_approval",
  "approved",
  "publishing",
  "published",
  "retryable_failed",
  "permanent_failed",
  "cancelled",
];

describe("AGENT_RUN_STATES — canonical set", () => {
  it("contains exactly 9 states", () => {
    expect(AGENT_RUN_STATES.size).toBe(9);
  });

  it("includes every state in the canonical union", () => {
    for (const state of ALL_STATES) {
      expect(AGENT_RUN_STATES.has(state)).toBe(true);
    }
  });
});

describe("TERMINAL_AGENT_RUN_STATES — terminal states", () => {
  it("contains exactly 3 terminal states", () => {
    expect(TERMINAL_AGENT_RUN_STATES.size).toBe(3);
  });

  it("includes published, permanent_failed, cancelled", () => {
    expect(TERMINAL_AGENT_RUN_STATES.has("published")).toBe(true);
    expect(TERMINAL_AGENT_RUN_STATES.has("permanent_failed")).toBe(true);
    expect(TERMINAL_AGENT_RUN_STATES.has("cancelled")).toBe(true);
  });

  it("does NOT include retryable_failed (it can transition to running)", () => {
    expect(TERMINAL_AGENT_RUN_STATES.has("retryable_failed")).toBe(false);
  });
});

describe("isTerminalAgentRunState", () => {
  it.each(["published", "permanent_failed", "cancelled"] as const)(
    "returns true for terminal state '%s'",
    (state) => {
      expect(isTerminalAgentRunState(state)).toBe(true);
    },
  );

  it.each([
    "queued",
    "running",
    "awaiting_approval",
    "approved",
    "publishing",
    "retryable_failed",
  ] as const)("returns false for non-terminal state '%s'", (state) => {
    expect(isTerminalAgentRunState(state)).toBe(false);
  });
});

describe("isValidAgentRunTransition — happy path transitions", () => {
  it.each([
    ["queued", "running"],
    ["queued", "cancelled"],
    ["running", "awaiting_approval"],
    ["running", "approved"],
    ["running", "retryable_failed"],
    ["running", "permanent_failed"],
    ["running", "cancelled"],
    ["awaiting_approval", "approved"],
    ["awaiting_approval", "permanent_failed"],
    ["awaiting_approval", "cancelled"],
    ["approved", "publishing"],
    ["approved", "retryable_failed"],
    ["approved", "permanent_failed"],
    ["approved", "cancelled"],
    ["publishing", "published"],
    ["publishing", "retryable_failed"],
    ["publishing", "permanent_failed"],
    ["retryable_failed", "running"],
    ["retryable_failed", "permanent_failed"],
    ["retryable_failed", "cancelled"],
  ] as const)("allows %s \u2192 %s", (from, to) => {
    expect(isValidAgentRunTransition(from, to)).toBe(true);
  });
});

describe("isValidAgentRunTransition — illegal transitions", () => {
  it("rejects published \u2192 anything (terminal state)", () => {
    for (const to of ALL_STATES) {
      expect(isValidAgentRunTransition("published", to)).toBe(false);
    }
  });

  it("rejects permanent_failed \u2192 anything (terminal state)", () => {
    for (const to of ALL_STATES) {
      expect(isValidAgentRunTransition("permanent_failed", to)).toBe(false);
    }
  });

  it("rejects cancelled \u2192 anything (terminal state)", () => {
    for (const to of ALL_STATES) {
      expect(isValidAgentRunTransition("cancelled", to)).toBe(false);
    }
  });

  it("rejects backward transitions (running \u2192 queued)", () => {
    expect(isValidAgentRunTransition("running", "queued")).toBe(false);
  });

  it("rejects skipping awaiting_approval when needsApproval=always", () => {
    // running \u2192 approved IS allowed (some agents don't need approval),
    // but queued \u2192 approved skips too much.
    expect(isValidAgentRunTransition("queued", "approved")).toBe(false);
    expect(isValidAgentRunTransition("queued", "awaiting_approval")).toBe(false);
  });

  it("rejects queued \u2192 published (skip the entire pipeline)", () => {
    expect(isValidAgentRunTransition("queued", "published")).toBe(false);
  });
});

describe("assertValidAgentRunTransition", () => {
  it("returns void on legal transition", () => {
    expect(() => assertValidAgentRunTransition("queued", "running")).not.toThrow();
    expect(assertValidAgentRunTransition("queued", "running")).toBeUndefined();
  });

  it("throws on illegal transition with a helpful message", () => {
    expect(() => assertValidAgentRunTransition("published", "running")).toThrow(
      /Invalid AgentRunState transition: published \u2192 running/,
    );
  });

  it("throws on terminal-state transition with 'terminal state' note", () => {
    expect(() => assertValidAgentRunTransition("cancelled", "queued")).toThrow(
      /terminal state/,
    );
  });
});

describe("AGENT_RUN_STATE_TRANSITIONS — matrix consistency", () => {
  it("every state has an entry in the matrix", () => {
    for (const state of ALL_STATES) {
      expect(AGENT_RUN_STATE_TRANSITIONS.has(state)).toBe(true);
    }
  });

  it("terminal states have empty transition sets", () => {
    expect(AGENT_RUN_STATE_TRANSITIONS.get("published")?.size).toBe(0);
    expect(AGENT_RUN_STATE_TRANSITIONS.get("permanent_failed")?.size).toBe(0);
    expect(AGENT_RUN_STATE_TRANSITIONS.get("cancelled")?.size).toBe(0);
  });

  it("all targets in the matrix are canonical states (defensive)", () => {
    for (const [, targets] of AGENT_RUN_STATE_TRANSITIONS) {
      for (const target of targets) {
        expect(AGENT_RUN_STATES.has(target)).toBe(true);
      }
    }
  });
});