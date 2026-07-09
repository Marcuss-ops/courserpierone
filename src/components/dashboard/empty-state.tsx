import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";

export function DashboardEmptyState() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-cream-dark-bg via-cream-dark-surface to-[#2A1F15] border border-cream-dark-border rounded-[32px] p-12 lg:p-16 text-center shadow-lg shadow-black/30">
      <div
        className="absolute -top-20 -right-20 w-[360px] h-[360px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(255, 140, 66, 0.30) 0%, transparent 65%)",
          filter: "blur(80px)",
        }}
        aria-hidden
      />
      <div className="relative max-w-md mx-auto space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-cream-dark-surface border border-cream-dark-border flex items-center justify-center mx-auto shadow-md">
          <BookOpen className="w-9 h-9 text-cream-dark-gold" />
        </div>
        <div className="space-y-2">
          <h3 className="font-serif text-3xl text-cream-dark-text">Nessun corso ancora</h3>
          <p className="text-cream-dark-text-soft text-sm font-light leading-relaxed">
            Non hai ancora acquistato nessun corso. Esplora il catalogo e inizia il tuo percorso di apprendimento.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-cream-dark-orange text-white px-6 py-3.5 rounded-xl text-sm font-semibold shadow-lg shadow-[#FF8C42]/20 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-dark-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream-dark-bg"
        >
          Scopri i Corsi <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
