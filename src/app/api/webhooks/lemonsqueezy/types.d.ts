// Local type shim for the LemonSqueezy webhook payload shape used by
// ./route.ts. Mirrors the codebase's pattern of locally-generated
// types (cf. src/components/course/video-player-sdks.d.ts from C3
// batch 2). Declares ONLY the fields this route reads.

export interface LsCustomData {
  courseSlug?: string;
  productSlug?: string;
  locale?: string;
  channelId?: string;
}

export interface LsWebhookMeta {
  event_name: string;
  custom_data?: LsCustomData;
}

export interface LsOrderItem {
  variant_id?: number | string;
  product_options?: {
    custom_data?: LsCustomData;
  };
}

export interface LsOrderAttributes {
  user_email?: string;
  customer_email?: string;
  user_name?: string;
  customer_country?: string;
  country?: string;
  total?: number;
  currency?: string;
  first_order_item?: LsOrderItem;
  /** Some order payloads carry variant_id/custom_data at the top level
   *  (not just inside first_order_item). Declared optional to match the
   *  union with LsSubscriptionAttributes in the subscription_created handler. */
  variant_id?: number | string;
  product_variant_id?: number | string;
  custom_data?: LsCustomData;
}

export interface LsSubscriptionAttributes {
  user_email?: string;
  customer_email?: string;
  user_name?: string;
  customer_country?: string;
  country?: string;
  total?: number;
  currency?: string;
  variant_id?: number | string;
  product_variant_id?: number | string;
  custom_data?: LsCustomData;
}

export interface LsWebhookData {
  id: string | number;
  attributes?: LsOrderAttributes | LsSubscriptionAttributes;
}

export interface LsWebhookPayload {
  meta: LsWebhookMeta;
  data: LsWebhookData;
}
