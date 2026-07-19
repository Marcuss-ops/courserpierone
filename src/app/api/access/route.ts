import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { resolveProductAccess } from "@/lib/commerce/access/resolve-product-access";
import { findCompletedOrderByOrderId } from "@/lib/access";

/**
 * GET /api/access - auth semantics probe.
 *
 * Step 9 - MCR Phase 3 cutover: the session-keyed comparison reads
 * from `AccessGrant.status="active"` via `resolveProductAccess` (the
 * post-cutover SSOT path). The orderId-keyed Pattern B branch is
 * preserved: that path validates a guest's payment receipt
 * immediately after checkout (LS webhook settles the order
 * synchronously with the grant dual-write, so the order row IS the
 * canonical proof of receipt for a guest redirect from the
 * checkout page). The orderId-keyed path is a payment-receipt
 * concern, not an access-control concern.
 */
export const GET = withRateLimit(async function GET(request: NextRequest) {
  try {
    const { user, dbUser } = await getServerUser();
    const { searchParams } = request.nextUrl;
    const productId = searchParams.get("productId");
    const orderId = searchParams.get("orderId") || searchParams.get("order_id");

    if (!productId) return NextResponse.json({ hasAccess: false });

    // Resolve product UUID from input (which can be either UUID or slug)
    const product = await prisma.product.findFirst({
      where: {
        OR: [
          { id: productId },
          { slug: productId }
        ]
      }
    });

    if (!product) return NextResponse.json({ hasAccess: false });
    const dbProductId = product.id;

    // Session-keyed read: AccessGrant SSOT via resolveProductAccess.
    if (user?.email && dbUser) {
      // Inline admin bypass (admin does not need a grant row to access).
      if (dbUser.role === "admin") {
        return NextResponse.json({ hasAccess: true, userId: dbUser.id });
      }
      const granted = await resolveProductAccess({
        userId: dbUser.id,
        productId: dbProductId,
      });
      if (granted.allowed) {
        return NextResponse.json({ hasAccess: true, userId: dbUser.id });
      }
    }

    // Pattern B - orderId-keyed check (payment-receipt semantics).
    if (orderId) {
      const order = await findCompletedOrderByOrderId({
        orderId,
        productId: dbProductId,
      });
      if (order) {
        return NextResponse.json({ hasAccess: true });
      }
    }

    return NextResponse.json({ hasAccess: false });
  } catch (error) {
    console.error("GET /api/access error:", error);
    return NextResponse.json({ hasAccess: false });
  }
}, "PUBLIC");
