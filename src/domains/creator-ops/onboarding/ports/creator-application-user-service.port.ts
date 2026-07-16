/**
 * src/domains/creator-ops/onboarding/ports/creator-application-user-service.port.ts
 *
 * Phase 6 — Outbound port for updating the user record when a
 * creator application is approved.
 */

export interface CreatorApplicationUserService {
  /** Promote the user to an external creator. Idempotent. */
  approveExternalCreator(userId: string): Promise<void>;
}
