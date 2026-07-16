/**
 * src/domains/creator-ops/onboarding/creator-application-repository.ts
 *
 * Phase 6 — Creator Application persistence port (Domain layer).
 *
 * ADR-0016 §1: this file contains ONLY the port contract. The Prisma
 * adapter lives in `adapters/prisma-creator-application-repository.ts`.
 */

import type { CreatorApplicationRecord } from "./creator-application-record";

export interface CreatorApplicationRepository {
  /** Persist a record. Upserts by id. */
  save(record: CreatorApplicationRecord): Promise<CreatorApplicationRecord>;

  /** Find a record by id. */
  findById(id: string): Promise<CreatorApplicationRecord | null>;

  /** Find the application belonging to a user. */
  findByUserId(userId: string): Promise<CreatorApplicationRecord | null>;

  /** List applications awaiting review. */
  findPending(options: {
    /** Maximum records to return. */
    limit: number;
    /** Records to skip. */
    offset: number;
  }): Promise<readonly CreatorApplicationRecord[]>;
}
