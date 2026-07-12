import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { apiErrorResponse } from "@/lib/errors";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { findCompletedOrder, findCompletedOrderByOrderId } from "@/lib/access";

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

    // Check user by session
    if (user?.email && dbUser) {
      // Grant access if they are admin or have a completed order
      if (dbUser.role === "admin") {
        return NextResponse.json({ hasAccess: true, userId: dbUser.id });
      }
      // V2 DRY: helper consolidato. Admin bypass inline (pattern admin
      // del route è diverso dalle altre route: ritorna shape con userId).
      const hasOrder = await findCompletedOrder({
        userId: dbUser.id,
        productId: dbProductId,
      });
      if (hasOrder) {
        return NextResponse.json({ hasAccess: true, userId: dbUser.id });
      }
    }

    // Check order ID directly (useful for immediate redirect access from checkouts)
    // V3.1 DRY: migrato al sibling SSO `findCompletedOrderByOrderId` per
    // chiudere l'ultimo scattered variant. La query interna rimane
    // semanticamente identica (OR su `id`/providerOrderId, productId
    // scope check, status="completed") ma è ora testata e documentata
    // in `src/lib/access/find-completed-order-by-order-id.test.ts`.
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
