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
 * The resolver owns:
 *   - productId resolution (slug OR cuid)
 *   - session-keyed grants (userId)
 *   - admin bypass (userRole)
 *   - anonymous post-checkout access (orderId — internal Order.id OR
 *     providerOrderId, translated to the canonical grant lookup)
 */
export const GET = withRateLimit(async function GET(request: NextRequest) {
  try {
    const { dbUser } = await getServerUser();
    const { searchParams } = request.nextUrl;
    const productId = searchParams.get("productId");
    const orderId = searchParams.get("orderId") || searchParams.get("order_id");

    if (!productId) return NextResponse.json({ hasAccess: false });

    const granted = await resolveProductAccess({
      userId: dbUser?.id,
      userRole: dbUser?.role,
      productId,
      orderId: orderId ?? undefined,
    });

    return NextResponse.json({
      hasAccess: granted.allowed,
      // Session-keyed grants (and admin bypass) expose the userId in
      // the response; anonymous orderId-keyed grants do not.
      ...(granted.allowed && dbUser ? { userId: dbUser.id } : {}),
    });
  } catch (error) {
    console.error("GET /api/access error:", error);
    return NextResponse.json({ hasAccess: false });
  }
}, "PUBLIC");
