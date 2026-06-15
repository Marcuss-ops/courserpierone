"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function SaveAccess({ productSlug }: { productSlug: string }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    try {
      const orderId = searchParams.get("order_id") || searchParams.get("orderId");
      const token = searchParams.get("token");

      if (orderId) {
        localStorage.setItem(`access-order-${productSlug}`, orderId);
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
