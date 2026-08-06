import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiErrorResponse } from "@/lib/errors";
import { buildAnalyticsProductWhere } from "@/domains/analytics";

const FUNNEL_STEPS = [
  "pageview",
  "scroll_deep",
  "click_buy",
  "checkout_open",
  "purchase",
  "lesson_start",
  "lesson_complete",
] as const;

const FUNNEL_STEP_VALUES: string[] = [...FUNNEL_STEPS];

// Analytics filters use explicit productId/productSlug/providerProductId
// fields and retain a fallback for historical slug-in-productId rows.

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const productId = searchParams.get("productId");
    const productSlug = searchParams.get("productSlug");
    const providerProductId = searchParams.get("providerProductId");
    const days = parseInt(searchParams.get("days") ?? "30");

    const identityWhere = buildAnalyticsProductWhere({
      productId,
      productSlug,
      providerProductId,
    });

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const baseWhere = {
      createdAt: { gte: since },
      ...identityWhere,
    };

    // OPTIMIZED: Single query instead of N+1 — fetch all events at once
    const allEvents = await prisma.analyticEvent.findMany({
      where: { ...baseWhere, eventType: { in: FUNNEL_STEP_VALUES } },
      select: { eventType: true, sessionId: true, metadata: true, createdAt: true },
    });

    // 1. Funnel step counts — compute from single query results
    const stepBuckets: Record<string, { sessionIds: Set<string>; anonymous: number; total: number }> = {};
    for (const step of FUNNEL_STEPS) {
      stepBuckets[step] = { sessionIds: new Set(), anonymous: 0, total: 0 };
    }

    for (const event of allEvents) {
      const bucket = stepBuckets[event.eventType];
      if (bucket) {
        bucket.total++;
        if (event.sessionId) bucket.sessionIds.add(event.sessionId);
        else bucket.anonymous++;
      }
    }

    const funnelSteps = FUNNEL_STEPS.map((step) => {
      const bucket = stepBuckets[step];
      const uniqueVisitors = bucket.sessionIds.size + bucket.anonymous;
      return {
        step,
        uniqueVisitors,
        totalEvents: bucket.total,
      };
    });

    // 2. Drop-off rates between steps
    const dropoffs = funnelSteps.map((step, i) => {
      if (i === 0) return { step: step.step, dropoffRate: 0, conversionFromPrev: 100 };
      const prev = funnelSteps[i - 1].uniqueVisitors;
      const curr = step.uniqueVisitors;
      const dropoffRate = prev > 0 ? Math.round(((prev - curr) / prev) * 100) : 0;
      const conversionFromPrev = prev > 0 ? Math.round((curr / prev) * 100) : 0;
      return { step: step.step, dropoffRate, conversionFromPrev };
    });

    // 3. Top referrers — from pageview events only
    const referrerCounts: Record<string, number> = {};
    for (const e of allEvents) {
      if (e.eventType !== "pageview") continue;
      try {
        const meta = typeof e.metadata === "string" ? JSON.parse(e.metadata) : (e.metadata ?? {});
        const ref = meta.referrer ?? "direct";
        const domain = ref !== "direct" && ref ? new URL(ref).hostname : "direct";
        referrerCounts[domain] = (referrerCounts[domain] ?? 0) + 1;
      } catch {
        referrerCounts.direct = (referrerCounts.direct ?? 0) + 1;
      }
    }

    const topReferrers = Object.entries(referrerCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([source, count]) => ({ source, count }));

    // 4. UTM campaign performance — from pageview events
    const campaignStats: Record<string, { visitors: Set<string>; purchases: number }> = {};
    for (const e of allEvents) {
      try {
        const meta = typeof e.metadata === "string" ? JSON.parse(e.metadata) : (e.metadata ?? {});
        const campaign = meta.utm_campaign ?? "organic";
        if (!campaignStats[campaign]) campaignStats[campaign] = { visitors: new Set(), purchases: 0 };
        if (e.sessionId) campaignStats[campaign].visitors.add(e.sessionId);
      } catch { /* skip malformed metadata */ }
    }

    // Count purchases per campaign
    for (const e of allEvents) {
      if (e.eventType !== "purchase") continue;
      try {
        const meta = typeof e.metadata === "string" ? JSON.parse(e.metadata) : (e.metadata ?? {});
        const campaign = meta.utm_campaign ?? "organic";
        if (!campaignStats[campaign]) campaignStats[campaign] = { visitors: new Set(), purchases: 0 };
        campaignStats[campaign].purchases++;
      } catch { /* skip */ }
    }

    const campaigns = Object.entries(campaignStats)
      .map(([name, stats]) => ({
        name,
        visitors: stats.visitors.size,
        purchases: stats.purchases,
        conversion: stats.visitors.size > 0 ? Math.round((stats.purchases / stats.visitors.size) * 100) : 0,
      }))
      .sort((a, b) => b.visitors - a.visitors);

    // 5. Visitor journey (last 20 unique sessions with their event sequence)
    const sessionJourneys: Record<string, { events: string[]; firstSeen: Date; lastSeen: Date; converted: boolean }> = {};
    for (const e of allEvents) {
      if (!e.sessionId) continue;
      if (!sessionJourneys[e.sessionId]) {
        sessionJourneys[e.sessionId] = {
          events: [],
          firstSeen: e.createdAt,
          lastSeen: e.createdAt,
          converted: false,
        };
      }
      const journey = sessionJourneys[e.sessionId];
      journey.events.push(e.eventType);
      if (e.createdAt > journey.lastSeen) journey.lastSeen = e.createdAt;
      if (e.createdAt < journey.firstSeen) journey.firstSeen = e.createdAt;
      if (e.eventType === "purchase") journey.converted = true;
    }

    const journeys = Object.entries(sessionJourneys)
      .map(([sid, j]) => ({ sessionId: sid, ...j }))
      .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
      .slice(0, 20);

    return NextResponse.json({
      funnelSteps,
      dropoffs,
      topReferrers,
      campaigns,
      journeys,
      summary: {
        totalVisitors: funnelSteps[0]?.uniqueVisitors || 0,
        totalPurchases: funnelSteps.find((s) => s.step === "purchase")?.uniqueVisitors || 0,
        overallConversion:
          funnelSteps[0]?.uniqueVisitors > 0
            ? Math.round(
                ((funnelSteps.find((s) => s.step === "purchase")?.uniqueVisitors || 0) /
                  funnelSteps[0].uniqueVisitors) *
                  100
              )
            : 0,
      },
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to fetch funnel data");
  }
}
