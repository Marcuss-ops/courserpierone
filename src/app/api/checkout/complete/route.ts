import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getRedis } from "@/lib/redis";
import {
  CheckoutTokenError,
  consumeCheckoutToken,
  issueCheckoutToken,
  setCheckoutSessionCookie,
} from "@/lib/commerce/access/checkout-token";

const ORDER_LOOKUP_ATTEMPTS = 5;
const ORDER_LOOKUP_DELAY_MS = 500;
const CALLBACK_REPLAY_TTL_SECONDS = 10 * 60;

function redirectToDownload(request: NextRequest, locale: string, productSlug: string): NextResponse {
  const target = new URL(`/${locale}/${productSlug}/download`, request.nextUrl.origin);
  target.searchParams.set("lang", locale);
  return NextResponse.redirect(target);
}

async function findCompletedOrder(productId: string, providerOrderId: string) {
  for (let attempt = 0; attempt < ORDER_LOOKUP_ATTEMPTS; attempt++) {
    const order = await prisma.order.findFirst({
      where: {
        productId,
        paymentProvider: "lemonsqueezy",
        providerOrderId,
        status: "completed",
      },
      select: { id: true },
    });
    if (order) return order;
    if (attempt < ORDER_LOOKUP_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, ORDER_LOOKUP_DELAY_MS));
    }
  }
  return null;
}

/**
 * Authorization contract: public provider callback exchange. The
 * server authenticates the payment by requiring a product-scoped completed
 * Lemon Squeezy order, then consumes a one-time Redis claim before issuing
 * the HttpOnly session. No browser-supplied order identifier is trusted as
 * access on its own.
 *
 * Lemon Squeezy redirects here after payment. The provider order id is
 * accepted only at this server-side exchange boundary; it is never copied
 * to the browser redirect. The resulting HttpOnly session is the only
 * anonymous credential used by content routes.
 */
export async function GET(request: NextRequest) {
  const productSlug = request.nextUrl.searchParams.get("productSlug");
  const providerOrderId = request.nextUrl.searchParams.get("providerOrderId");
  const locale = request.nextUrl.searchParams.get("lang") || "it";

  if (!productSlug || !providerOrderId) {
    return NextResponse.json({ error: "Checkout callback is missing required data" }, { status: 400 });
  }

  try {
    const product = await prisma.product.findUnique({
      where: { slug: productSlug },
      select: { id: true, slug: true },
    });
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const order = await findCompletedOrder(product.id, providerOrderId);
    if (!order) {
      return NextResponse.json({ error: "Payment is still being verified" }, { status: 409 });
    }

    // The token is created only after the completed order was confirmed.
    // The provider order id never appears in the browser redirect.
    const redis = getRedis();
    const callbackKey = `checkout-callback:lemonsqueezy:${product.id}:${providerOrderId}`;
    if (!redis) {
      return NextResponse.json({ error: "Checkout access is temporarily unavailable" }, { status: 503 });
    }
    let callbackClaimed: string | null;
    try {
      callbackClaimed = await redis.set(callbackKey, "1", {
        ex: CALLBACK_REPLAY_TTL_SECONDS,
        nx: true,
      });
    } catch {
      return NextResponse.json({ error: "Checkout access is temporarily unavailable" }, { status: 503 });
    }
    if (callbackClaimed !== "OK" && callbackClaimed !== "1") {
      return NextResponse.json({ error: "Checkout callback has already been used" }, { status: 409 });
    }

    const token = issueCheckoutToken({
      productId: product.id,
      productSlug: product.slug,
      provider: "lemonsqueezy",
      providerOrderId,
    });
    const payload = await consumeCheckoutToken(token, {
      productId: product.id,
      productSlug: product.slug,
    });

    const response = redirectToDownload(request, locale, product.slug);
    setCheckoutSessionCookie(response, payload.jti);
    return response;
  } catch (error) {
    if (error instanceof CheckoutTokenError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("GET /api/checkout/complete error:", error);
    return NextResponse.json({ error: "Checkout verification failed" }, { status: 500 });
  }
}
