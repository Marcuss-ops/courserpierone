import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { resolveProductAccess } from "@/lib/commerce/access/resolve-product-access";

/**
 * GET /api/access — auth semantics probe.
 *
 * Post-consolidation contract: the route ONLY parses the request,
 * delegates the ENTIRE access decision to `resolveProductAccess`
 * (the canonical AccessGrant SSOT resolver), and maps the result to
 * the public `{ hasAccess }` shape. No direct prisma queries, no
 * Order reads, no legacy tables, no parallel access logic inside
 * this file.
 *
 * Canonical order identity (explicit wire contract — the legacy
 * `order_id` / `provider_order_id` aliases are GONE):
 *   - `providerOrderId`  → forwarded explicitly (provider-scoped
 *     anonymous post-checkout path; requires `provider`).
 *   - `orderId`          → internal `Order.id`, forwarded as
 *     `internalOrderId` (strict internal PK — a provider id passed
 *     here fails closed with `order_not_found`).
 *   - neither            → session-keyed path only.
 *
 * The resolver owns:
 *   - productId resolution (slug OR cuid)
 *   - session-keyed grants (userId)
 *   - admin bypass (userRole)
 *   - anonymous post-checkout access (provider + providerOrderId,
 *     translated to the internal Order.id before the grant lookup)
 */
export const GET = withRateLimit(async function GET(request: NextRequest) {
  try {
    const { dbUser } = await getServerUser();
    const { searchParams } = request.nextUrl;
    const productId = searchParams.get("productId");
    if (!productId) return NextResponse.json({ hasAccess: false });

    const providerOrderId = searchParams.get("providerOrderId") || undefined;
    const internalOrderId = searchParams.get("orderId") || undefined;

    const granted = await resolveProductAccess({
      userId: dbUser?.id,
      userRole: dbUser?.role,
      productId,
      // Explicit providerOrderId values must include their provider —
      // a missing provider never triggers an unscoped lookup.
      provider: providerOrderId
        ? searchParams.get("provider") || undefined
        : undefined,
      providerOrderId,
      internalOrderId,
    });

    return NextResponse.json({
      hasAccess: granted.hasAccess,
      // Session-keyed grants (and admin bypass) expose the userId in
      // the response; anonymous orderId-keyed grants do not.
      ...(granted.hasAccess && dbUser ? { userId: dbUser.id } : {}),
    });
  } catch (error) {
    console.error("GET /api/access error:", error);
    return NextResponse.json({ hasAccess: false });
  }
}, "PUBLIC");
