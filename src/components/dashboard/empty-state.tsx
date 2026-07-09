import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";

export function DashboardEmptyState() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#FFFDF9] via-[#FFF9F0] to-[#FFF5E6] border border-cream-border rounded-[32px] p-12 lg:p-16 text-center">
      <div
        className="absolute -top-20 -right-20 w-[300px] h-[300px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(255, 200, 130, 0.3) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
        aria-hidden
      />
      <div className="relative max-w-md mx-auto space-y-6">
        <div className="w-20 h-20 rounded-3xl bg-cream-card border border-cream-border flex items-center justify-center mx-auto shadow-sm">
          <BookOpen className="w-9 h-9 text-cream-gold" />
        </div>
        <div className="space-y-2">
          <h3 className="font-serif text-3xl text-cream-text">Nessun corso ancora</h3>
          <p className="text-cream-text-soft text-sm font-light leading-relaxed">
            Non hai ancora acquistato nessun corso. Esplora il catalogo e inizia il tuo percorso di apprendimento.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-cream-espresso text-white px-6 py-3.5 rounded-xl text-sm font-semibold shadow-lg shadow-[#2A1800]/10 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-gold focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFFDF9]"
        >
          Scopri i Corsi <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
