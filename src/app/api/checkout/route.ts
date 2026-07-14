import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { checkoutSchema, validationErrorResponse } from "@/lib/utils/validations";
import { getCurrencyFromLocale } from "@/lib/i18n/locale-resolver";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { PricingService } from "@/lib/services/pricing-service";
import { CheckoutService } from "@/lib/services/checkout-service";
import { NotFoundError, apiErrorResponse } from "@/lib/errors";

const pricingService = new PricingService();
const checkoutService = new CheckoutService();

export const POST = withRateLimit(async function POST(request: NextRequest) {
  try {
    const { user } = await getServerUser();
    const body = await request.json();

    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return validationErrorResponse(
        parsed.error.issues.map((i) => ({
          field: i.path.join("."),
          message: i.message,
        }))
      );
    }

    const { productId, locale = "it", channelId, couponCode } = parsed.data;
    const currency = parsed.data.currency ?? getCurrencyFromLocale(locale);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      throw new NotFoundError("Product not found");
    }

    const country =
      request.headers.get("x-vercel-ip-country") ??
      request.headers.get("cf-ipcountry") ??
      undefined;

    const pricing = pricingService.resolve({
      product,
      locale,
      currency,
      country,
      couponCode,
    });

    pricingService.validateProvider(pricing);

    // Phase 7 cleanup: LS is the sole new-session provider as of
    // V1.5+. The legacy Stripe webhook at /api/webhooks/stripe/route.ts
    // remains for processing pre-cutover refund/dispute events.
    // ENABLE_STRIPE_CHECKOUT remains in env.ts but has no live readers
    // after C1a (the legacy provider module was removed); slated for
    // C1b removal. The legacy webhook handler does NOT consult the
    // flag by design — it processes events that pre-date it.
    //
    // If pricing.lemonVariantId is missing, CheckoutService.createCheckout
    // throws a CheckoutError with a diagnostic message ("Nessun
    // metodo di pagamento disponibile...") -- no need for an extra
    // route-level gate here.

    const userEmail = user?.email ?? body.email ?? "";

    const session = await checkoutService.createCheckout({
      product,
      pricing,
      locale,
      userEmail,
      channelId,
      country,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    return apiErrorResponse(error);
  }
}, "AUTH");
