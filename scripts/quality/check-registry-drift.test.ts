import { describe, expect, it } from "vitest";
import { findRegistryDrift } from "./check-registry-drift";

describe("registry anti-drift gate", () => {
  it("finds no provider/content/agent/policy drift", () => {
    expect(findRegistryDrift()).toEqual([]);
  });
});
