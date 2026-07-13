import type { TemplateId } from "@/components/funnel/types";

export interface ProductMetric {
  id: string;
  slug: string;
  title: string;
  template: TemplateId;
  status: "published" | "draft" | "archived";
  locales: string[];
  sales: number;
  revenue: number;
  conversion: string;
}

export const DASHBOARD_DATA = {
  stats: {
    totalRevenue: 0,
    totalRevenueTrend: "0%",
    netSales: 0,
    netSalesTrend: "0%",
    activeFunnels: 0,
    activeFunnelsTrend: "0",
    averageCR: "0%",
    averageCRTrend: "0%",
  },
  
  products: [] as ProductMetric[],

  trafficSources: [
    { label: "YouTube Ads", value: 0, color: "bg-red-600" },
    { label: "Instagram", value: 0, color: "bg-purple-600" },
  ]
};
