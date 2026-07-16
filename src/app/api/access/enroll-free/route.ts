/**
 * src/app/api/access/enroll-free/route.ts
 *
 * Phase 2 Step 1: free-course enrollment endpoint.
 *
 * Thin route — input parsing + auth + delegation to
 * `enrollFreeCourse` use case. No DB calls here. No business
 * decisions (free vs paid eligibility is owned by the use case).
 *
 * Caller pattern (e.g., a "Claim free course" button on the landing
 * page after Supabase auth):
 *   POST /api/access/enroll-free
 *   { productSlug: "test-course-e2e" }
 *   → 200 { enrolled: true, grantId: "...", alreadyEnrolled: false }
 *
 *   POST /api/access/enroll-free
 *   { productSlug: "amish-secrets" }   // paid course
 *   → 422 { error: "NOT_FREE_COURSE", message: "..." }
 *
 *   POST /api/access/enroll-free
 *   {} // no auth
 *   → 401 { error: "UNAUTHENTICATED" }
 *
 * Race-condition note:
 *   The use case handles dedupe atomically via `prisma.accessGrant.upsert`.
 *   Concurrent retries (double-click, refresh) return `alreadyEnrolled: true`
 *   instead of creating duplicate grants.
 *
 * Error mapping:
 *   Uses `apiErrorResponse` helper from `@/lib/errors.ts` (single
 *   source of truth for AppError → JSON shape). AppError carries its
 *   own statusCode + code; surface verbatim. Unknown errors get a
 *   generic 500 + log. The helper enforces the JSON shape contract
 *   across all Post-MCR-refactor routes.
 */

import { NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";
import {
  enrollFreeCourse,
  EnrollDenialReason,
} from "@/lib/commerce/access/enroll-free-course";
import { apiErrorResponse } from "@/lib/errors";

interface EnrollFreeRequestBody {
  productSlug?: string;
}

export async function POST(request: Request) {
  // ── 1. Auth: route requires authenticated user ──────────────
  // For API routes we want a JSON 401, not the redirect that
  // requireUser provides — so we use getServerUser + manual check.
  const { dbUser } = await getServerUser();
  if (!dbUser?.id) {
    return NextResponse.json(
      { error: "UNAUTHENTICATED" },
      { status: 401 },
    );
  }

  // ── 2. Parse + validate body ─────────────────────────────────
  let body: EnrollFreeRequestBody;
  try {
    body = (await request.json()) as EnrollFreeRequestBody;
  } catch {
    return NextResponse.json(
      { error: "INVALID_JSON" },
      { status: 400 },
    );
  }

  const productSlug = body.productSlug;
  if (typeof productSlug !== "string" || productSlug.length === 0) {
    return NextResponse.json(
      { error: "MISSING_PRODUCT_SLUG" },
      { status: 400 },
    );
  }

  // ── 3. Delegate to use case ──────────────────────────────────
  // Errors thrown by the use case are `AppError` instances with
  // statusCode + code (handled by apiErrorResponse). The happy path
  // returns `EnrollFreeCourseResult` — translated to HTTP status in
  // step 4.
  let result;
  try {
    result = await enrollFreeCourse({
      userId: dbUser.id,
      productSlug,
    });
  } catch (err) {
    return apiErrorResponse(err, "Free enrollment failed");
  }

  // ── 4. Translate EnrollFreeCourseResult → HTTP status ────────
  if (!result.enrolled) {
    if (result.reason === EnrollDenialReason.ProductNotFound) {
      return NextResponse.json(
        { error: "PRODUCT_NOT_FOUND" },
        { status: 404 },
      );
    }
    // Unreachable: use case only returns {enrolled:false, reason:
    // ProductNotFound}. Boundary-mismatch logged for future drift.
    console.warn("[enroll-free] unexpected denial reason:", result.reason);
    return NextResponse.json(
      { error: "INTERNAL_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      enrolled: true,
      grantId: result.grantId,
      alreadyEnrolled: result.alreadyEnrolled,
    },
    { status: 200 },
  );
}
