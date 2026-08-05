import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/supabase/get-user";
import { withRateLimit } from "@/lib/utils/rate-limit";
import { normalizeAccessInput } from "@/lib/commerce/access/normalize-access-input";
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
 * Order-identity normalization happens in ONE place — the adapter
 * `normalizeAccessInput` (`src/lib/commerce/access/normalize-access-input.ts`):
 * `providerOrderId` is forwarded explicitly (canonical); `orderId` is
 * treated as an internal `Order.id` (legacy `console.warn` when it
 * looks like a provider id). Pages/consumers never reimplement this
 * mapping.
 *
 * The resolver owns:
 *   - productId resolution (slug OR cuid)
 *   - session-keyed grants (userId)
 *   - admin bypass (userRole)
 *   - anonymous post-checkout access (provider + providerOrderId,
 *     translated to the internal Order.id before the grant lookup)
 *   - legacy internal `orderId` access for callers that already have
 *     the canonical Prisma Order.id
 */
export const GET = withRateLimit(async function GET(request: NextRequest) {
  try {
    const { dbUser } = await getServerUser();
    const { searchParams } = request.nextUrl;
    const productId = searchParams.get("productId");
    if (!productId) return NextResponse.json({ hasAccess: false });

    const explicitProviderOrderId =
      searchParams.get("providerOrderId") ||
      searchParams.get("provider_order_id") ||
      undefined;
    const legacyProviderOrderId = searchParams.get("order_id") || undefined;

    // SINGLE normalizing adapter at the entrance: LegacyAccessInput →
    // CanonicalAccessInput. The route does not guess how to key orders —
    // providerOrderId is forwarded explicitly, orderId is treated as an
    // internal Order.id (legacy console.warn when it carries a provider
    // id). This mapping lives HERE, in one place.
    const canonical = normalizeAccessInput({
      productId,
      orderId: searchParams.get("orderId") || undefined,
      providerOrderId: explicitProviderOrderId || legacyProviderOrderId,
    });

    const providerOrderId = canonical.providerOrderId;
    const granted = await resolveProductAccess({
      userId: dbUser?.id,
      userRole: dbUser?.role,
      productId: canonical.productId,
      // `order_id` is the legacy Lemon Squeezy-only redirect alias;
      // explicit providerOrderId values must include their provider.
      provider: providerOrderId
        ? searchParams.get("provider") ||
          (!explicitProviderOrderId && legacyProviderOrderId
            ? "lemonsqueezy"
            : undefined)
        : undefined,
      providerOrderId,
      orderId: canonical.orderId,
    });

    return NextResponse.json({
      hasAccess: granted.hasAccess,
      // Session-keyed grants (and admin bypass) expose the userId in
      // the response; anonymous orderId-keyed grants do not.
      ...(granted.hasAccess && dbUser ? { userId: dbUser.id } : {}),
    });
  } catch (error) {
    console.error("GET /api/access error:", error);
    return NextResponse.json({ hasAccess: false });
  }
}, "PUBLIC");
