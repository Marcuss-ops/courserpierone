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

export interface LemonWebhookPayloadOptions {
  /** Override the buyer email. Defaults to `test-${orderId}@example.com`. */
  email?: string;
  /** Override the event_name. Defaults to "order_created". */
  eventName?: string;
  /** Override the total in cents. Defaults to 4900. */
  total?: number;
  /** Override the currency. Defaults to "USD". */
  currency?: string;
  /** Override the customer country. Defaults to "US". */
  customerCountry?: string;
  /** If true, emit a subscription-shaped payload (no first_order_item). Defaults to false. */
  subscriptionShape?: boolean;
}

/**
 * Build a Lemon Squeezy webhook payload that mirrors what the LS
 * platform actually POSTs (per https://docs.lemonsqueezy.com/help/checkout/passing-custom-data):
 *
 *   { meta: { event_name, custom_data }, data: { id, type, attributes: {...} } }
 *
 * The `customData` argument populates BOTH `meta.custom_data` (canonical
 * per LS docs) AND the older `first_order_item.product_options.custom_data`
 * path (defensive: ensures route-level fallback chains stay honest).
 */
export function generateLemonWebhookPayload(
  orderId: string,
  customData: Record<string, string>,
  options: LemonWebhookPayloadOptions = {},
) {
  const {
    email = `test-${orderId}@example.com`,
    eventName = "order_created",
    total = 4900,
    currency = "USD",
    customerCountry = "US",
    subscriptionShape = false,
  } = options;

  const dataType = subscriptionShape ? "subscriptions" : "orders";

  const baseAttributes: Record<string, unknown> = {
    user_email: email,
    user_name: "Test User",
    total,
    currency,
    customer_country: customerCountry,
  };

  if (!subscriptionShape) {
    baseAttributes.first_order_item = {
      variant_id: parseInt(customData.variantId ?? "0", 10),
      product_options: {
        custom_data: customData,
      },
    };
  } else {
    // Subscription-shaped payloads carry `variant_id` directly on
    // attributes (no `first_order_item` wrapper).
    baseAttributes.variant_id = parseInt(customData.variantId ?? "0", 10);
  }

  const payload = {
    meta: {
      event_name: eventName,
      custom_data: customData,
    },
    data: {
      id: orderId,
      type: dataType,
      attributes: baseAttributes,
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
