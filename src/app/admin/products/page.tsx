"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Package, Plus, Search, Filter, Edit, Eye, ChevronDown, Globe, Calendar, Loader2 } from "lucide-react";
import type { ProductApiItem } from "@/lib/api-types";

export default function ProductsPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json() as Promise<ProductApiItem[]>)
      .then((data) => {
        if (Array.isArray(data)) {
          setProducts(data.map((p) => ({
            id: p.id,
            slug: p.slug,
            title: p.slug,
            template: p.templateId || "lumio",
            status: p.status || "draft",
            locales: p.locales || [],
            sales: 0,
            revenue: 0,
            conversion: "0%",
          })));
        }
      })
      .catch(() => {
          // ignore fetch error
        })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-dashboard-bg font-hanken">
      <header className="px-10 pt-10 pb-6 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-4xl font-bold text-white text-contrast tracking-tight">Prodotti Digitali</h1>
          <p className="text-zinc-500 text-sm mt-1 font-medium">Gestione centralizzata dei tuoi asset multilingua</p>
        </div>
        <Link
          href="/admin/products/new"
          className="glow-btn px-8 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 text-white premium-glass"
        >
          <Plus className="w-4 h-4" />
          Nuovo Prodotto
        </Link>
      </header>

      <div className="flex-1 overflow-y-auto px-10 py-4 space-y-8 custom-scrollbar pb-12">
        {/* Filters and Search */}
        <div className="flex flex-col sm:flex-row gap-6 items-center justify-between">
          <div className="relative w-full sm:w-96 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 group-focus-within:text-accent-primary transition-colors" />
            <input 
              type="text" 
              placeholder="Cerca tra i tuoi prodotti..." 
              className="w-full pl-12 pr-4 py-3 premium-glass rounded-2xl text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-accent-primary/30 transition-all shadow-lg"
            />
          </div>
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 premium-glass rounded-2xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all border border-white/5">
              <Filter className="w-3.5 h-3.5" />
              Filtra
            </button>
            <button className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 premium-glass rounded-2xl text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white transition-all border border-white/5">
              Status <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Products Grid/Table */}
        <section className="premium-glass rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] bg-white/[0.01]">
                <tr>
                  <th className="px-8 py-6">Identità Prodotto</th>
                  <th className="px-8 py-6">Slug/URL</th>
                  <th className="px-8 py-6">Stato</th>
                  <th className="px-8 py-6">Localizzazione</th>
                  <th className="px-8 py-6 text-right">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <Loader2 className="w-10 h-10 animate-spin text-accent-primary" />
                        <span className="text-sm font-bold text-zinc-500">Caricamento prodotti...</span>
                      </div>
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-8 py-20 text-center opacity-30">
                      <div className="flex flex-col items-center gap-4">
                        <Package className="w-12 h-12" />
                        <span className="text-sm font-bold">Nessun prodotto configurato</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr key={product.id} className="table-row-hover transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-5">
                          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-zinc-500 shadow-2xl relative group-hover:border-accent-primary/40 transition-colors">
                            <Package className="w-7 h-7" />
                          </div>
                          <div>
                            <div className="text-base font-bold text-white text-contrast group-hover:text-accent-primary transition-colors">{product.title}</div>
                            <div className="flex items-center gap-2 mt-1">
                               <Calendar className="w-3 h-3 text-zinc-600" />
                               <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Creato: Giu 2026</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2">
                           <Globe className="w-3.5 h-3.5 text-zinc-600" />
                           <span className="text-xs text-zinc-400 font-mono">/{product.slug}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-3 py-1 text-[9px] font-black rounded-lg uppercase tracking-widest shadow-lg ${
                          product.status === 'published' 
                            ? 'bg-accent-tertiary text-black' 
                            : 'bg-zinc-700 text-zinc-300'
                        }`}>
                          {product.status === 'published' ? 'Online' : 'Draft'}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex gap-2">
                          {product.locales.map((loc: string) => (
                            <span key={loc} className="px-2 py-1 bg-white/5 rounded-md text-[9px] font-black text-zinc-400 border border-white/5 uppercase">
                              {loc}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link 
                            href={`/admin/products/${product.id}`}
                            className="p-3 premium-glass rounded-xl text-zinc-400 hover:text-accent-secondary border border-white/5 transition-all hover:scale-105"
                            title="Modifica contenuti"
                          >
                            <Edit className="w-4 h-4" />
                          </Link>
                          <a 
                            href={`/${product.slug}`}
                            target="_blank"
                            className="p-3 premium-glass rounded-xl text-zinc-400 hover:text-accent-tertiary border border-white/5 transition-all hover:scale-105"
                            title="Vedi anteprima"
                          >
                            <Eye className="w-4 h-4" />
                          </a>
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
    </div>
  );
}
