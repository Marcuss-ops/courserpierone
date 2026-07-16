/**
 * src/domains/creator-ops/onboarding/rules/creator-application-guards.ts
 *
 * Phase 6 — Creator Application guard rules.
 *
 * Pure domain rules that decide whether a user is allowed to create or
 * publish products. Internal creators and admins are always allowed;
 * external creators must have an approved application.
 */

import type { CreatorApplicationStatus } from "../creator-application-status";

export interface CreatorGuardInput {
  role: string;
  creatorType?: string | null;
  applicationStatus?: CreatorApplicationStatus;
}

/**
 * Admins can always create/publish products.
 * Internal creators (creatorType !== "external") are trusted by default.
 * External creators need an approved application.
 */
export function canCreateProduct(input: CreatorGuardInput): boolean {
  if (input.role === "admin") return true;
  if (input.role !== "creator") return false;
  if (input.creatorType !== "external") return true;
  return input.applicationStatus === "approved";
}

/** Publishing is gated by the same rule as creation in the MVP. */
export const canPublishProduct = canCreateProduct;
