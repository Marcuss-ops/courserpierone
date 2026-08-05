import { NextRequest, NextResponse } from "next/server";
// Step 7: route imports the registry (which triggers the LS-provider
// registration side-effect via payments/init.ts) — never the concrete
// LS adapter. The webhook transport layer talks only to the port.
import { paymentProviderRegistry } from "@/lib/commerce/payments/init";
import { readWebhookRequest, newRequestId } from "@/lib/commerce/webhooks/adapter";
import { processWebhookEvent } from "@/lib/commerce/webhooks/processor";
import {
  completeWebhookEvent,
  failWebhookEvent,
  ignoreUnsupportedWebhookEvent,
  reserveWebhookEvent,
} from "@/lib/commerce/webhooks/idempotency";
import {
  classifyWebhookError,
  isAcknowledgableError,
} from "@/lib/commerce/webhooks/error-classifier";

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
    const event = await paymentProviderRegistry
      .get("lemonsqueezy")
      .parseWebhook({
        provider: "lemonsqueezy",
        deliveryId: "",
        rawBody,
        signature,
      });
    const reservation = await reserveWebhookEvent({
      provider: "lemonsqueezy",
      deliveryId: event.deliveryId,
      eventType: event.eventType,
      rawBody,
    });

    if (!reservation.acquired) {
      return NextResponse.json({ received: true });
    }

    try {
      const action = await processWebhookEvent({
        ...event,
        deliveryId: reservation.deliveryId,
      });
      if (action.type === "ignored_unsupported") {
        await ignoreUnsupportedWebhookEvent({
          deliveryId: reservation.deliveryId,
          payloadHash: reservation.payloadHash,
          reason: action.reason,
        });
      } else {
        await completeWebhookEvent({
          deliveryId: reservation.deliveryId,
          payloadHash: reservation.payloadHash,
        });
      }
      return NextResponse.json({ received: true });
    } catch (error) {
      await failWebhookEvent({
        deliveryId: reservation.deliveryId,
        error,
        // Once a reservation exists, parse/security errors have already
        // returned above. Any non-deterministic processing error must remain
        // retryable, including an unexpected 500-class exception.
        retryable: !isAcknowledgableError(error),
      });
      throw error;
    }
  } catch (error) {
    return classifyWebhookError(error, requestId);
  }
}
