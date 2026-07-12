import Stripe from "stripe";
import crypto from "crypto";

function getStripeSecret(): string {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    throw new Error("STRIPE_SECRET_KEY deve essere impostato per i test E2E");
  }
  return secret;
}

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("STRIPE_WEBHOOK_SECRET deve essere impostato per i test E2E");
  }
  return secret;
}

export const stripe = new Stripe(getStripeSecret(), {
  typescript: true,
});

export async function createStripeCheckoutSession(
  priceId: string,
  metadata: Record<string, string>
) {
  return stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: "http://localhost:3000/success",
    cancel_url: "http://localhost:3000/cancel",
    metadata,
  });
}

export function generateStripeWebhookPayload(
  session: Stripe.Checkout.Session
) {
  const event = {
    id: `evt_${crypto.randomUUID().replace(/-/g, "")}`,
    object: "event",
    api_version: "2024-06-20",
    type: "checkout.session.completed",
    data: { object: session },
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: `req_${crypto.randomUUID().replace(/-/g, "")}` },
  };

  return event;
}

export function signStripeWebhookPayload(payload: unknown): {
  signature: string;
  body: string;
} {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signed = crypto
    .createHmac("sha256", getWebhookSecret())
    .update(`${timestamp}.${body}`, "utf8")
    .digest("hex");
  const signature = `t=${timestamp},v1=${signed}`;
  return { signature, body };
}
