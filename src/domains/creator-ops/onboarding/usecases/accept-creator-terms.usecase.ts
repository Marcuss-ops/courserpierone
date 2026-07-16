/**
 * src/domains/creator-ops/onboarding/usecases/accept-creator-terms.usecase.ts
 *
 * Phase 6 — Accept Creator Terms use case.
 *
 * Records that the applicant accepted the creator terms and
 * conditions. Idempotent: repeated calls keep the first acceptance time.
 */

import type { CreatorApplicationRecord } from "../creator-application-record";
import type { CreatorApplicationRepository } from "../creator-application-repository";
import type { CreatorApplicationAnalytics } from "../ports/creator-application-analytics.port";

export interface AcceptCreatorTermsInput {
  applicationId: string;
  now?: Date;
}

export interface AcceptCreatorTermsDeps {
  repo: CreatorApplicationRepository;
  analytics: CreatorApplicationAnalytics;
}

export async function acceptCreatorTerms(
  input: AcceptCreatorTermsInput,
  deps: AcceptCreatorTermsDeps,
): Promise<CreatorApplicationRecord> {
  const now = input.now ?? new Date();
  const existing = await deps.repo.findById(input.applicationId);
  if (!existing) {
    throw new Error(`CreatorApplication ${input.applicationId} not found`);
  }
  const updated: CreatorApplicationRecord = {
    ...existing,
    termsAcceptedAt: existing.termsAcceptedAt ?? now,
    updatedAt: now,
  };
  const saved = await deps.repo.save(updated);
  await deps.analytics.track({
    eventType: "creator_application_terms_accepted",
    userId: existing.userId,
    metadata: { applicationId: saved.id },
  });
  return saved;
}
