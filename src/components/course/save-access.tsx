"use client";

/**
 * Compatibility placeholder for pages that still import SaveAccess.
 * Checkout access is now stored only in the server-set HttpOnly cookie;
 * browser localStorage must never retain a payment credential.
 */
export function SaveAccess(_props: { productSlug: string; isFreeCourse?: boolean }) {
  return null;
}
