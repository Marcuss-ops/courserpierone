import crypto from "crypto";

function getApiKey(): string {
  const key = process.env.LEMONSQUEEZY_API_KEY;
  if (!key) {
    throw new Error("LEMONSQUEEZY_API_KEY deve essere impostato per i test E2E");
  }
  return key;
}

function getWebhookSecret(): string {
  const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("LEMONSQUEEZY_WEBHOOK_SECRET deve essere impostato per i test E2E");
  }
  return secret;
}

function getStoreId(): string {
  const id = process.env.LEMONSQUEEZY_STORE_ID;
  if (!id) {
    throw new Error("LEMONSQUEEZY_STORE_ID deve essere impostato per i test E2E");
  }
  return id;
}

export async function createLemonCheckout(variantId: string, customData: Record<string, string>) {
  const response = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            custom: customData,
          },
        },
        relationships: {
          store: { data: { type: "stores", id: getStoreId() } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LemonSqueezy checkout creation failed: ${response.status} ${text}`);
  }

  return response.json();
}

export function generateLemonWebhookPayload(orderId: string, customData: Record<string, string>) {
  const payload = {
    meta: {
      event_name: "order_created",
      custom_data: customData,
    },
    data: {
      id: orderId,
      type: "orders",
      attributes: {
        user_email: `test-${orderId}@example.com`,
        user_name: "Test User",
        total: 4900,
        currency: "USD",
        customer_country: "US",
        first_order_item: {
          variant_id: parseInt(customData.variantId ?? "0", 10),
          product_options: {
            custom_data: customData,
          },
        },
      },
    },
  };

  return payload;
}

export function signLemonWebhookPayload(payload: unknown): {
  signature: string;
  body: string;
} {
  const body = JSON.stringify(payload);
  const signature = crypto
    .createHmac("sha256", getWebhookSecret())
    .update(body, "utf8")
    .digest("hex");
  return { signature, body };
}
