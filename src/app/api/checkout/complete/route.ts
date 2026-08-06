import { NextRequest, NextResponse } from "next/server";

import {
  CheckoutTokenError,
  findCompletedProviderOrder,
  resolveProductReference,
  deriveCheckoutJti,
  issueCheckoutToken,
  registerCheckoutToken,
  setCheckoutSessionCookie,
} from "@/domains/identity";

function redirectToDownload(request: NextRequest, locale: string, productSlug: string): NextResponse {
  const target = new URL(`/${locale}/${productSlug}/download`, request.nextUrl.origin);
  target.searchParams.set("lang", locale);
  return NextResponse.redirect(target);
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
    const product = await resolveProductReference(productSlug);
    if (!product) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const order = await findCompletedProviderOrder(product.id, providerOrderId);
    if (!order) {
      return NextResponse.json({ error: "Payment is still being verified" }, { status: 409 });
    }

    // The token is created only after the completed order was confirmed.
    // Its deterministic jti makes repeated provider callbacks collide in the
    // durable Redis registry instead of minting fresh anonymous credentials.
    // Registration is deliberately separate from consumption: the browser
    // must still be able to exchange this token exactly once at /api/access.
    const token = issueCheckoutToken({
      productId: product.id,
      productSlug: product.slug,
      provider: "lemonsqueezy",
      providerOrderId,
      jti: deriveCheckoutJti("lemonsqueezy", providerOrderId, product.id),
    });
    const payload = await registerCheckoutToken(token, {
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
