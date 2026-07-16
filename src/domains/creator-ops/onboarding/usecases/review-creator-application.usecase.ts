/**
 * src/domains/creator-ops/onboarding/usecases/review-creator-application.usecase.ts
 *
 * Phase 6 — Review (approve/reject) Creator Application use case.
 */

import {
  assertValidCreatorApplicationTransition,
} from "../creator-application-status";
import type { CreatorApplicationRecord } from "../creator-application-record";
import type { CreatorApplicationRepository } from "../creator-application-repository";
import type { CreatorApplicationAnalytics } from "../ports/creator-application-analytics.port";
import type { CreatorApplicationUserService } from "../ports/creator-application-user-service.port";

export interface ApproveCreatorApplicationInput {
  applicationId: string;
  reviewedBy: string;
  now?: Date;
}

export interface RejectCreatorApplicationInput {
  applicationId: string;
  reviewedBy: string;
  rejectionReason: string;
  now?: Date;
}

export interface ReviewCreatorApplicationDeps {
  repo: CreatorApplicationRepository;
  analytics: CreatorApplicationAnalytics;
  /** Required only when approving; ignored on reject. */
  userService?: CreatorApplicationUserService;
}

export async function approveCreatorApplication(
  input: ApproveCreatorApplicationInput,
  deps: ReviewCreatorApplicationDeps,
): Promise<CreatorApplicationRecord> {
  const now = input.now ?? new Date();
  const existing = await deps.repo.findById(input.applicationId);
  if (!existing) {
    throw new Error(`CreatorApplication ${input.applicationId} not found`);
  }
  assertValidCreatorApplicationTransition(existing.status, "approved");
  const updated: CreatorApplicationRecord = {
    ...existing,
    status: "approved",
    reviewedAt: now,
    reviewedBy: input.reviewedBy,
    updatedAt: now,
  };
  const saved = await deps.repo.save(updated);
  await deps.userService?.approveExternalCreator(existing.userId);
  await deps.analytics.track({
    eventType: "creator_application_approved",
    userId: existing.userId,
    metadata: { applicationId: saved.id, reviewedBy: input.reviewedBy },
  });
  return saved;
}

export async function rejectCreatorApplication(
  input: RejectCreatorApplicationInput,
  deps: ReviewCreatorApplicationDeps,
): Promise<CreatorApplicationRecord> {
  const now = input.now ?? new Date();
  const existing = await deps.repo.findById(input.applicationId);
  if (!existing) {
    throw new Error(`CreatorApplication ${input.applicationId} not found`);
  }
  assertValidCreatorApplicationTransition(existing.status, "rejected");
  const updated: CreatorApplicationRecord = {
    ...existing,
    status: "rejected",
    reviewedAt: now,
    reviewedBy: input.reviewedBy,
    rejectionReason: input.rejectionReason,
    updatedAt: now,
  };
  const saved = await deps.repo.save(updated);
  await deps.analytics.track({
    eventType: "creator_application_rejected",
    userId: existing.userId,
    metadata: { applicationId: saved.id, reviewedBy: input.reviewedBy, reason: input.rejectionReason },
  });
  return saved;
}
