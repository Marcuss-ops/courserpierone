import { NextRequest, NextResponse } from "next/server";
import { lemonSqueezyProvider } from "@/lib/commerce/payments/providers/lemonsqueezy";
import { readWebhookRequest, newRequestId } from "@/lib/commerce/webhooks/adapter";
import { processWebhookEvent } from "@/lib/commerce/webhooks/processor";
import {
  wasAlreadyProcessed,
  recordDelivery,
} from "@/lib/commerce/webhooks/idempotency";
import {
  isAckError,
  isSecurityOrParseError,
  isTransientError,
  isAcknowledgableError,
} from "@/lib/commerce/webhooks/error-classifier";

// Force dynamic — webhook non può essere statico.
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/lemonsqueezy
 *
 * Thin HTTP adapter. All business logic lives in:
 *   - LemonSqueezyPaymentProvider.parseWebhook   — HMAC + JSON + normalize
 *   - processWebhookEvent (processor)            — dispatch by eventType
 *   - revokeOrder / complete-order               — domain actions
 *   - verifier, idempotency, error-classifier    — reusable helpers
 *
 * This route is a transport layer: read body → provider.parseWebhook →
 * provider-agnostic dispatcher. No JSON.parse, no Prisma, no event-name
 * branching here. The full invariant lives in the processor.
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
    if (isAckError(error)) {
      // Provider-decided "ack with no side effects" — log so the
      // server has a trace of which payloads got silently accepted
      // (e.g. LS ping with no meta.event_name). Without this we'd
      // have no audit row in ProcessedWebhook to inspect later.
      console.info(`[LS Webhook ${requestId}] Ack-only payment`, {
        reason: error.message,
      });
      return NextResponse.json({ received: true });
    }
    if (isSecurityOrParseError(error)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (isTransientError(error)) {
      return NextResponse.json({ error: "Temporary failure" }, { status: 503 });
    }
    if (isAcknowledgableError(error)) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 200 },
      );
    }
    console.error(`[LS Webhook ${requestId}] Unexpected error:`, error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
