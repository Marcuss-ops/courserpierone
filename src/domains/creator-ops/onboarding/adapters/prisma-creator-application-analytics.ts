/**
 * src/domains/creator-ops/onboarding/adapters/prisma-creator-application-analytics.ts
 *
 * Phase 6 — Creator Application Analytics Prisma Adapter.
 */

import { prisma } from "@/lib/db/prisma";
import type {
  CreatorApplicationAnalytics,
  CreatorApplicationAnalyticsEvent,
} from "../ports/creator-application-analytics.port";

export const prismaCreatorApplicationAnalytics: CreatorApplicationAnalytics = {
  async track(event: CreatorApplicationAnalyticsEvent): Promise<void> {
    await prisma.analyticEvent.create({
      data: {
        eventType: event.eventType,
        userId: event.userId,
        metadata: event.metadata ? JSON.stringify(event.metadata) : null,
      },
    });
  },
};
