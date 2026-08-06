import crypto from "node:crypto";

import {
  CHECKOUT_TOKEN_TTL_SECONDS,
  CLOCK_SKEW_SECONDS,
  TOKEN_VERSION,
  type CheckoutProvider,
  type CheckoutTokenPayload,
  CheckoutTokenError,
  type IssueCheckoutTokenInput,
} from "./checkout-token.types";

function getSecret(): string {
  const secret = process.env.CHECKOUT_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new CheckoutTokenError(
      "CHECKOUT_TOKEN_INVALID",
      "Checkout token secret is not configured",
      503,
    );
  }
  return secret;
}

function encode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(unsignedToken: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(unsignedToken, "utf8")
    .digest("base64url");
}

export function registryKey(jti: string): string {
  return `checkout-token:registry:jti:${jti}`;
}

export function consumedKey(jti: string): string {
  return `checkout-token:consumed:jti:${jti}`;
}

/** Stable callback identity for a provider order and product. */
export function deriveCheckoutJti(
  provider: CheckoutProvider,
  providerOrderId: string,
  productId: string,
): string {
  return crypto
    .createHash("sha256")
    .update(`${provider}\0${providerOrderId}\0${productId}`, "utf8")
    .digest("hex");
}

function assertPayload(payload: unknown): asserts payload is CheckoutTokenPayload {
  if (!payload || typeof payload !== "object") {
    throw new CheckoutTokenError("CHECKOUT_TOKEN_MALFORMED", "Malformed checkout token");
  }

  const value = payload as Record<string, unknown>;
  const stringFields = ["jti", "productId", "productSlug", "provider", "providerOrderId"];
  const validStrings = stringFields.every(
    (field) => typeof value[field] === "string" && value[field] !== "",
  );

  if (
    value.v !== TOKEN_VERSION ||
    !validStrings ||
    typeof value.iat !== "number" ||
    typeof value.exp !== "number" ||
    value.provider !== "lemonsqueezy" ||
    !Number.isSafeInteger(value.iat) ||
    !Number.isSafeInteger(value.exp) ||
    value.exp <= value.iat
  ) {
    throw new CheckoutTokenError("CHECKOUT_TOKEN_MALFORMED", "Malformed checkout token");
  }
}

export function issueCheckoutToken(input: IssueCheckoutTokenInput): string {
  if (!input.productId || !input.productSlug || !input.providerOrderId) {
    throw new CheckoutTokenError("CHECKOUT_TOKEN_MALFORMED", "Missing checkout token binding");
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const payload: CheckoutTokenPayload = {
    v: TOKEN_VERSION,
    jti: input.jti ?? crypto.randomUUID(),
    productId: input.productId,
    productSlug: input.productSlug,
    provider: input.provider,
    providerOrderId: input.providerOrderId,
    iat: nowSeconds,
    exp: nowSeconds + CHECKOUT_TOKEN_TTL_SECONDS,
  };

  const encodedPayload = encode(JSON.stringify(payload));
  const unsignedToken = `${encode(String(TOKEN_VERSION))}.${encodedPayload}`;
  return `${unsignedToken}.${sign(unsignedToken)}`;
}

export function verifyCheckoutToken(token: string, now: Date = new Date()): CheckoutTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => part === "")) {
    throw new CheckoutTokenError("CHECKOUT_TOKEN_MALFORMED", "Malformed checkout token");
  }

  const [versionPart, payloadPart, signaturePart] = parts;
  const unsignedToken = `${versionPart}.${payloadPart}`;
  const expectedSignature = sign(unsignedToken);
  const expected = Buffer.from(expectedSignature, "utf8");
  const actual = Buffer.from(signaturePart, "utf8");

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new CheckoutTokenError("CHECKOUT_TOKEN_INVALID", "Invalid checkout token signature");
  }

  let payload: unknown;
  try {
    if (decode(versionPart) !== String(TOKEN_VERSION)) {
      throw new Error("Unsupported token version");
    }
    payload = JSON.parse(decode(payloadPart)) as unknown;
  } catch {
    throw new CheckoutTokenError("CHECKOUT_TOKEN_MALFORMED", "Malformed checkout token");
  }

  assertPayload(payload);

  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (payload.exp <= nowSeconds || payload.iat > nowSeconds + CLOCK_SKEW_SECONDS) {
    throw new CheckoutTokenError("CHECKOUT_TOKEN_EXPIRED", "Checkout token expired");
  }

  return payload;
}
