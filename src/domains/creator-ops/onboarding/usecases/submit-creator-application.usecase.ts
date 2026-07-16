/**
 * src/domains/creator-ops/onboarding/usecases/submit-creator-application.usecase.ts
 *
 * Phase 6 — Submit Creator Application use case.
 */

import { randomUUID } from "node:crypto";
import {
  assertValidCreatorApplicationTransition,
} from "../creator-application-status";
import type { CreatorApplicationRecord } from "../creator-application-record";
import type { CreatorApplicationRepository } from "../creator-application-repository";
import type { CreatorApplicationAnalytics } from "../ports/creator-application-analytics.port";

export interface SubmitCreatorApplicationInput {
  userId: string;
  termsAcceptedAt?: Date;
  now?: Date;
}

export interface SubmitCreatorApplicationDeps {
  repo: CreatorApplicationRepository;
  analytics: CreatorApplicationAnalytics;
}

export interface SubmitCreatorApplicationResult {
  application: CreatorApplicationRecord;
  created: boolean;
}

export async function submitCreatorApplication(
  input: SubmitCreatorApplicationInput,
  deps: SubmitCreatorApplicationDeps,
): Promise<SubmitCreatorApplicationResult> {
  const now = input.now ?? new Date();
  const existing = await deps.repo.findByUserId(input.userId);

  if (existing) {
    if (existing.status === "submitted") {
      return { application: existing, created: false };
    }
    assertValidCreatorApplicationTransition(existing.status, "submitted");
    const updated: CreatorApplicationRecord = {
      ...existing,
      status: "submitted",
      submittedAt: now,
      termsAcceptedAt: input.termsAcceptedAt ?? existing.termsAcceptedAt ?? now,
      updatedAt: now,
    };
    const saved = await deps.repo.save(updated);
    await deps.analytics.track({
      eventType: "creator_application_submitted",
      userId: input.userId,
      metadata: { applicationId: saved.id, status: saved.status },
    });
    return { application: saved, created: false };
  }

  const application: CreatorApplicationRecord = {
    id: randomUUID(),
    userId: input.userId,
    status: "submitted",
    submittedAt: now,
    termsAcceptedAt: input.termsAcceptedAt ?? now,
    createdAt: now,
    updatedAt: now,
  };

  const saved = await deps.repo.save(application);
  await deps.analytics.track({
    eventType: "creator_application_submitted",
    userId: input.userId,
    metadata: { applicationId: saved.id, status: saved.status },
  });
  return { application: saved, created: true };
}
