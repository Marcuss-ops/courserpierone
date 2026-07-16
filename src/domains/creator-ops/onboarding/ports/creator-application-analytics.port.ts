/**
 * src/domains/creator-ops/onboarding/ports/creator-application-analytics.port.ts
 *
 * Phase 6 — Creator Application Analytics Port.
 *
 * Thin outbound port so the domain use cases can record onboarding
 * funnel events without depending on Prisma directly.
 */

export interface CreatorApplicationAnalyticsEvent {
  eventType:
    | "creator_application_started"
    | "creator_application_submitted"
    | "creator_application_identity_verified"
    | "creator_application_terms_accepted"
    | "creator_application_approved"
    | "creator_application_rejected";
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface CreatorApplicationAnalytics {
  track(event: CreatorApplicationAnalyticsEvent): Promise<void>;
}
