/**
 * Temporary compatibility shim.
 * Canonical checkout-session API: `@/domains/identity`.
 */
export {
  CHECKOUT_SESSION_COOKIE,
  CHECKOUT_TOKEN_TTL_SECONDS,
  CheckoutTokenError,
  consumeCheckoutToken,
  consumeRegisteredCheckoutToken,
  deriveCheckoutJti,
  issueCheckoutToken,
  readCheckoutSession,
  registerCheckoutToken,
  setCheckoutSessionCookie,
  verifyCheckoutToken,
} from "@/domains/identity";

export type {
  CheckoutTokenErrorCode,
  CheckoutTokenPayload,
  IssueCheckoutTokenInput,
  ProductBinding,
} from "@/domains/identity";
