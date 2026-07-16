/**
 * src/lib/auth/require-creator-or-admin.ts
 *
 * Phase 6 — Require an authenticated admin or an approved creator.
 *
 * Admins are always allowed. Internal creators are allowed. External
 * creators must have an approved `CreatorApplication`.
 */

import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";
import { prisma } from "@/lib/db/prisma";
import { canCreateProduct, canPublishProduct } from "@/domains/creator-ops/onboarding/rules/creator-application-guards";
import type { CreatorApplicationStatus } from "@/domains/creator-ops/onboarding/creator-application-status";

export interface AuthorizedCreator {
  userId: string;
  role: "admin" | "creator";
  creatorType?: string | null;
}

export interface RequireCreatorOrAdminResult {
  response: NextResponse | null;
  user: AuthorizedCreator | null;
}

async function fetchApplicationStatus(userId: string) {
  const application = await prisma.creatorApplication.findUnique({
    where: { userId },
    select: { status: true },
  });
  return (application?.status ?? undefined) as CreatorApplicationStatus | undefined;
}

/**
 * Require an authenticated admin or an approved creator for product
 * creation or publishing. Returns a NextResponse on auth failure,
 * otherwise the authorized user.
 */
export async function requireCreatorOrAdmin(
  action: "create" | "publish",
): Promise<RequireCreatorOrAdminResult> {
  const { user, dbUser } = await getServerUser();
  if (!user?.email || !dbUser) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), user: null };
  }

  if (dbUser.role === "admin") {
    return { response: null, user: { userId: dbUser.id, role: "admin", creatorType: dbUser.creatorType } };
  }

  if (dbUser.role !== "creator") {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }), user: null };
  }

  const applicationStatus = await fetchApplicationStatus(dbUser.id);
  const guardInput = { role: dbUser.role, creatorType: dbUser.creatorType, applicationStatus };
  const allowed = action === "create" ? canCreateProduct(guardInput) : canPublishProduct(guardInput);

  if (!allowed) {
    return {
      response: NextResponse.json(
        { error: "Creator onboarding not completed" },
        { status: 403 },
      ),
      user: null,
    };
  }

  return { response: null, user: { userId: dbUser.id, role: "creator", creatorType: dbUser.creatorType } };
}
