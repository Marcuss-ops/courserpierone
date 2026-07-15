import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getServerUser } from "@/lib/supabase/get-user";
import { checkoutSchema, validationErrorResponse } from "@/lib/utils/validations";
import { getCurrencyFromLocale } from "@/lib/i18n/locale-resolver";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { PricingService } from "@/lib/commerce/checkout/pricing";
import { CheckoutService } from "@/lib/commerce/checkout/create-checkout";
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

    // V1.5+ LS-primary: Lemon Squeezy is the sole payment provider.
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
