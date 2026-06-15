"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Loader2, ArrowLeft } from "lucide-react";

interface AccessGateProps {
  children: React.ReactNode;
  productSlug: string;
  token?: string;
}

export function AccessGate({ children, productSlug, token }: AccessGateProps) {
  const router = useRouter();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkAccess() {
      try {
        const params = new URLSearchParams(window.location.search);
        const urlToken = params.get("token");
        const urlOrderId = params.get("order_id") || params.get("orderId");

        // If not in URL, load from localStorage
        if (!urlToken && !urlOrderId) {
          const storedToken = localStorage.getItem(`access-token-${productSlug}`);
          const storedOrderId = localStorage.getItem(`access-order-${productSlug}`);
          if (storedToken) params.set("token", storedToken);
          if (storedOrderId) params.set("order_id", storedOrderId);
        }

        params.set("productId", productSlug);

        const res = await fetch(`/api/access?${params.toString()}`);
        const data = await res.json();
        
        if (data.hasAccess) {
          setHasAccess(true);
          // Persist if loaded from URL
          if (urlToken) {
            localStorage.setItem(`access-token-${productSlug}`, urlToken);
          }
          if (urlOrderId) {
            localStorage.setItem(`access-order-${productSlug}`, urlOrderId);
          }
        } else {
          setHasAccess(false);
        }
      } catch (e) {
        console.warn("[AccessGate] Failed to check access:", e);
        setHasAccess(false);
      } finally {
        setChecking(false);
      }
    }
    void checkAccess();
  }, [productSlug]);

  if (checking) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#050505]">
        <div className="premium-glass p-12 rounded-[2rem] text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-accent-primary mx-auto" />
          <p className="text-zinc-400 text-sm font-medium">Verifica accesso in corso...</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#050505]">
        <div className="premium-glass p-12 lg:p-16 rounded-[2rem] text-center space-y-6 max-w-md mx-4 border border-white/10">
          <div className="w-20 h-20 premium-glass rounded-full flex items-center justify-center mx-auto border border-white/10">
            <Lock className="w-10 h-10 text-zinc-400" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white text-contrast">Accesso Riservato</h2>
            <p className="text-zinc-500 text-sm font-medium">
              Devi aver acquistato il corso per accedere a questa pagina.
            </p>
          </div>
          <div className="flex flex-col gap-3 pt-4">
            <a
              href={`/${productSlug}`}
              className="glow-btn px-8 py-4 rounded-2xl text-sm font-bold text-white premium-glass"
            >
              Acquista Ora
            </a>
            <button
              onClick={() => router.push("/login")}
              className="px-8 py-4 premium-glass rounded-2xl text-sm font-bold text-zinc-300 hover:text-white transition border border-white/5"
            >
              <span className="flex items-center justify-center gap-2">
                <ArrowLeft className="w-4 h-4" /> Hai già acquistato? Accedi
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
