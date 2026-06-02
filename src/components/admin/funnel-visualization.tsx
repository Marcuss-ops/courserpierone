"use client";

import { useState, useEffect } from "react";
import { TrendingDown, Eye, ShoppingCart, Play, CheckCircle, ArrowDown } from "lucide-react";

interface FunnelStep {
  step: string;
  uniqueVisitors: number;
  totalEvents: number;
}

interface Dropoff {
  step: string;
  dropoffRate: number;
  conversionFromPrev: number;
}

interface Journey {
  sessionId: string;
  events: string[];
  firstSeen: string;
  lastSeen: string;
  converted: boolean;
}

interface FunnelData {
  funnelSteps: FunnelStep[];
  dropoffs: Dropoff[];
  topReferrers: { source: string; count: number }[];
  campaigns: { name: string; visitors: number; purchases: number; conversion: number }[];
  journeys: Journey[];
  summary: { totalVisitors: number; totalPurchases: number; overallConversion: number };
}

const STEP_LABELS: Record<string, string> = {
  pageview: "Page View",
  scroll_deep: "Scrolled Deep",
  click_buy: "Clicked Buy",
  checkout_open: "Checkout Opened",
  purchase: "Purchase",
  lesson_start: "Lesson Started",
  lesson_complete: "Lesson Completed",
};

const STEP_ICONS: Record<string, React.ReactNode> = {
  pageview: <Eye className="w-4 h-4" />,
  scroll_deep: <ArrowDown className="w-4 h-4" />,
  click_buy: <ShoppingCart className="w-4 h-4" />,
  checkout_open: <ShoppingCart className="w-4 h-4" />,
  purchase: <CheckCircle className="w-4 h-4" />,
  lesson_start: <Play className="w-4 h-4" />,
  lesson_complete: <CheckCircle className="w-4 h-4" />,
};

const STEP_COLORS: Record<string, string> = {
  pageview: "from-blue-500 to-blue-600",
  scroll_deep: "from-cyan-500 to-cyan-600",
  click_buy: "from-amber-500 to-amber-600",
  checkout_open: "from-orange-500 to-orange-600",
  purchase: "from-green-500 to-green-600",
  lesson_start: "from-purple-500 to-purple-600",
  lesson_complete: "from-emerald-500 to-emerald-600",
};

