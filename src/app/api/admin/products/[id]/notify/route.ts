/**
 * src/app/api/admin/products/[id]/notify/route.ts
 *
 * Admin endpoint to notify all active AccessGrant holders of a product.
 * AccessGrant is the single source of truth for the recipient list.
 *
 * POST /api/admin/products/{id}/notify
 * Body: { type: "new_lesson" | "new_course" | "lesson_update" | "course_update",
 *         title: string, body?: string, link?: string }
 *
 * Architecture (per ADR-0016 §1 — UI/Route → UseCase → Domain → Port → Adapter):
 *   1. Authenticate + require admin role.
 *   2. Parse path param and JSON body.
 *   3. Delegate to `notifyProductSubscribers`.
 *   4. Return { sent, skipped }.
 */

import { NextRequest, NextResponse } from "next/server";

import { apiErrorResponse } from "@/lib/errors";
import { requireAdmin } from "@/domains/identity";
import { notifyProductSubscribers } from "@/lib/notifications/notify-product-subscribers";
import type { NotifyProductSubscribersInput } from "@/lib/notifications/notify-product-subscribers";
import type { NotificationType } from "@/lib/notifications/create-notification";

const ALLOWED_TYPES: readonly NotificationType[] = [
  "new_lesson",
  "new_course",
  "lesson_update",
  "course_update",
];

interface NotifyBody {
  type?: NotificationType;
  title?: string;
  body?: string;
  link?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: productId } = await params;

    // ── 1. Auth + admin role ───────────────────────────────────
    const authResponse = await requireAdmin();
    if (authResponse) {
      return authResponse;
    }

    // ── 2. Parse + validate body ───────────────────────────────
    let body: NotifyBody;
    try {
      body = (await request.json()) as NotifyBody;
    } catch {
      return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
    }

    if (!body.type || !ALLOWED_TYPES.includes(body.type)) {
      return NextResponse.json(
        { error: "INVALID_NOTIFICATION_TYPE" },
        { status: 400 },
      );
    }
    if (typeof body.title !== "string" || body.title.length === 0) {
      return NextResponse.json(
        { error: "MISSING_TITLE" },
        { status: 400 },
      );
    }

    // ── 3. Delegate to use case ──────────────────────────────
    const result = await notifyProductSubscribers({
      productId,
      type: body.type as NotifyProductSubscribersInput["type"],
      title: body.title,
      body: body.body,
      link: body.link,
    });

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error, "Failed to notify subscribers");
  }
}
