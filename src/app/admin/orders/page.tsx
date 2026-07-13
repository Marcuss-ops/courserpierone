"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Euro,
  ShoppingCart,
  Clock,
  RotateCcw,
  Search,
  Loader2,
  User,
  Package,
  Calendar,
  CreditCard,
} from "lucide-react";

interface Order {
  id: string;
  userId: string;
  productId: string;
  paymentProvider: string;
  amount: number;
  currency: string;
  locale: string | null;
  status: string;
  createdAt: string;
  user: { id: string; email: string; name: string | null };
  product: { id: string; slug: string; price: number; currency: string };
}

interface Summary {
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  refundedOrders: number;
  totalRevenue: number;
}

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function fetchOrders() {
    try {
      const res = await fetch("/api/admin/orders");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setOrders(data.orders);
      setSummary(data.summary);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchOrders(); // eslint-disable-line react-hooks/set-state-in-effect -- TODO: refactor (FASE 1.10)
     
  }, []);

  const filteredOrders = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.user.email.toLowerCase().includes(q) ||
      o.user.name?.toLowerCase().includes(q) ||
      o.product.slug.toLowerCase().includes(q) ||
      o.id.toLowerCase().includes(q) ||
      o.status.toLowerCase().includes(q)
    );
  });

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatAmount(amount: number, currency: string) {
    const symbol = currency === "eur" ? "€" : currency === "usd" ? "$" : currency;
    return `${symbol}${(amount / 100).toFixed(2)}`;
  }

  const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
    completed: { label: "Completato", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
    pending: { label: "In attesa", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
    refunded: { label: "Rimborsato", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <div className="px-6 lg:px-10 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/admin")} className="p-2 text-zinc-400 hover:text-white transition">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Ordini</h1>
            <p className="text-zinc-500 text-sm mt-1 font-medium">
              {summary ? `${summary.totalOrders} ordini totali` : "Caricamento..."}
            </p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca ordini..."
            className="w-64 pl-10 pr-4 py-2.5 premium-glass rounded-2xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent-primary/30 transition-all"
          />
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="premium-glass p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 premium-glass rounded-xl border border-white/5">
                <ShoppingCart className="w-4 h-4 text-accent-primary" />
              </div>
              <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Completati</span>
            </div>
            <div className="text-2xl font-black text-white">{summary.completedOrders}</div>
            <div className="text-[10px] text-zinc-600 mt-1">{summary.pendingOrders} in attesa</div>
          </div>
          <div className="premium-glass p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 premium-glass rounded-xl border border-white/5">
                <Euro className="w-4 h-4 text-green-400" />
              </div>
              <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Ricavi Totali</span>
            </div>
            <div className="text-2xl font-black text-white">
              {formatAmount(summary.totalRevenue, "eur")}
            </div>
            <div className="text-[10px] text-zinc-600 mt-1">Tutti i pagamenti completati</div>
          </div>
          <div className="premium-glass p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 premium-glass rounded-xl border border-white/5">
                <Clock className="w-4 h-4 text-yellow-400" />
              </div>
              <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">In Attesa</span>
            </div>
            <div className="text-2xl font-black text-white">{summary.pendingOrders}</div>
            <div className="text-[10px] text-zinc-600 mt-1">Da verificare</div>
          </div>
          <div className="premium-glass p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 premium-glass rounded-xl border border-white/5">
                <RotateCcw className="w-4 h-4 text-red-400" />
              </div>
              <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Rimborsati</span>
            </div>
            <div className="text-2xl font-black text-white">{summary.refundedOrders}</div>
            <div className="text-[10px] text-zinc-600 mt-1">Totale:</div>
          </div>
        </section>
      )}

      {/* Orders Table */}
      <section className="premium-glass rounded-[2rem] overflow-hidden border border-white/5">
        <div className="p-6 lg:p-8 border-b border-white/5">
          <h2 className="text-xl font-bold text-white tracking-tight">Tutti gli Ordini</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] bg-white/[0.01]">
              <tr>
                <th className="px-8 py-5">Cliente</th>
                <th className="px-8 py-5">Prodotto</th>
                <th className="px-8 py-5">Importo</th>
                <th className="px-8 py-5">Pagamento</th>
                <th className="px-8 py-5">Stato</th>
                <th className="px-8 py-5">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-24 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-30">
                      <div className="p-6 premium-glass rounded-full">
                        <ShoppingCart className="w-12 h-12 text-zinc-400" />
                      </div>
                      <p className="text-base font-bold text-white">Nessun ordine trovato</p>
                      <p className="text-xs text-zinc-500 font-medium">
                        {search ? "Nessun risultato per la ricerca" : "Non ci sono ancora ordini"}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const status = statusConfig[order.status] ?? { label: order.status, color: "text-zinc-400", bg: "bg-zinc-500/10 border-zinc-500/20" };
                  return (
                    <tr key={order.id} className="table-row-hover transition-colors group">
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                            <User className="w-4 h-4 text-zinc-400" />
                          </div>
                          <div>
                            <div className="text-sm font-bold text-white">{order.user.name ?? "—"}</div>
                            <div className="text-[10px] text-zinc-500">{order.user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-zinc-500" />
                          <span className="text-sm font-medium text-zinc-300">/{order.product.slug}</span>
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className="text-sm font-bold text-white">{formatAmount(order.amount, order.currency)}</span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2">
                          <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-xs text-zinc-400 capitalize">{order.paymentProvider}</span>
                          {order.locale && (
                            <span className="text-[9px] text-zinc-600 uppercase font-bold">{order.locale}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-8 py-5">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold ${status.color} ${status.bg} border`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                          <span className="text-xs text-zinc-400">{formatDate(order.createdAt)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
