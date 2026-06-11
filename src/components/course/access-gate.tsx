"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Lock, Play, ArrowRight, Eye, ShieldAlert, Sparkles } from "lucide-react";

interface AccessGateProps {
  productSlug: string;
  courseTitle: string;
  children: React.ReactNode;
}

export function AccessGate({ productSlug, courseTitle, children }: AccessGateProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  // Extract locale from pathname (e.g., "/en/amish-secrets/portal" → "en")
  const locale = pathname.split("/")[1] || "en";
  const token = searchParams.get("token") ?? undefined;

  useEffect(() => {
    async function checkAccess() {
      try {
        const params = new URLSearchParams({ productId: productSlug });
        if (token) params.set("token", token);
        const res = await fetch(`/api/access?${params.toString()}`);
        const data = await res.json();
        setHasAccess(data.hasAccess);
      } catch (e) {
        console.warn("[AccessGate] Access check failed:", e);
        setHasAccess(false);
      } finally {
        setLoading(false);
      }
    }
    void checkAccess();
  }, [productSlug, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-2 border-t-accent-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
          <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Verifica accesso...</p>
        </div>
      </div>
    );
  }

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#e5e2e1] font-hanken flex items-center justify-center p-6 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-accent-primary/10 rounded-full blur-[120px] -z-10" />
      <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] bg-accent-secondary/10 rounded-full blur-[120px] -z-10" />

      <div className="max-w-xl w-full premium-glass border border-white/10 p-10 md:p-16 rounded-[2.5rem] text-center space-y-8 relative shadow-2xl">
        {/* Animated Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 premium-glass rounded-full border border-white/5 mx-auto">
          <Sparkles className="w-3.5 h-3.5 text-accent-tertiary animate-pulse" />
          <span className="text-[10px] font-black text-accent-tertiary uppercase tracking-widest">
            Area Riservata
          </span>
        </div>

        {/* Lock Icon */}
        <div className="w-24 h-24 mx-auto premium-glass rounded-full flex items-center justify-center border border-white/10 shadow-2xl relative group">
          <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-accent-primary/20 to-accent-secondary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <Lock className="w-10 h-10 text-accent-primary relative z-10" />
        </div>

        {/* Content */}
        <div className="space-y-3">
          <h2 className="text-3xl font-black text-white text-contrast tracking-tight">
            Contenuto Premium
          </h2>
          <p className="text-zinc-400 text-sm md:text-base leading-relaxed font-medium max-w-md mx-auto">
            Per accedere a <strong className="text-white">"{courseTitle}"</strong> è necessario aver acquistato il corso. Completa l'acquisto ora per sbloccare tutte le lezioni, PDF e appunti.
          </p>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <a
            href={`/${locale}/${productSlug}`}
            className="glow-btn px-8 py-4 rounded-2xl text-sm font-black text-white premium-glass flex items-center gap-2 group w-full sm:w-auto justify-center"
          >
            <Play className="w-4 h-4 fill-current" />
            Acquista Ora
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </a>
          <button
            onClick={() => router.push(`/${locale}/login?productId=${productSlug}`)}
            className="px-8 py-4 premium-glass rounded-2xl text-sm font-black text-zinc-300 hover:text-white transition-all border border-white/5 flex items-center gap-2 w-full sm:w-auto justify-center"
          >
            <Eye className="w-4 h-4" />
            Ho già acquistato
          </button>
        </div>

        {/* Footer info */}
        <div className="pt-4 border-t border-white/5 flex items-center justify-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
          <ShieldAlert className="w-3.5 h-3.5 text-zinc-600" />
          Transazione Sicura crittografata a 256-bit
        </div>
      </div>
    </div>
  );
}
