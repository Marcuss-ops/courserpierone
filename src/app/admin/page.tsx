"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import TemplateSelector from "@/components/admin/template-selector";
import FunnelVisualization from "@/components/admin/funnel-visualization";
import type { TemplateId } from "@/components/funnel/types";
import { DASHBOARD_DATA } from "@/lib/utils/dashboard-data";
import type { ProductApiItem, DashboardApiResponse } from "@/lib/utils/api-types";
import { 
  Plus, 
  Package, 
  Globe, 
  Euro,
  TrendingUp,
  Play,
  Camera,
  Search,
  Bell,
  CheckCircle,
  Edit,
  Archive,
  BarChart2,
  MoreVertical,
  Filter,
  Copy,
  Trash2,
  ExternalLink
} from "lucide-react";

export default function AdminDashboard() {
  const router = useRouter();
  const [showSelector, setShowSelector] = useState(false);
  const [data, setData] = useState(DASHBOARD_DATA);
  const [analytics, setAnalytics] = useState<DashboardApiResponse | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"overview" | "funnel">("overview");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch products
        const prodRes = await fetch("/api/products");
        const products = await prodRes.json() as ProductApiItem[];

        // Fetch analytics
        const analyticsRes = await fetch("/api/analytics/dashboard");
        const analyticsData = await analyticsRes.json() as DashboardApiResponse | null;

        if (Array.isArray(products)) {
          setData({
            stats: {
              totalRevenue: analyticsData?.totalRevenue ?? 0,
              totalRevenueTrend: (analyticsData?.ctr ?? "0") + "%",
              netSales: analyticsData?.purchases ?? 0,
              netSalesTrend: "-",
              activeFunnels: products.filter((p: { status: string }) => p.status === "published").length,
              activeFunnelsTrend: "/" + products.length,
              averageCR: (analyticsData?.cr ?? "0") + "%",
              averageCRTrend: "-",
            },
            products: products.map((p: any) => ({
              id: p.id,
              slug: p.slug,
              title: p.slug,
              template: p.templateId as "lumio" | "h612" | "horizon" | "book-claude" | "amish",
              status: (p.status ?? "draft") as "published" | "draft" | "archived",
              locales: p.locales ?? [],
              sales: p.lessonsCount ?? 0,
              revenue: p.revenue ?? 0,
              conversion: p.conversion ?? "0%",
            })),
            trafficSources: [
              { label: "YouTube", value: analyticsData?.pageviews ?? 0, color: "bg-red-600" },
              { label: "Direct", value: 0, color: "bg-accent-primary" },
            ],
          });
          setAnalytics(analyticsData);
        }
      } catch {
        // Keep default empty data
      }
    }
    void fetchData();
  }, []);

  const handleCreateProduct = (templateId: TemplateId, domain: string) => {
    setShowSelector(false);
    router.push(`/admin/products/new?template=${templateId}&slug=${domain}`);
  };

  async function handleStatusChange(id: string, status: string) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setData((prev) => ({
          ...prev,
          products: prev.products.map((p) => (p.id === id ? { ...p, status: status as "published" | "draft" | "archived" } : p)),
        }));
      }
    } finally {
      setActionLoading(null);
      setOpenMenuId(null);
    }
  }

  async function handleDuplicate(id: string) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/products/${id}/duplicate`, { method: "POST" });
      if (res.ok) {
        window.location.reload();
      } else {
        alert("Errore nella duplicazione del prodotto");
      }
    } finally {
      setActionLoading(null);
      setOpenMenuId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Sei sicuro di voler eliminare questo prodotto? Questa azione è irreversibile.")) return;
    setActionLoading(id);
    try {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (res.ok) {
        setData((prev) => ({ ...prev, products: prev.products.filter((p) => p.id !== id) }));
      } else {
        alert("Errore nell'eliminazione del prodotto");
      }
    } finally {
      setActionLoading(null);
      setOpenMenuId(null);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dashboard-bg font-hanken">
      {/* Top Header */}
      <header className="px-6 lg:px-10 pt-10 pb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-white text-contrast tracking-tight">Dashboard</h1>
          <p className="text-zinc-500 text-sm mt-1 font-medium">Benvenuto nel tuo centro di controllo premium</p>
        </div>
        <div className="flex items-center gap-3 lg:gap-5 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Cerca prodotti..." 
              className="w-full sm:w-64 pl-10 pr-4 py-2.5 premium-glass rounded-2xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent-primary/30 transition-all"
            />
          </div>
          <button className="p-3 premium-glass rounded-2xl text-zinc-400 hover:text-white transition-all shadow-lg hover:border-white/20">
            <Bell className="w-5 h-5" />
          </button>
          <button 
            onClick={() => setShowSelector(true)}
            className="glow-btn px-6 lg:px-8 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 text-white premium-glass"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">New Product</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 lg:px-10 py-4 space-y-10 custom-scrollbar pb-12">
        {/* View Mode Tabs */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode("overview")}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              viewMode === "overview"
                ? "bg-accent-primary text-white shadow-lg shadow-accent-primary/20"
                : "premium-glass text-zinc-400 hover:text-white"
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5 inline mr-1.5" />
            Overview
          </button>
          <button
            onClick={() => setViewMode("funnel")}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
              viewMode === "funnel"
                ? "bg-accent-primary text-white shadow-lg shadow-accent-primary/20"
                : "premium-glass text-zinc-400 hover:text-white"
            }`}
          >
            <Filter className="w-3.5 h-3.5 inline mr-1.5" />
            Funnel Analysis
          </button>
        </div>

        {viewMode === "overview" ? (
        <>
        {/* Stats Summary Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          <StatCard 
            label="Digital Products" 
            value={data.products.length} 
            subtitle="Count by Category"
            icon={<Package className="w-5 h-5 text-accent-primary" />}
            chartColor="text-accent-primary/60"
          />
          <StatCard 
            label="Published" 
            value={data.stats.activeFunnels} 
            subtitle="Active Funnels"
            icon={<CheckCircle className="w-5 h-5 text-accent-tertiary" />}
            chartColor="text-accent-tertiary/60"
          />
          <StatCard 
            label="Languages" 
            value={Array.from(new Set(data.products.flatMap(p => p.locales))).length || 0} 
            subtitle="Localized Versions"
            icon={<Globe className="w-5 h-5 text-accent-secondary" />}
            chartColor="text-accent-secondary/60"
          />
          <StatCard 
            label="Revenue" 
            value={`€${data.stats.totalRevenue.toLocaleString()}`} 
            subtitle="Gross Revenue YTD"
            icon={<Euro className="w-5 h-5 text-accent-primary" />}
            chartColor="text-accent-primary"
            isRevenue
          />
        </section>

        {/* Products Table Section */}
        <section className="premium-glass rounded-[2rem] lg:rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl">
          <div className="p-6 lg:p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight text-contrast">I Tuoi Prodotti</h2>
              <p className="text-zinc-500 text-xs mt-0.5 font-medium">Gestione e monitoraggio prestazioni</p>
            </div>
            <span className="text-zinc-400 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 bg-white/5 rounded-xl border border-white/5">{data.products.length} totali</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] bg-white/[0.01]">
                <tr>
                  <th className="px-8 py-5">Prodotto</th>
                  <th className="px-8 py-5">Languages</th>
                  <th className="px-8 py-5">Channels</th>
                  <th className="px-8 py-5">Performance</th>
                  <th className="px-8 py-5 text-right">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {data.products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-24 text-center">
                      <div className="flex flex-col items-center gap-4 opacity-30 group">
                        <div className="p-6 premium-glass rounded-full group-hover:scale-110 transition-transform duration-500">
                          <Package className="w-12 h-12 text-zinc-400" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-base font-bold text-white">Nessun prodotto trovato</p>
                          <p className="text-xs text-zinc-500 font-medium">Inizia creando il tuo primo prodotto digitale premium</p>
                        </div>
                        <button 
                          onClick={() => setShowSelector(true)}
                          className="mt-4 px-6 py-2 premium-glass rounded-xl text-xs font-bold text-accent-primary hover:text-white transition-colors"
                        >
                          Crea Ora
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.products.map((product) => (
                    <tr key={product.id} className="table-row-hover transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-5">
                          <div className="relative">
                            <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500 shadow-2xl overflow-hidden group-hover:border-accent-primary/30 transition-colors">
                              <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                              <Package className="w-7 h-7 relative z-10" />
                            </div>
                            <div className={`absolute -top-1.5 -right-1.5 px-2 py-0.5 text-[8px] font-black rounded-lg shadow-lg ${
                              product.status === 'published' ? 'bg-accent-tertiary text-black' : 'bg-zinc-700 text-zinc-300'
                            }`}>
                              {product.status === 'published' ? 'ONLINE' : 'DRAFT'}
                            </div>
                          </div>
                          <div>
                            <div className="text-base font-bold text-white text-contrast group-hover:text-accent-primary transition-colors">{product.title}</div>
                            <div className="text-[10px] text-zinc-500 flex items-center gap-2 mt-1 uppercase tracking-wider font-bold">
                              <span className="text-accent-secondary">/{product.slug}</span>
                              <span className="w-1 h-1 bg-zinc-800 rounded-full"></span>
                              <span>{product.template}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-wrap gap-2">
                          {product.locales.map(loc => (
                            <div key={loc} className="flex items-center gap-2 px-2.5 py-1 premium-glass rounded-lg text-[9px] font-black text-white uppercase border-white/5">
                              <span className="w-3 h-2 bg-accent-primary/40 rounded-[1px]"></span> {loc}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex gap-2">
                          <div className="w-8 h-8 premium-glass rounded-lg flex items-center justify-center text-red-500 border-white/5 hover:border-red-500/30 transition-colors cursor-pointer">
                            <Play className="w-3.5 h-3.5 fill-current" />
                          </div>
                          <div className="w-8 h-8 premium-glass rounded-lg flex items-center justify-center text-pink-500 border-white/5 hover:border-pink-500/30 transition-colors cursor-pointer">
                            <Camera className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-6">
                          <div>
                            <div className="text-base font-bold text-white tracking-tight">{product.conversion}</div>
                            <div className="text-[9px] text-zinc-500 font-black uppercase tracking-widest">Conversion</div>
                          </div>
                          <div className="flex flex-col items-center">
                            <div className="flex items-end gap-1 h-7">
                              <div className="w-1.5 bg-accent-primary/20 h-2 rounded-full"></div>
                              <div className="w-1.5 bg-accent-primary/40 h-4 rounded-full"></div>
                              <div className="w-1.5 bg-accent-primary h-6 rounded-full shadow-[0_0_8px_rgba(77,142,255,0.4)]"></div>
                              <div className="w-1.5 bg-accent-primary/30 h-3 rounded-full"></div>
                              <div className="w-1.5 bg-accent-primary/50 h-5 rounded-full"></div>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-5">
                          <div className="text-right">
                            <div className="text-lg font-bold text-white text-contrast">€{product.revenue.toLocaleString()}</div>
                            <div className="w-20 h-6 text-accent-primary opacity-40 mt-1">
                              <Sparkline />
                            </div>
                          </div>
                          <div className="relative">
                            <button 
                              onClick={() => setOpenMenuId(openMenuId === product.id ? null : product.id)}
                              className={`p-2 rounded-xl transition-all ${
                                openMenuId === product.id ? 'bg-white/10 text-white shadow-inner' : 'text-zinc-500 hover:text-white hover:bg-white/5'
                              }`}
                            >
                              <MoreVertical className="w-5 h-5" />
                            </button>
                            
                            {openMenuId === product.id && (
                              <>
                                <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
                                <div className="absolute right-0 mt-2 w-48 premium-glass rounded-2xl overflow-hidden z-20 shadow-2xl border border-white/10 py-2 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                                  <Link 
                                    href={`/${product.slug}`}
                                    target="_blank"
                                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
                                  >
                                    <ExternalLink className="w-4 h-4 text-accent-tertiary" /> Preview Page
                                  </Link>
                                  <Link 
                                    href={`/admin/products/${product.id}`}
                                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
                                  >
                                    <Edit className="w-4 h-4 text-accent-secondary" /> Edit Product
                                  </Link>
                                  <button 
                                    onClick={() => handleDuplicate(product.id)}
                                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
                                  >
                                    <Copy className="w-4 h-4 text-accent-primary" /> Duplicate
                                  </button>
                                  <button 
                                    onClick={() => handleStatusChange(product.id, product.status === "published" ? "archived" : "published")}
                                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
                                  >
                                    {product.status === "published" ? (
                                      <><Archive className="w-4 h-4 text-amber-400" /> Archive</>
                                    ) : (
                                      <><CheckCircle className="w-4 h-4 text-accent-tertiary" /> Publish</>
                                    )}
                                  </button>
                                  <div className="h-px bg-white/5 my-1 mx-4"></div>
                                  <button 
                                    onClick={() => handleDelete(product.id)}
                                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-red-400 hover:bg-red-500/10 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" /> Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Bottom Widgets Section */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-12">
          {/* YouTube Channel Card */}
          <div className="premium-glass p-8 lg:p-10 rounded-[2rem] lg:rounded-[2.5rem] relative overflow-hidden group">
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-red-600/5 rounded-full blur-[100px] group-hover:bg-red-600/10 transition-all duration-700" />
            
            <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] mb-8">Best Performing Traffic Source</h3>
            <div className="flex items-center gap-6 mb-10 relative">
              <div className="w-16 h-16 premium-glass bg-gradient-to-br from-red-600/20 to-red-800/20 rounded-3xl flex items-center justify-center text-white text-3xl shadow-[0_0_30px_rgba(220,38,38,0.15)] border border-red-500/20 group-hover:scale-105 transition-transform duration-500">
                <Play className="w-8 h-8 fill-red-500 text-red-500" />
              </div>
              <div>
                <div className="text-2xl font-black text-white text-contrast tracking-tight">Main YouTube Channel</div>
                <div className="text-sm text-zinc-500 font-medium mt-1">Growth Engine • {data.products.length} Products Linked</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-10 pt-8 border-t border-white/5 relative">
              <div>
                <div className="text-3xl font-black text-white text-contrast">{String(analytics?.ctr ?? "0")}%</div>
                <div className="text-[9px] text-zinc-500 mt-2 font-black uppercase tracking-[0.2em]">Click-Through Rate</div>
              </div>
              <div>
                <div className="text-3xl font-black text-white text-contrast">{String(analytics?.conversion ?? "0")}%</div>
                <div className="text-[9px] text-zinc-500 mt-2 font-black uppercase tracking-[0.2em]">Conv. Rate</div>
              </div>
            </div>
          </div>

          {/* Geographic Sales Heatmap */}
          <div className="premium-glass p-8 lg:p-10 rounded-[2rem] lg:rounded-[2.5rem] relative overflow-hidden group">
            <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-accent-primary/5 rounded-full blur-[100px] group-hover:bg-accent-primary/10 transition-all duration-700" />
            
            <h3 className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em] mb-8">Geographic Distribution</h3>
            <div className="flex items-center justify-center h-52 relative">
              <svg className="w-full h-full text-zinc-800 fill-current opacity-40 group-hover:opacity-60 transition-opacity duration-700" viewBox="0 0 200 100">
                <path d="M20,30 Q30,20 50,25 T80,35 T110,20 T150,30 T180,45 T170,70 T130,80 T90,75 T40,85 T15,60 Z"></path>
                <circle className="text-accent-primary animate-pulse" cx="50" cy="40" r="2.5"></circle>
                <circle className="text-accent-tertiary" cx="100" cy="50" r="3.5"></circle>
                <circle className="text-accent-secondary" cx="140" cy="45" r="2"></circle>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <Globe className="w-12 h-12 text-white/5 mx-auto mb-2" />
                  <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Global Data Sync</p>
                </div>
              </div>
            </div>
            <TrendingUp className="absolute bottom-8 right-8 w-12 h-12 text-white/5 group-hover:text-accent-primary/10 transition-colors" />
          </div>
        </section>
        </>
        ) : (
        <FunnelVisualization />
        )}
      </div>

      {showSelector && (
        <TemplateSelector onSelect={handleCreateProduct} onClose={() => setShowSelector(false)} />
      )}
    </div>
  );
}

function StatCard({ 
  label, 
  value, 
  subtitle, 
  icon, 
  chartColor, 
  isRevenue = false 
}: { 
  label: string; 
  value: string | number; 
  subtitle: string;
  icon: React.ReactNode;
  chartColor: string;
  isRevenue?: boolean;
}) {
  return (
    <div className={`premium-glass p-7 rounded-[2rem] group hover:border-white/20 transition-all duration-500 relative overflow-hidden ${isRevenue ? 'ring-1 ring-accent-primary/20 bg-gradient-to-br from-accent-primary/5 to-transparent' : ''}`}>
      <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-all duration-700" />
      
      <div className="flex justify-between items-start relative z-10">
        <span className="text-zinc-500 text-[10px] font-black tracking-[0.2em] uppercase">{label}</span>
        <div className="p-2.5 premium-glass rounded-xl border border-white/5 group-hover:scale-110 transition-transform duration-500 shadow-lg">
          {icon}
        </div>
      </div>
      <div className="flex items-end justify-between mt-8 relative z-10">
        <div>
          <div className="text-3xl lg:text-4xl font-black text-white text-contrast tracking-tight">{value}</div>
          <div className="text-[10px] text-zinc-500 mt-2 font-bold uppercase tracking-widest">{subtitle}</div>
        </div>
        <div className={`w-20 h-10 ${chartColor} opacity-40 group-hover:opacity-100 transition-opacity duration-700`}>
          <Sparkline />
        </div>
      </div>
    </div>
  );
}

function Sparkline() {
  return (
    <svg className="w-full h-full" viewBox="0 0 64 24" preserveAspectRatio="none">
      <path 
        d="M0 20 L10 12 L20 18 L30 8 L40 14 L50 4 L64 10" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="3" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
    </svg>
  );
}
