import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { resolveProductAccess } from "@/domains/identity";
import { prisma } from "@/lib/db/prisma";
import {
  CheckoutTokenError,
  CHECKOUT_SESSION_COOKIE,
  consumeCheckoutToken,
  readCheckoutSession,
  setCheckoutSessionCookie,
} from "@/lib/commerce/access/checkout-token";

/**
 * GET /api/access?productId=<slug-or-id>
 *
 * Anonymous post-checkout access uses only the short-lived HttpOnly
 * checkout-session cookie. A raw `checkoutToken` may be exchanged once at
 * this endpoint; providerOrderId and orderId are intentionally rejected.
 */
export const GET = withRateLimit(async function GET(request: NextRequest) {
  try {
    const { dbUser } = await getServerUser();
    const { searchParams } = request.nextUrl;
    const productInput = searchParams.get("productId");
    if (!productInput) return NextResponse.json({ hasAccess: false });

    const product = await prisma.product.findFirst({
      where: {
        deletedAt: null,
        OR: [{ id: productInput }, { slug: productInput }],
      },
      select: { id: true, slug: true },
    });
    if (!product) return NextResponse.json({ hasAccess: false });

    const checkoutToken = searchParams.get("checkoutToken");
    const sessionId = request.cookies?.get(CHECKOUT_SESSION_COOKIE)?.value;
    let checkoutSession: Awaited<ReturnType<typeof readCheckoutSession>> = null;
    let exchanged = false;

    if (checkoutToken) {
      checkoutSession = await consumeCheckoutToken(checkoutToken, {
        productId: product.id,
        productSlug: product.slug,
      });
      exchanged = true;
    } else if (sessionId) {
      checkoutSession = await readCheckoutSession(sessionId, {
        productId: product.id,
        productSlug: product.slug,
      });
    }

    const accessRequest = dbUser
      ? dbUser.role === "admin"
        ? { kind: "admin" as const, adminId: dbUser.id, productId: product.id }
        : { kind: "authenticated" as const, userId: dbUser.id, productId: product.id }
      : checkoutSession
        ? { kind: "post_checkout" as const, token: checkoutSession.jti, productId: product.id }
        : null;

    const granted = accessRequest
      ? await resolveProductAccess(accessRequest)
      : { hasAccess: false, reason: "not_purchased" as const, productId: product.id };

    const result = {
      hasAccess: granted.hasAccess,
      ...(granted.hasAccess && dbUser ? { userId: dbUser.id } : {}),
    };
    if (exchanged && checkoutSession) {
      const response = NextResponse.json(result);
      setCheckoutSessionCookie(response, checkoutSession.jti);
      return response;
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof CheckoutTokenError) {
      return NextResponse.json(
        { hasAccess: false, error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("GET /api/access error:", error);
    return NextResponse.json({ hasAccess: false });
  }
}, "PUBLIC");
