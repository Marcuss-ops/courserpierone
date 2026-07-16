/**
 * src/domains/creator-ops/onboarding/rules/creator-application-guards.test.ts
 *
 * Phase 6 — Creator Application guard rule tests.
 */

import { describe, it, expect } from "vitest";
import { canCreateProduct, canPublishProduct } from "./creator-application-guards";

describe("creator application guards", () => {
  it("allows admins to create products", () => {
    expect(canCreateProduct({ role: "admin" })).toBe(true);
  });

  it("allows internal creators to create products", () => {
    expect(canCreateProduct({ role: "creator", creatorType: "internal" })).toBe(true);
    expect(canCreateProduct({ role: "creator", creatorType: null })).toBe(true);
    expect(canCreateProduct({ role: "creator" })).toBe(true);
  });

  it("blocks external creators without an approved application", () => {
    expect(canCreateProduct({ role: "creator", creatorType: "external", applicationStatus: "submitted" })).toBe(false);
    expect(canCreateProduct({ role: "creator", creatorType: "external", applicationStatus: "under_review" })).toBe(false);
    expect(canCreateProduct({ role: "creator", creatorType: "external", applicationStatus: "rejected" })).toBe(false);
  });

  it("allows external creators with an approved application", () => {
    expect(canCreateProduct({ role: "creator", creatorType: "external", applicationStatus: "approved" })).toBe(true);
  });

  it("blocks students", () => {
    expect(canCreateProduct({ role: "student" })).toBe(false);
  });

  it("publishing follows the same rule as creation", () => {
    expect(canPublishProduct({ role: "creator", creatorType: "external", applicationStatus: "approved" })).toBe(true);
    expect(canPublishProduct({ role: "creator", creatorType: "external", applicationStatus: "submitted" })).toBe(false);
  });
});
