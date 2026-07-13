"use client";

import { useEffect, useRef } from "react";
import { getVisitorId, parseUtmParams, getReferrer } from "@/lib/i18n/visitor-session";

interface AnalyticsTrackerProps {
  productSlug: string;
}

function sendEvent(eventType: string, productSlug: string, extra?: Record<string, unknown>) {
  const sessionId = getVisitorId();
  const utm = parseUtmParams();
  const referrer = getReferrer();

  fetch("/api/analytics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      eventType,
      sessionId,
      productId: productSlug,
      metadata: {
        ...extra,
        url: window.location.href,
        referrer,
        ...utm,
      },
    }),
  }).catch((e) => console.warn("[Analytics] sendEvent failed:", e));
}

function usePageViewTracking(productSlug: string) {
  const tracked = useRef(false);

  useEffect(() => {
    if (!productSlug || tracked.current) return;
    tracked.current = true;
    sendEvent("pageview", productSlug);
  }, [productSlug]);
}

function useScrollTracking(productSlug: string) {
  const milestones = useRef(new Set<string>());

  useEffect(() => {
    if (!productSlug) return;

    const handleScroll = () => {
      const scrollPct = Math.round(
        (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
      );

      for (const threshold of [25, 50, 75, 90]) {
        if (scrollPct >= threshold && !milestones.current.has(String(threshold))) {
          milestones.current.add(String(threshold));
          sendEvent("scroll_deep", productSlug, { scrollPercent: threshold });
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [productSlug]);
}

export function trackCheckoutOpen(productSlug: string, extra?: Record<string, unknown>) {
  sendEvent("checkout_open", productSlug, extra);
}

export function AnalyticsTracker({ productSlug }: AnalyticsTrackerProps) {
  usePageViewTracking(productSlug);
  useScrollTracking(productSlug);
  return null;
}
