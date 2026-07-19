import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { resolveProductAccess } from "@/lib/commerce/access/resolve-product-access";

/**
 * GET /api/access - auth semantics probe.
 *
 * Step 9 - MCR Phase 3 cutover: the session-keyed comparison reads
 * from `AccessGrant.status="active"` via `resolveProductAccess` (the
 * post-cutover SSOT path).
 *
 * Pattern B - anonymous post-checkout orderId-keyed access:
 * the guest path also reads `AccessGrant` directly, keyed by
 * `(sourceType='order' AND sourceId=orderId AND productId)` + the
 * canonical `status='active' + non-expired` filter. The grant row IS
 * the post-cutover SSOT link between the Order and the
 * authorization decision — the orderId ITSELF is the `sourceId` on
 * the `'order'` grant written by `processOrder` in the LS webhook
 * handler. Reading AccessGrant here keeps the route's behavior (anon
 * guest sees `{hasAccess: true}` immediately after a successful
 * checkout) without leaking the `Order.status === 'completed'` filter
 * into the access-control surface.
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

    // Pattern B - orderId-keyed check (V2 AccessGrant SSOT).
    //
    // Reads `AccessGrant` directly, NOT `Order.status`. The grant row
    // written by `processOrder` in the LS webhook handler has
    // `sourceType='order' AND sourceId=Order.id` (which equals the
    // providerOrderId passed to the webhook). Resolving by these two
    // keys is structural-equivalent to the prior Order.status read but
    // surfaces the SAME SQL shape as `resolveProductAccess` (status +
    // expiresAt or) — no separate code path leaks through the SSOT.
    if (orderId) {
      const grant = await prisma.accessGrant.findFirst({
        where: {
          sourceType: "order",
          sourceId: orderId,
          productId: dbProductId,
          status: "active",
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      });
      if (grant) {
        return NextResponse.json({ hasAccess: true });
      }
    }

    return NextResponse.json({ hasAccess: false });
  } catch (error) {
    console.error("GET /api/access error:", error);
    return NextResponse.json({ hasAccess: false });
  }
}, "PUBLIC");
