/**
 * src/domains/creator-ops/onboarding/adapters/prisma-creator-application-repository.ts
 *
 * Phase 6 — Creator Application Prisma Adapter.
 *
 * Implements the `CreatorApplicationRepository` port. Maps between
 * Prisma's camelCase fields and the Domain's `CreatorApplicationRecord`.
 */

import { prisma } from "@/lib/db/prisma";
import type { Prisma, CreatorApplication as PrismaCreatorApplication } from "@prisma/client";
import {
  CREATOR_APPLICATION_STATUSES,
  type CreatorApplicationStatus,
} from "../creator-application-status";
import type { CreatorApplicationRecord } from "../creator-application-record";
import type { CreatorApplicationRepository } from "../creator-application-repository";

function toDomain(row: PrismaCreatorApplication): CreatorApplicationRecord {
  const status = CREATOR_APPLICATION_STATUSES.has(row.status as CreatorApplicationStatus)
    ? (row.status as CreatorApplicationStatus)
    : "draft";
  return {
    id: row.id,
    userId: row.userId,
    status,
    submittedAt: row.submittedAt ?? undefined,
    reviewedAt: row.reviewedAt ?? undefined,
    reviewedBy: row.reviewedBy ?? undefined,
    rejectionReason: row.rejectionReason ?? undefined,
    identityVerifiedAt: row.identityVerifiedAt ?? undefined,
    termsAcceptedAt: row.termsAcceptedAt ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPrismaCreate(
  record: CreatorApplicationRecord,
): Prisma.CreatorApplicationUncheckedCreateInput {
  return {
    id: record.id,
    userId: record.userId,
    status: record.status,
    submittedAt: record.submittedAt ?? null,
    reviewedAt: record.reviewedAt ?? null,
    reviewedBy: record.reviewedBy ?? null,
    rejectionReason: record.rejectionReason ?? null,
    identityVerifiedAt: record.identityVerifiedAt ?? null,
    termsAcceptedAt: record.termsAcceptedAt ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export const prismaCreatorApplicationRepository: CreatorApplicationRepository = {
  async save(record: CreatorApplicationRecord): Promise<CreatorApplicationRecord> {
    const row = await prisma.creatorApplication.upsert({
      where: { id: record.id },
      create: toPrismaCreate(record),
      update: {
        status: record.status,
        submittedAt: record.submittedAt ?? null,
        reviewedAt: record.reviewedAt ?? null,
        reviewedBy: record.reviewedBy ?? null,
        rejectionReason: record.rejectionReason ?? null,
        identityVerifiedAt: record.identityVerifiedAt ?? null,
        termsAcceptedAt: record.termsAcceptedAt ?? null,
        updatedAt: record.updatedAt,
      },
    });
    return toDomain(row);
  },

  async findById(id: string): Promise<CreatorApplicationRecord | null> {
    const row = await prisma.creatorApplication.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  },

  async findByUserId(userId: string): Promise<CreatorApplicationRecord | null> {
    const row = await prisma.creatorApplication.findUnique({ where: { userId } });
    return row ? toDomain(row) : null;
  },

  async findPending({
    limit,
    offset,
  }: {
    limit: number;
    offset: number;
  }): Promise<readonly CreatorApplicationRecord[]> {
    const rows = await prisma.creatorApplication.findMany({
      where: {
        status: { in: ["submitted", "under_review"] },
      },
      orderBy: { createdAt: "asc" },
      skip: offset,
      take: limit,
    });
    return rows.map(toDomain);
  },
};

export { toDomain as prismaCreatorApplicationToDomain };
