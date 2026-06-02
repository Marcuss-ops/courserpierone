import { lemonSqueezySetup } from "@lemonsqueezy/lemonsqueezy.js";

let _initialized = false;

export function initLS() {
  if (_initialized) return;

  const apiKey = process.env.LEMONSQUEEZY_API_KEY;
  if (!apiKey) {
    console.warn("Missing LEMONSQUEEZY_API_KEY — Lemon Squeezy functionality disabled");
    return;
  }

  lemonSqueezySetup({
    apiKey,
    onError: (error) => console.error("Lemon Squeezy API error:", error),
  });

  _initialized = true;
}

export function getStoreId(): string {
  return process.env.LEMONSQUEEZY_STORE_ID ?? "";
}

export function getWebhookSecret(): string {
  return process.env.LEMONSQUEEZY_WEBHOOK_SECRET ?? "";
}
