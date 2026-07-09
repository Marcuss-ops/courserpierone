import Link from "next/link";
import { Play, ArrowRight, Sparkles } from "lucide-react";

interface WelcomeBannerProps {
  name: string | null;
  courseCount: number;
  hasOrders: boolean;
  resumeHref?: string;
  resumeLabel?: string;
}

export function WelcomeBanner({ name, courseCount, hasOrders, resumeHref, resumeLabel }: WelcomeBannerProps) {
  const firstName = (name ?? "Studente").split(" ")[0] ?? "Studente";

  return (
    <section className="relative overflow-hidden rounded-[32px] border border-cream-border bg-gradient-to-br from-[#FFFDF9] via-[#FFF9F0] to-[#FFF5E6] p-8 lg:p-12 shadow-sm">
      <div
        className="absolute -top-32 -right-32 w-[400px] h-[400px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(255, 200, 130, 0.35) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
        aria-hidden
      />
      <div
        className="absolute -bottom-40 -left-40 w-[300px] h-[300px] rounded-full pointer-events-none"
        style={{
          background: "radial-gradient(circle, rgba(200, 170, 255, 0.18) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
        aria-hidden
      />

      <div className="relative flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
        <div className="space-y-4 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-cream-card/80 backdrop-blur border border-cream-border rounded-full">
            <Sparkles className="w-3 h-3 text-cream-gold" />
            <span className="text-[10px] font-semibold text-cream-gold uppercase tracking-widest">
              Bentornato
            </span>
          </div>
          <h1 className="font-serif text-4xl lg:text-6xl text-cream-text leading-[0.95] tracking-[-0.02em]">
            Bentornato,
            <br />
            <span className="italic text-cream-espresso">{firstName}</span>
          </h1>
          <p className="text-cream-text-soft text-base lg:text-lg font-light leading-relaxed max-w-md">
            {hasOrders
              ? `Hai ${courseCount} ${courseCount === 1 ? "corso attivo" : "corsi attivi"}. Riprendi da dove hai lasciato.`
              : "Esplora il catalogo e inizia il tuo primo percorso di apprendimento."}
          </p>
        </div>

        {resumeHref && (
          <Link
            href={resumeHref}
            className="group inline-flex items-center gap-3 bg-cream-espresso text-white px-7 py-4 rounded-2xl text-sm font-semibold shadow-lg shadow-[#2A1800]/10 hover:shadow-xl hover:shadow-[#2A1800]/20 hover:-translate-y-0.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-gold focus-visible:ring-offset-2 focus-visible:ring-offset-[#FFFDF9]"
          >
            <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center group-hover:bg-white/25 transition-colors">
              <Play className="w-4 h-4 fill-white" />
            </span>
            <span className="line-clamp-1">{resumeLabel ?? "Riprendi da dove hai lasciato"}</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        )}
      </div>
    </section>
  );
}