export default function FunnelVisualization({ productId }: { productId?: string }) {
  const [data, setData] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    async function fetchFunnel() {
      setLoading(true);
      try {
        const params = new URLSearchParams({ days: String(days) });
        if (productId) params.set("productId", productId);
        const res = await fetch(`/api/analytics/funnel?${params}`);
        const json = await res.json();
        setData(json);
      } catch (e) {
        console.warn("[Funnel] Failed to fetch data:", e);
      } finally {
        setLoading(false);
      }
    }
    void fetchFunnel();
  }, [productId, days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const maxVisitors = data.funnelSteps[0]?.uniqueVisitors || 1;

  return (
    <div className="space-y-8">
      {/* Header + period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Funnel Analysis</h2>
          <p className="text-zinc-500 text-xs mt-1">Dove gli utenti si fermano nel percorso di acquisto</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
        >
          <option value={7}>Ultimi 7 giorni</option>
          <option value={30}>Ultimi 30 giorni</option>
          <option value={90}>Ultimi 90 giorni</option>
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="premium-glass rounded-2xl p-5">
          <div className="text-2xl font-black text-white">{data.summary.totalVisitors}</div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Unique Visitors</div>
        </div>
        <div className="premium-glass rounded-2xl p-5">
          <div className="text-2xl font-black text-green-400">{data.summary.totalPurchases}</div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Purchases</div>
        </div>
        <div className="premium-glass rounded-2xl p-5">
          <div className="text-2xl font-black text-accent-primary">{data.summary.overallConversion}%</div>
          <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">Overall Conversion</div>
        </div>
      </div>

      {/* Funnel visualization */}
      <div className="premium-glass rounded-2xl p-6">
        <h3 className="text-sm font-bold text-white mb-6">Conversion Funnel</h3>
        <div className="space-y-1">
          {data.funnelSteps.map((step, i) => {
            const width = Math.max((step.uniqueVisitors / maxVisitors) * 100, 8);
            const dropoff = data.dropoffs[i];
            return (
              <div key={step.step}>
                <div className="flex items-center gap-4">
                  <div className="w-32 shrink-0 flex items-center gap-2 text-xs text-zinc-400">
                    <span className={`p-1 rounded-lg bg-gradient-to-br ${STEP_COLORS[step.step] ?? "from-zinc-500 to-zinc-600"} text-white`}>
                      {STEP_ICONS[step.step]}
                    </span>
                    {STEP_LABELS[step.step] || step.step}
                  </div>
                  <div className="flex-1 relative">
                    <div
                      className={`h-10 rounded-xl bg-gradient-to-r ${STEP_COLORS[step.step] ?? "from-zinc-500 to-zinc-600"} flex items-center px-4 transition-all duration-500`}
                      style={{ width: `${width}%`, minWidth: "60px" }}
                    >
                      <span className="text-xs font-bold text-white">{step.uniqueVisitors}</span>
                    </div>
                  </div>
                  <div className="w-20 text-right shrink-0">
                    <span className="text-xs text-zinc-500">{step.totalEvents} evt</span>
                  </div>
                </div>
                {i < data.funnelSteps.length - 1 && dropoff && dropoff.dropoffRate > 0 && (
                  <div className="flex items-center gap-4 ml-14 my-1">
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <TrendingDown className="w-3 h-3 text-red-400" />
                      <span className="text-red-400 font-bold">-{dropoff.dropoffRate}%</span>
                      <span className="text-zinc-600">drop-off</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* User journeys */}
      <div className="premium-glass rounded-2xl p-6">
        <h3 className="text-sm font-bold text-white mb-4">Recent Visitor Journeys</h3>
        <div className="space-y-3">
          {data.journeys.length === 0 ? (
            <p className="text-zinc-600 text-xs">No visitor data yet</p>
          ) : (
            data.journeys.map((j) => (
              <div key={j.sessionId} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <div className={`w-2 h-2 rounded-full shrink-0 ${j.converted ? "bg-green-500" : "bg-zinc-600"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {j.events.map((evt, ei) => (
                      <span key={ei} className="flex items-center gap-1">
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-zinc-400 font-medium">
                          {STEP_LABELS[evt] || evt}
                        </span>
                        {ei < j.events.length - 1 && <span className="text-zinc-700 text-[8px]">&rarr;</span>}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-[9px] text-zinc-600 shrink-0">
                  {new Date(j.firstSeen).toLocaleDateString("it-IT")}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Top referrers */}
      {data.topReferrers.length > 0 && (
        <div className="premium-glass rounded-2xl p-6">
          <h3 className="text-sm font-bold text-white mb-4">Top Traffic Sources</h3>
          <div className="space-y-2">
            {data.topReferrers.map((r) => (
              <div key={r.source} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                <span className="text-xs text-zinc-300 truncate">{r.source}</span>
                <span className="text-xs font-bold text-white">{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Campaign performance */}
      {data.campaigns.length > 0 && (
        <div className="premium-glass rounded-2xl p-6">
          <h3 className="text-sm font-bold text-white mb-4">Campaign Performance</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-zinc-500 text-[10px] uppercase tracking-wider">
                <tr>
                  <th className="pb-3">Campaign</th>
                  <th className="pb-3 text-right">Visitors</th>
                  <th className="pb-3 text-right">Purchases</th>
                  <th className="pb-3 text-right">Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.campaigns.map((c) => (
                  <tr key={c.name}>
                    <td className="py-2 text-xs text-zinc-300">{c.name}</td>
                    <td className="py-2 text-xs text-white text-right">{c.visitors}</td>
                    <td className="py-2 text-xs text-green-400 text-right">{c.purchases}</td>
                    <td className="py-2 text-xs text-accent-primary text-right font-bold">{c.conversion}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
