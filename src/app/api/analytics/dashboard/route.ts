import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apiErrorResponse } from "@/lib/errors";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const productId = searchParams.get("productId");
    const days = parseInt(searchParams.get("days") ?? "30");
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const where = {
      createdAt: { gte: since },
      ...(productId ? { productId } : {}),
    };

    // Aggregate stats
    const pageviews = await prisma.analyticEvent.count({ where: { ...where, eventType: "pageview" } });
    const clicks = await prisma.analyticEvent.count({ where: { ...where, eventType: "click_buy" } });
    const purchases = await prisma.analyticEvent.count({ where: { ...where, eventType: "purchase" } });
    const revenue = await prisma.analyticEvent.findMany({
      where: { ...where, eventType: "purchase" },
      select: { metadata: true },
    });

    const totalRevenue = revenue.reduce((sum, r) => {
      try {
        const m = JSON.parse(r.metadata ?? "{}") as { amount?: number };
        return sum + (m.amount ?? 0);
      } catch {
        return sum;
      }
    }, 0);

    const ctr = pageviews > 0 ? (clicks / pageviews) * 100 : 0;
    const conversion = clicks > 0 ? (purchases / clicks) * 100 : 0;
    const avgCR = pageviews > 0 ? (purchases / pageviews) * 100 : 0;

    // Daily stats for chart
    const daily = await prisma.analyticEvent.findMany({
      where,
      orderBy: { createdAt: "asc" },
    });

    const dailyMap = new Map<string, { pageviews: number; clicks: number; purchases: number }>();
    for (const d of daily) {
      const key = d.createdAt.toISOString().split("T")[0];
      if (!dailyMap.has(key)) dailyMap.set(key, { pageviews: 0, clicks: 0, purchases: 0 });
      const curr = dailyMap.get(key)!;
      if (d.eventType === "pageview") curr.pageviews++;
      else if (d.eventType === "click_buy") curr.clicks++;
      else if (d.eventType === "purchase") curr.purchases++;
    }

    const chartData = Array.from(dailyMap.entries()).map(([date, values]) => ({
      date,
      ...values,
    }));

    return NextResponse.json({
      pageviews,
      clicks,
      purchases,
      totalRevenue: totalRevenue / 100,
      ctr: ctr.toFixed(1),
      conversion: conversion.toFixed(1),
      cr: avgCR.toFixed(1),
      chartData,
    });
  } catch (error) {
    return apiErrorResponse(error, "Failed to fetch analytics");
  }
}
