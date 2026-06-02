"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  User,
  Mail,
  ShoppingCart,
  Euro,
  Calendar,
  Loader2,
  Search,
  Package,
  ShieldCheck,
} from "lucide-react";

interface UserData {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  role: string;
  createdAt: string;
  orderCount: number;
  totalSpent: number;
  lastOrder: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    productSlug: string;
    createdAt: string;
  } | null;
}

interface Summary {
  totalUsers: number;
  totalOrders: number;
  totalRevenue: number;
  usersWithPurchases: number;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  async function fetchUsers() {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setUsers(data.users);
      setSummary(data.summary);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchUsers();
     
  }, []);

  const filteredUsers = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      u.name?.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  function formatAmount(amount: number, currency: string) {
    const symbol = currency === "eur" ? "€" : currency === "usd" ? "$" : currency;
    return `${symbol}${(amount / 100).toFixed(2)}`;
  }

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
            <h1 className="text-3xl font-bold text-white tracking-tight">Clienti</h1>
            <p className="text-zinc-500 text-sm mt-1 font-medium">
              {summary ? `${summary.totalUsers} utenti registrati` : "Caricamento..."}
            </p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca utenti..."
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
                <User className="w-4 h-4 text-accent-primary" />
              </div>
              <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Utenti Totali</span>
            </div>
            <div className="text-2xl font-black text-white">{summary.totalUsers}</div>
            <div className="text-[10px] text-zinc-600 mt-1">{summary.usersWithPurchases} con acquisti</div>
          </div>
          <div className="premium-glass p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 premium-glass rounded-xl border border-white/5">
                <ShoppingCart className="w-4 h-4 text-accent-secondary" />
              </div>
              <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Ordini Totali</span>
            </div>
            <div className="text-2xl font-black text-white">{summary.totalOrders}</div>
            <div className="text-[10px] text-zinc-600 mt-1">Tutti gli ordini</div>
          </div>
          <div className="premium-glass p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 premium-glass rounded-xl border border-white/5">
                <Euro className="w-4 h-4 text-green-400" />
              </div>
              <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Ricavi Totali</span>
            </div>
            <div className="text-2xl font-black text-white">{formatAmount(summary.totalRevenue, "eur")}</div>
            <div className="text-[10px] text-zinc-600 mt-1">Da tutti gli ordini completati</div>
          </div>
          <div className="premium-glass p-6 rounded-2xl border border-white/5">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2.5 premium-glass rounded-xl border border-white/5">
                <ShieldCheck className="w-4 h-4 text-accent-tertiary" />
              </div>
              <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Amministratori</span>
            </div>
            <div className="text-2xl font-black text-white">{users.filter(u => u.role === "admin").length}</div>
            <div className="text-[10px] text-zinc-600 mt-1">Con accesso admin</div>
          </div>
        </section>
      )}

      {/* Users Table */}
      <section className="premium-glass rounded-[2rem] overflow-hidden border border-white/5">
        <div className="p-6 lg:p-8 border-b border-white/5">
          <h2 className="text-xl font-bold text-white tracking-tight">Tutti gli Utenti</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] bg-white/[0.01]">
              <tr>
                <th className="px-8 py-5">Utente</th>
                <th className="px-8 py-5">Email</th>
                <th className="px-8 py-5">Ruolo</th>
                <th className="px-8 py-5">Ordini</th>
                <th className="px-8 py-5">Totale Speso</th>
                <th className="px-8 py-5">Ultimo Ordine</th>
                <th className="px-8 py-5">Registrato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-8 py-24 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-30">
                      <div className="p-6 premium-glass rounded-full">
                        <User className="w-12 h-12 text-zinc-400" />
                      </div>
                      <p className="text-base font-bold text-white">Nessun utente trovato</p>
                      <p className="text-xs text-zinc-500 font-medium">
                        {search ? "Nessun risultato per la ricerca" : "Non ci sono ancora utenti"}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="table-row-hover transition-colors group">
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden">
                          {user.image ? (
                            <img src={user.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                        <span className="text-sm font-bold text-white">{user.name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-xs text-zinc-400">{user.email}</span>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span                      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                        user.role === "admin"
                          ? "text-accent-primary bg-accent-primary/10 border border-accent-primary/20"
                          : "text-zinc-400 bg-zinc-500/10 border border-zinc-500/20"
                      }`}>
                        {user.role === "admin" ? "Admin" : "Student"}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-bold text-white">{user.orderCount}</span>
                    </td>
                    <td className="px-8 py-5">
                      <span className="text-sm font-bold text-white">
                        {user.totalSpent > 0 ? formatAmount(user.totalSpent, "eur") : "—"}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                      {user.lastOrder ? (
                        <div className="flex items-center gap-2">
                          <Package className="w-3.5 h-3.5 text-zinc-500" />
                          <div>
                            <span className="text-[10px] text-zinc-400 font-medium">/{user.lastOrder.productSlug}</span>
                            <span className={`ml-2 text-[9px] ${
                              user.lastOrder.status === "completed" ? "text-green-400" : "text-yellow-400"
                            }`}>
                              {user.lastOrder.status}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                        <span className="text-xs text-zinc-400">{formatDate(user.createdAt)}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
