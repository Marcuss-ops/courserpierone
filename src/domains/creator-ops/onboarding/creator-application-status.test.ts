/**
 * src/domains/creator-ops/onboarding/creator-application-status.test.ts
 *
 * Phase 6 — Creator Application status machine tests.
 */

import { describe, it, expect } from "vitest";
import {
  CREATOR_APPLICATION_STATUSES,
  TERMINAL_CREATOR_APPLICATION_STATUSES,
  isValidCreatorApplicationTransition,
  assertValidCreatorApplicationTransition,
  isTerminalCreatorApplicationStatus,
} from "./creator-application-status";

describe("CreatorApplication status machine", () => {
  it("has exactly 5 canonical statuses", () => {
    expect(CREATOR_APPLICATION_STATUSES.size).toBe(5);
  });

  it("has exactly 2 terminal statuses", () => {
    expect(TERMINAL_CREATOR_APPLICATION_STATUSES.size).toBe(2);
    expect(TERMINAL_CREATOR_APPLICATION_STATUSES.has("approved")).toBe(true);
    expect(TERMINAL_CREATOR_APPLICATION_STATUSES.has("rejected")).toBe(true);
  });

  it("allows draft → submitted", () => {
    expect(isValidCreatorApplicationTransition("draft", "submitted")).toBe(true);
  });

  it("allows submitted → under_review, submitted → approved and submitted → rejected", () => {
    expect(isValidCreatorApplicationTransition("submitted", "under_review")).toBe(true);
    expect(isValidCreatorApplicationTransition("submitted", "approved")).toBe(true);
    expect(isValidCreatorApplicationTransition("submitted", "rejected")).toBe(true);
  });

  it("allows under_review → approved and under_review → rejected", () => {
    expect(isValidCreatorApplicationTransition("under_review", "approved")).toBe(true);
    expect(isValidCreatorApplicationTransition("under_review", "rejected")).toBe(true);
  });

  it("does not allow transitions from terminal states", () => {
    expect(isValidCreatorApplicationTransition("approved", "submitted")).toBe(false);
    expect(isValidCreatorApplicationTransition("rejected", "approved")).toBe(false);
  });

  it("throws on invalid transitions", () => {
    expect(() => assertValidCreatorApplicationTransition("approved", "submitted")).toThrow();
  });

  it("detects terminal statuses", () => {
    expect(isTerminalCreatorApplicationStatus("approved")).toBe(true);
    expect(isTerminalCreatorApplicationStatus("rejected")).toBe(true);
    expect(isTerminalCreatorApplicationStatus("submitted")).toBe(false);
  });
});
