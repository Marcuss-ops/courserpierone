"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function SaveAccess({ productSlug, isFreeCourse: _isFreeCourse }: { productSlug: string; isFreeCourse?: boolean }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    try {
      // Canonical order reference: providerOrderId (explicit, from the
      // post-checkout redirect) OR orderId (internal Order.id). The
      // legacy `order_id` alias is gone — the Lemon Squeezy redirect
      // now emits provider=lemonsqueezy&providerOrderId=[order_id].
      const orderReference =
        searchParams.get("providerOrderId") ||
        searchParams.get("orderId");
      const token = searchParams.get("token");

      if (orderReference) {
        localStorage.setItem(`access-order-${productSlug}`, orderReference);
      }
      if (token) {
        localStorage.setItem(`access-token-${productSlug}`, token);
      }
    } catch (e) {
      console.warn("[SaveAccess] Failed to save credentials:", e);
    }
  }, [productSlug, searchParams]);

  return null;
}
