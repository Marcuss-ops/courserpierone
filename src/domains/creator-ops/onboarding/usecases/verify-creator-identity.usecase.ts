/**
 * src/domains/creator-ops/onboarding/usecases/verify-creator-identity.usecase.ts
 *
 * Phase 6 — Verify Creator Identity use case.
 *
 * Records that the applicant passed the identity verification step.
 * This is a separate step from admin review and can happen before or
 * during review depending on the onboarding flow.
 */

import type { CreatorApplicationRecord } from "../creator-application-record";
import type { CreatorApplicationRepository } from "../creator-application-repository";
import type { CreatorApplicationAnalytics } from "../ports/creator-application-analytics.port";

export interface VerifyCreatorIdentityInput {
  applicationId: string;
  now?: Date;
}

export interface VerifyCreatorIdentityDeps {
  repo: CreatorApplicationRepository;
  analytics: CreatorApplicationAnalytics;
}

export async function verifyCreatorIdentity(
  input: VerifyCreatorIdentityInput,
  deps: VerifyCreatorIdentityDeps,
): Promise<CreatorApplicationRecord> {
  const now = input.now ?? new Date();
  const existing = await deps.repo.findById(input.applicationId);
  if (!existing) {
    throw new Error(`CreatorApplication ${input.applicationId} not found`);
  }
  const updated: CreatorApplicationRecord = {
    ...existing,
    identityVerifiedAt: now,
    updatedAt: now,
  };
  const saved = await deps.repo.save(updated);
  await deps.analytics.track({
    eventType: "creator_application_identity_verified",
    userId: existing.userId,
    metadata: { applicationId: saved.id },
  });
  return saved;
}
