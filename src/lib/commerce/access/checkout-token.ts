import crypto from "node:crypto";

import type { NextResponse } from "next/server";

import { getRedis, setIfAbsent } from "@/lib/redis";

export const CHECKOUT_SESSION_COOKIE = "courssy_checkout_session";
export const CHECKOUT_TOKEN_TTL_SECONDS = 10 * 60;

const TOKEN_VERSION = 1;
const TOKEN_PREFIX = "checkout-token:jti:";
const CLOCK_SKEW_SECONDS = 5;

type CheckoutProvider = "lemonsqueezy";

export interface CheckoutTokenPayload {
  v: typeof TOKEN_VERSION;
  jti: string;
  productId: string;
  productSlug: string;
  provider: CheckoutProvider;
  providerOrderId: string;
  iat: number;
  exp: number;
}

export type CheckoutTokenErrorCode =
  | "CHECKOUT_TOKEN_MALFORMED"
  | "CHECKOUT_TOKEN_INVALID"
  | "CHECKOUT_TOKEN_EXPIRED"
  | "CHECKOUT_TOKEN_PRODUCT_MISMATCH"
  | "CHECKOUT_TOKEN_REPLAYED"
  | "CHECKOUT_TOKEN_REDIS_UNAVAILABLE";

export class CheckoutTokenError extends Error {
  public readonly code: CheckoutTokenErrorCode;
  public readonly status: 401 | 409 | 503;

  constructor(
    code: CheckoutTokenErrorCode,
    message: string,
    status: 401 | 409 | 503 = 401,
  ) {
    super(message);
    this.name = "CheckoutTokenError";
    this.code = code;
    this.status = status;
  }
}

export interface IssueCheckoutTokenInput {
  productId: string;
  productSlug: string;
  provider: CheckoutProvider;
  providerOrderId: string;
  now?: Date;
}

export interface ProductBinding {
  productId: string;
  productSlug?: string;
}

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

function tokenKey(jti: string): string {
  return `${TOKEN_PREFIX}${jti}`;
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
    value.provider !== "lemonsqueezy"
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
    jti: crypto.randomUUID(),
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

function assertProductBinding(payload: CheckoutTokenPayload, binding: ProductBinding): void {
  if (
    payload.productId !== binding.productId ||
    (binding.productSlug !== undefined && payload.productSlug !== binding.productSlug)
  ) {
    throw new CheckoutTokenError(
      "CHECKOUT_TOKEN_PRODUCT_MISMATCH",
      "Checkout token is bound to a different product",
    );
  }
}

/**
 * Atomically consumes the signed token. The consumed jti record doubles as
 * the short-lived post-checkout session referenced by the HttpOnly cookie.
 */
export async function consumeCheckoutToken(
  token: string,
  binding: ProductBinding,
  now: Date = new Date(),
): Promise<CheckoutTokenPayload> {
  const payload = verifyCheckoutToken(token, now);
  assertProductBinding(payload, binding);

  const redis = getRedis();
  if (!redis) {
    throw new CheckoutTokenError(
      "CHECKOUT_TOKEN_REDIS_UNAVAILABLE",
      "Checkout access is temporarily unavailable",
      503,
    );
  }

  let stored: boolean;
  try {
    stored = await setIfAbsent(
      tokenKey(payload.jti),
      token,
      Math.max(1, payload.exp - Math.floor(now.getTime() / 1000)),
    );
  } catch {
    throw new CheckoutTokenError(
      "CHECKOUT_TOKEN_REDIS_UNAVAILABLE",
      "Checkout access is temporarily unavailable",
      503,
    );
  }

  if (!stored) {
    throw new CheckoutTokenError(
      "CHECKOUT_TOKEN_REPLAYED",
      "Checkout token has already been used",
      409,
    );
  }

  return payload;
}

/** Read the post-checkout session created by consumeCheckoutToken. */
export async function readCheckoutSession(
  jti: string,
  binding: ProductBinding,
  now: Date = new Date(),
): Promise<CheckoutTokenPayload | null> {
  const redis = getRedis();
  if (!jti || !redis) return null;

  let raw: string | null;
  try {
    raw = await redis.get<string>(tokenKey(jti));
  } catch {
    throw new CheckoutTokenError(
      "CHECKOUT_TOKEN_REDIS_UNAVAILABLE",
      "Checkout access is temporarily unavailable",
      503,
    );
  }
  if (!raw) return null;

  try {
    const payload = verifyCheckoutToken(raw, now);
    assertProductBinding(payload, binding);
    return payload;
  } catch (error) {
    if (error instanceof CheckoutTokenError) throw error;
    return null;
  }
}

export function setCheckoutSessionCookie(response: NextResponse, jti: string): void {
  response.cookies.set(CHECKOUT_SESSION_COOKIE, jti, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHECKOUT_TOKEN_TTL_SECONDS,
  });
}
