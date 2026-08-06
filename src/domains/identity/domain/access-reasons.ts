/** Canonical reasons returned by the product-access decision. */
export type ProductAccessReason =
  | "active_purchase"
  | "subscription_active"
  | "not_purchased"
  | "refunded"
  | "payment_pending"
  | "order_not_found";
