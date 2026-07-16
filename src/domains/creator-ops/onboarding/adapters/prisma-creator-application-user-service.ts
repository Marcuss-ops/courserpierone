/**
 * src/domains/creator-ops/onboarding/adapters/prisma-creator-application-user-service.ts
 *
 * Phase 6 — Creator Application User Service Prisma Adapter.
 */

import { prisma } from "@/lib/db/prisma";
import type { CreatorApplicationUserService } from "../ports/creator-application-user-service.port";

export const prismaCreatorApplicationUserService: CreatorApplicationUserService = {
  async approveExternalCreator(userId: string): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: {
        role: "creator",
        creatorType: "external",
      },
    });
  },
};
