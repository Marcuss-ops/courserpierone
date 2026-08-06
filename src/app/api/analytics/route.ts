import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { analyticsEventSchema } from "@/lib/utils/validations";
import { rateLimit, rateLimitResponse } from "@/lib/utils/rate-limit";
import { apiErrorResponse } from "@/lib/errors";
import { isCuidShape } from "@/lib/analytics/ssot-identifier";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown";
    const rl = rateLimit(`analytics:${ip}`, 30, 60 * 1000);
    if (!rl.allowed) return rateLimitResponse(rl.resetIn);
    const body = await request.json();
    const parsed = analyticsEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid event data" }, { status: 400 });
    }
    const {
      eventType,
      productId: legacyProductId,
      productSlug,
      providerProductId,
      metadata,
      userId,
      sessionId,
    } = parsed.data;

    // Legacy clients sent the public slug as `productId`. Preserve those
    // events by routing non-cuid values to the explicit productSlug column;
    // internal cuid values remain productId.
    const productId = legacyProductId && isCuidShape(legacyProductId)
      ? legacyProductId
      : null;
    const resolvedProductSlug = productSlug ?? (
      legacyProductId && !isCuidShape(legacyProductId) ? legacyProductId : null
    );

    if (!eventType) {
      return NextResponse.json({ error: "Missing eventType" }, { status: 400 });
    }

    const userAgent = request.headers.get("user-agent") ?? "";

    let resolvedSessionId: string | null = null;

    // Create or update visitor session
    if (sessionId) {
      const existing = await prisma.visitorSession.findUnique({ where: { id: sessionId } });
      if (existing) {
        await prisma.visitorSession.update({
          where: { id: sessionId },
          data: { lastSeenAt: new Date() },
        });
        resolvedSessionId = sessionId;
      } else {
        // Parse UTM from metadata if present
        const meta = metadata ? ((typeof metadata === "string" ? JSON.parse(metadata) : metadata) ?? {}) : {};
        const created = await prisma.visitorSession.create({
          data: {
            id: sessionId,
            ip,
            userAgent,
            referrer: meta.referrer ?? "",
            utmSource: meta.utm_source ?? "",
            utmCampaign: meta.utm_campaign ?? "",
            utmMedium: meta.utm_medium ?? "",
          },
        });
        resolvedSessionId = created.id;
      }
    }

    const event = await prisma.analyticEvent.create({
      data: {
        sessionId: resolvedSessionId,
        eventType,
        productId,
        productSlug: resolvedProductSlug,
        providerProductId: providerProductId ?? null,
        metadata: metadata ? JSON.stringify(metadata) : null,
        userId: userId ?? null,
        ip,
        userAgent,
      },
    });

    return NextResponse.json({ success: true, event });
  } catch (error) {
    return apiErrorResponse(error, "Failed to record event");
  }
}
