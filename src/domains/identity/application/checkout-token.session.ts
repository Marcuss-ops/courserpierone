import type { NextResponse } from "next/server";

import { getRedis, setIfAbsent } from "@/lib/redis";
import {
  CHECKOUT_SESSION_COOKIE,
  CHECKOUT_TOKEN_TTL_SECONDS,
  CheckoutTokenError,
  type CheckoutTokenPayload,
  type ProductBinding,
} from "./checkout-token.types";
import {
  consumedKey,
  registryKey,
  verifyCheckoutToken,
} from "./checkout-token.crypto";

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

function unavailable(): CheckoutTokenError {
  return new CheckoutTokenError(
    "CHECKOUT_TOKEN_REDIS_UNAVAILABLE",
    "Checkout access is temporarily unavailable",
    503,
  );
}

async function consumeRegisteredPayload(
  payload: CheckoutTokenPayload,
  token: string,
  binding: ProductBinding,
  now: Date,
): Promise<CheckoutTokenPayload> {
  assertProductBinding(payload, binding);
  const redis = getRedis();
  if (!redis) throw unavailable();

  try {
    const consumed = await setIfAbsent(
      consumedKey(payload.jti),
      token,
      Math.max(1, payload.exp - Math.floor(now.getTime() / 1000)),
    );
    if (!consumed) {
      throw new CheckoutTokenError(
        "CHECKOUT_TOKEN_REPLAYED",
        "Checkout token has already been used",
        409,
      );
    }
  } catch (error) {
    if (error instanceof CheckoutTokenError) throw error;
    throw unavailable();
  }

  return payload;
}

export async function registerCheckoutToken(
  token: string,
  binding?: ProductBinding,
  now: Date = new Date(),
): Promise<CheckoutTokenPayload> {
  const payload = verifyCheckoutToken(token, now);
  if (binding) assertProductBinding(payload, binding);

  const redis = getRedis();
  if (!redis) throw unavailable();

  try {
    const registered = await redis.set(registryKey(payload.jti), token, { nx: true });
    if (registered !== "OK") {
      const existing = await redis.get<string>(registryKey(payload.jti));
      if (!existing) {
        throw new CheckoutTokenError(
          "CHECKOUT_TOKEN_REPLAYED",
          "Checkout token registration raced and was lost",
          409,
        );
      }
      if (existing !== token) {
        const consumed = await redis.get<string>(consumedKey(payload.jti));
        if (consumed) {
          throw new CheckoutTokenError(
            "CHECKOUT_TOKEN_REPLAYED",
            "Checkout token has already been used",
            409,
          );
        }
        const existingPayload = verifyCheckoutToken(existing, now);
        assertProductBinding(existingPayload, binding ?? {
          productId: payload.productId,
          productSlug: payload.productSlug,
        });
        return existingPayload;
      }
    }
  } catch (error) {
    if (error instanceof CheckoutTokenError) throw error;
    throw unavailable();
  }

  return payload;
}

export async function consumeCheckoutToken(
  token: string,
  binding: ProductBinding,
  now: Date = new Date(),
): Promise<CheckoutTokenPayload> {
  const payload = verifyCheckoutToken(token, now);
  assertProductBinding(payload, binding);
  const redis = getRedis();
  if (!redis) throw unavailable();

  try {
    const registeredToken = await redis.get<string>(registryKey(payload.jti));
    if (registeredToken !== null && registeredToken !== token) {
      throw new CheckoutTokenError(
        "CHECKOUT_TOKEN_REPLAYED",
        "Checkout token has already been registered",
        409,
      );
    }
    if (registeredToken === null) {
      const registered = await redis.set(registryKey(payload.jti), token, { nx: true });
      if (registered !== "OK") {
        throw new CheckoutTokenError(
          "CHECKOUT_TOKEN_REPLAYED",
          "Checkout token registration raced and was lost",
          409,
        );
      }
    }
  } catch (error) {
    if (error instanceof CheckoutTokenError) throw error;
    throw unavailable();
  }

  return consumeRegisteredPayload(payload, token, binding, now);
}

export async function consumeRegisteredCheckoutToken(
  jti: string,
  binding: ProductBinding,
  now: Date = new Date(),
): Promise<CheckoutTokenPayload> {
  const redis = getRedis();
  if (!redis) throw unavailable();

  let token: string | null;
  try {
    token = await redis.get<string>(registryKey(jti));
  } catch {
    throw unavailable();
  }
  if (!token) {
    throw new CheckoutTokenError("CHECKOUT_TOKEN_INVALID", "Checkout token is not registered");
  }
  const payload = verifyCheckoutToken(token, now);
  return consumeRegisteredPayload(payload, token, binding, now);
}

export async function readCheckoutSession(
  jti: string,
  binding: ProductBinding,
  now: Date = new Date(),
): Promise<CheckoutTokenPayload | null> {
  const redis = getRedis();
  if (!jti || !redis) return null;

  let raw: string | null;
  try {
    raw = await redis.get<string>(registryKey(jti));
  } catch {
    throw unavailable();
  }
  if (!raw) return null;

  const payload = verifyCheckoutToken(raw, now);
  assertProductBinding(payload, binding);
  return payload;
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
