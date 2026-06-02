"use client";

import { useEffect, useState } from "react";

interface AnalyticsStats {
  pageviews?: number;
  purchases?: number;
  [key: string]: unknown;
}

export function useAnalytics(productId?: string) {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);

  async function track(eventType: string, metadata?: object) {
    try {
      await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType,
          productId,
          metadata: metadata ?? {},
        }),
      });
    } catch (e) {
      console.warn("[Analytics] Failed to track event:", eventType, e);
    }
  }

  function trackPageView() {
    void track("pageview");
  }

  function trackClickBuy(extra?: object) {
    void track("click_buy", extra);
  }

  function trackCheckoutStart(extra?: object) {
    void track("checkout_start", extra);
  }

  function trackPurchase(amount?: number, extra?: object) {
    void track("purchase", { amount, ...extra });
  }

  function trackLessonComplete(lessonId: string) {
    void track("lesson_complete", { lessonId });
  }

  useEffect(() => {
    if (!productId) return;
    fetch(`/api/analytics/dashboard?productId=${productId}`)
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch((e) => console.warn("[Analytics] Failed to load stats:", e));
  }, [productId]);

  return { stats, track, trackPageView, trackClickBuy, trackCheckoutStart, trackPurchase, trackLessonComplete };
}
