"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Mail, ArrowRight, Loader2, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#050505] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const productId = searchParams.get("productId");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [magicUrl, setMagicUrl] = useState("");
  const [error, setError] = useState("");

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSending(true);
    setError("");

    try {
      // Detect locale on the client side
      const detectedLocale = 
        searchParams.get("lang") || 
        searchParams.get("locale") || 
        (typeof window !== "undefined" ? document.cookie.split("; ").find(row => row.startsWith("locale="))?.split("=")[1] : "") || 
        (typeof navigator !== "undefined" ? navigator.language.split("-")[0] : "en");

      const res = await fetch("/api/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          productId: productId || undefined,
          locale: detectedLocale,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSent(true);
        setMagicUrl(data.magicUrl ?? "");
      } else {
        setError(data.error ?? "Errore nell'invio del magic link");
      }
    } catch {
      setError("Errore di connessione");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#e5e2e1] font-hanken flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="w-12 h-12 premium-glass rounded-2xl flex items-center justify-center font-bold text-2xl border border-white/10 text-white shadow-lg">C</div>
            <span className="text-3xl font-black tracking-tighter text-white uppercase">Courser.</span>
          </Link>
        </div>

        <div className="premium-glass p-10 rounded-[2rem] border border-white/10 shadow-2xl">
          {!sent ? (
            <>
              <div className="text-center mb-8">
                <h1 className="text-2xl font-black text-white text-contrast tracking-tight">Accedi</h1>
                <p className="text-zinc-500 text-sm mt-2 font-medium">
                  {productId ? "Hai già acquistato? Accedi per vedere il corso." : "Inserisci la tua email per ricevere il link magico"}
                </p>
              </div>

              <form onSubmit={handleMagicLink} className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-2">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@email.com"
                      className="w-full pl-12 pr-4 py-3.5 premium-glass rounded-2xl text-sm text-white placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-accent-primary/30 transition-all"
                      required
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-red-400 text-xs font-medium">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={sending || !email.trim()}
                  className="glow-btn w-full py-4 rounded-2xl text-sm font-bold text-white premium-glass flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      Invia Magic Link <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/5" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-[#050505] px-4 text-zinc-600 font-bold uppercase tracking-widest">oppure</span>
                </div>
              </div>

              <a
                href={`/api/auth/signin/google${productId ? `?callbackUrl=/${productId}` : ""}`}
                className="w-full py-3.5 premium-glass rounded-2xl text-sm font-bold text-zinc-300 hover:text-white transition flex items-center justify-center gap-3 border border-white/5"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continua con Google
              </a>

              <p className="mt-8 text-center text-[10px] text-zinc-600 font-medium">
                Non hai ancora acquistato?{" "}
                <Link href={productId ? `/${productId}` : "/"} className="text-accent-primary hover:underline">
                  Scopri i nostri corsi
                </Link>
              </p>
            </>
          ) : (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 premium-glass rounded-full flex items-center justify-center mx-auto border border-accent-tertiary/30">
                <CheckCircle2 className="w-8 h-8 text-accent-tertiary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-black text-white text-contrast">Link Inviato!</h2>
                <p className="text-zinc-500 text-sm font-medium">
                  Controlla la tua casella email <strong className="text-white">{email}</strong>
                </p>
              </div>

              {magicUrl && (
                <div className="premium-glass p-6 rounded-2xl border border-white/5 space-y-3">
                  <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                    Magic Link (Modalità Sviluppo)
                  </p>
                  <a
                    href={magicUrl}
                    className="block text-xs text-accent-primary break-all hover:underline font-medium"
                  >
                    {magicUrl}
                  </a>
                </div>
              )}

              <button
                onClick={() => { setSent(false); setEmail(""); }}
                className="text-sm text-zinc-500 hover:text-white transition font-medium"
              >
                Invia di nuovo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
