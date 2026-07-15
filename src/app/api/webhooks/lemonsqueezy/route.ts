import { NextRequest, NextResponse } from "next/server";
import { lemonSqueezyProvider } from "@/lib/commerce/payments/providers/lemonsqueezy";
import { readWebhookRequest, newRequestId } from "@/lib/commerce/webhooks/adapter";
import { processWebhookEvent } from "@/lib/commerce/webhooks/processor";
import { wasAlreadyProcessed, recordDelivery } from "@/lib/commerce/webhooks/idempotency";
import { classifyWebhookError } from "@/lib/commerce/webhooks/error-classifier";

// Force dynamic — webhook non può essere statico.
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/lemonsqueezy — thin transport adapter.
 * body → provider.parseWebhook → idempotency gate → processor → ack
 * All business logic lives in the `webhooks/*` helpers + the provider.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = newRequestId();
  try {
    const { rawBody, signature } = await readWebhookRequest(request, {
      signatureHeader: "x-signature",
      providerSlug: "lemonsqueezy",
    });
    const event = await lemonSqueezyProvider.parseWebhook({
      provider: "lemonsqueezy",
      deliveryId: "",
      rawBody,
      signature,
    });
    if (
      await wasAlreadyProcessed({
        provider: "lemonsqueezy",
        deliveryId: event.deliveryId,
      })
    ) {
      return NextResponse.json({ received: true });
    }
    await processWebhookEvent(event);
    await recordDelivery({
      provider: "lemonsqueezy",
      deliveryId: event.deliveryId,
      eventType: event.eventType,
    });
    return NextResponse.json({ received: true });
  } catch (error) {
    return classifyWebhookError(error, requestId);
  }
}
