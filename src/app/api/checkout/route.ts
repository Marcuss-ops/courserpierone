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

    // V1.5+ LS-primary: LS is the sole new-session provider. The
    // historical `ENABLE_STRIPE_CHECKOUT` env flag and the legacy
    // Stripe new-session provider were both removed in commits C1a
    // (provider module) + C2a (env registry entry). The legacy
    // Stripe webhook at `/api/webhooks/stripe/route.ts` remains ONLY
    // for processing pre-cutover refund/dispute events; it does not
    // consult any activation flag (it processes by Stripe signature).
    //
    // If `pricing.lemonVariantId` is missing, `CheckoutService.createCheckout`
    // throws a `CheckoutError` with a diagnostic message ("Nessun
    // metodo di pagamento disponibile...") — no route-level gate needed.

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
