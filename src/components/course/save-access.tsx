"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function SaveAccess({ productSlug, isFreeCourse: _isFreeCourse }: { productSlug: string; isFreeCourse?: boolean }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    try {
      // Canonical order reference is providerOrderId (explicit); the
      // legacy order_id / orderId params are kept as fallbacks so old
      // redirect URLs keep working during the transition. NOTE: the
      // stored value may be a provider id OR an internal Order.id
      // depending on which param supplied it (key is write-only today).
      const orderReference =
        searchParams.get("providerOrderId") ||
        searchParams.get("order_id") ||
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
