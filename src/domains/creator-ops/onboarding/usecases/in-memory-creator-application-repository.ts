/**
 * src/domains/creator-ops/onboarding/usecases/in-memory-creator-application-repository.ts
 *
 * Phase 6 — In-memory CreatorApplicationRepository for unit tests.
 */

import type { CreatorApplicationRecord } from "../creator-application-record";
import type { CreatorApplicationRepository } from "../creator-application-repository";

export function createInMemoryCreatorApplicationRepository(): CreatorApplicationRepository {
  const records = new Map<string, CreatorApplicationRecord>();

  return {
    async save(record: CreatorApplicationRecord): Promise<CreatorApplicationRecord> {
      records.set(record.id, { ...record });
      return record;
    },

    async findById(id: string): Promise<CreatorApplicationRecord | null> {
      const record = records.get(id);
      return record ? { ...record } : null;
    },

    async findByUserId(userId: string): Promise<CreatorApplicationRecord | null> {
      for (const record of records.values()) {
        if (record.userId === userId) {
          return { ...record };
        }
      }
      return null;
    },

    async findPending({
      limit,
      offset,
    }: {
      limit: number;
      offset: number;
    }): Promise<readonly CreatorApplicationRecord[]> {
      return Array.from(records.values())
        .filter((r) => r.status === "submitted" || r.status === "under_review")
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .slice(offset, offset + limit);
    },
  };
}
