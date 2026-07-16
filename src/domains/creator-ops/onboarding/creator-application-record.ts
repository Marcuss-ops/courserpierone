/**
 * src/domains/creator-ops/onboarding/creator-application-record.ts
 *
 * Phase 6 — Creator Application domain record.
 *
 * Pure TypeScript type used by the repository port, use cases, and
 * rules. No framework or Prisma imports.
 */

import type { CreatorApplicationStatus } from "./creator-application-status";

export interface CreatorApplicationRecord {
  id: string;
  userId: string;
  status: CreatorApplicationStatus;
  submittedAt?: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  rejectionReason?: string;
  identityVerifiedAt?: Date;
  termsAcceptedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}
