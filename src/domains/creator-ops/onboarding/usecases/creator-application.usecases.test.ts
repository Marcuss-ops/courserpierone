/**
 * src/domains/creator-ops/onboarding/usecases/creator-application.usecases.test.ts
 *
 * Phase 6 — Creator Application use case tests.
 */

import { describe, it, expect, vi } from "vitest";
import { createInMemoryCreatorApplicationRepository } from "./in-memory-creator-application-repository";
import { submitCreatorApplication } from "./submit-creator-application.usecase";
import { approveCreatorApplication, rejectCreatorApplication } from "./review-creator-application.usecase";
import { verifyCreatorIdentity } from "./verify-creator-identity.usecase";
import { acceptCreatorTerms } from "./accept-creator-terms.usecase";
import type { CreatorApplicationAnalytics } from "../ports/creator-application-analytics.port";
import type { CreatorApplicationUserService } from "../ports/creator-application-user-service.port";

function createNoOpAnalytics(): CreatorApplicationAnalytics {
  return { track: vi.fn() };
}

function createNoOpUserService(): CreatorApplicationUserService {
  return { approveExternalCreator: vi.fn() };
}

describe("submitCreatorApplication", () => {
  it("creates a new submitted application", async () => {
    const repo = createInMemoryCreatorApplicationRepository();
    const result = await submitCreatorApplication(
      { userId: "user-1" },
      { repo, analytics: createNoOpAnalytics() },
    );
    expect(result.created).toBe(true);
    expect(result.application.status).toBe("submitted");
    expect(result.application.userId).toBe("user-1");
  });

  it("transitions an existing draft application to submitted", async () => {
    const repo = createInMemoryCreatorApplicationRepository();
    const first = await submitCreatorApplication(
      { userId: "user-1" },
      { repo, analytics: createNoOpAnalytics() },
    );
    const second = await submitCreatorApplication(
      { userId: "user-1" },
      { repo, analytics: createNoOpAnalytics() },
    );
    expect(second.created).toBe(false);
    expect(second.application.id).toBe(first.application.id);
    expect(second.application.status).toBe("submitted");
  });

  it("throws when transitioning from a terminal state", async () => {
    const repo = createInMemoryCreatorApplicationRepository();
    const submitted = await submitCreatorApplication(
      { userId: "user-1" },
      { repo, analytics: createNoOpAnalytics() },
    );
    await approveCreatorApplication(
      { applicationId: submitted.application.id, reviewedBy: "admin-1" },
      { repo, analytics: createNoOpAnalytics() },
    );
    await expect(
      submitCreatorApplication(
        { userId: "user-1" },
        { repo, analytics: createNoOpAnalytics() },
      ),
    ).rejects.toThrow();
  });
});

describe("reviewCreatorApplication", () => {
  it("approves a submitted application", async () => {
    const repo = createInMemoryCreatorApplicationRepository();
    const submitted = await submitCreatorApplication(
      { userId: "user-1" },
      { repo, analytics: createNoOpAnalytics() },
    );
    const approved = await approveCreatorApplication(
      { applicationId: submitted.application.id, reviewedBy: "admin-1" },
      { repo, analytics: createNoOpAnalytics(), userService: createNoOpUserService() },
    );
    expect(approved.status).toBe("approved");
    expect(approved.reviewedBy).toBe("admin-1");
  });

  it("rejects an application with a reason", async () => {
    const repo = createInMemoryCreatorApplicationRepository();
    const submitted = await submitCreatorApplication(
      { userId: "user-1" },
      { repo, analytics: createNoOpAnalytics() },
    );
    const rejected =    await rejectCreatorApplication(
      {
        applicationId: submitted.application.id,
        reviewedBy: "admin-1",
        rejectionReason: "Incomplete profile",
      },
      { repo, analytics: createNoOpAnalytics(), userService: createNoOpUserService() },
    );
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectionReason).toBe("Incomplete profile");
  });

  it("throws when approving a rejected application", async () => {
    const repo = createInMemoryCreatorApplicationRepository();
    const submitted = await submitCreatorApplication(
      { userId: "user-1" },
      { repo, analytics: createNoOpAnalytics() },
    );
    await rejectCreatorApplication(
      {
        applicationId: submitted.application.id,
        reviewedBy: "admin-1",
        rejectionReason: "Nope",
      },
      { repo, analytics: createNoOpAnalytics() },
    );
    await expect(
      approveCreatorApplication(
        { applicationId: submitted.application.id, reviewedBy: "admin-2" },
        { repo, analytics: createNoOpAnalytics(), userService: createNoOpUserService() },
      ),
    ).rejects.toThrow();
  });
});

describe("verifyCreatorIdentity", () => {
  it("records identity verification", async () => {
    const repo = createInMemoryCreatorApplicationRepository();
    const submitted = await submitCreatorApplication(
      { userId: "user-1" },
      { repo, analytics: createNoOpAnalytics() },
    );
    const verified = await verifyCreatorIdentity(
      { applicationId: submitted.application.id },
      { repo, analytics: createNoOpAnalytics() },
    );
    expect(verified.identityVerifiedAt).toBeInstanceOf(Date);
  });
});

describe("acceptCreatorTerms", () => {
  it("records terms acceptance", async () => {
    const repo = createInMemoryCreatorApplicationRepository();
    const submitted = await submitCreatorApplication(
      { userId: "user-1" },
      { repo, analytics: createNoOpAnalytics() },
    );
    const accepted = await acceptCreatorTerms(
      { applicationId: submitted.application.id },
      { repo, analytics: createNoOpAnalytics() },
    );
    expect(accepted.termsAcceptedAt).toBeInstanceOf(Date);
  });
});
