/** Canonical payment-provider keys shared by types, registry, and drift checks. */
export const PAYMENT_PROVIDER_SLUGS = ["lemonsqueezy"] as const;
export type PaymentProviderSlug = (typeof PAYMENT_PROVIDER_SLUGS)[number];
