export const CHECKOUT_SESSION_COOKIE = "courssy_checkout_session";
export const CHECKOUT_TOKEN_TTL_SECONDS = 10 * 60;

export const TOKEN_VERSION = 1;
export const TOKEN_REGISTRY_PREFIX = "checkout-token:registry:jti:";
export const TOKEN_CONSUMED_PREFIX = "checkout-token:consumed:jti:";
export const CLOCK_SKEW_SECONDS = 5;

export type CheckoutProvider = "lemonsqueezy";

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
  /** Optional deterministic jti for a provider callback. */
  jti?: string;
  now?: Date;
}

export interface ProductBinding {
  productId: string;
  productSlug?: string;
}
