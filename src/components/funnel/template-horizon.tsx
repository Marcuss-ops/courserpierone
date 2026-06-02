"use client";

// ─── TEMPLATE HORIZON: Airy Minimalism + Glassmorphism ───
// Chiaro, caldo, Plus Jakarta Sans, gradienti atmosferici, cursor glow

import { useRef, useState } from "react";

interface HorizonProps {
  data: {
    titolo?: string;
    sottotitolo?: string;
    problema?: string;
    storia?: string;
    recensioni?: string;
    cta?: string;
    prezzo?: string;
    coverUrl?: string;
    lezioni?: { titolo: string; descrizione: string }[];
  };
  locale?: string;
}

export default function TemplateHorizon({ data, locale: _locale = "it" }: HorizonProps) {
  const ctaRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (ctaRef.current) {
      const rect = ctaRef.current.getBoundingClientRect();
      setMousePos({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#ffffff" }}>
      {/* ── FLOATING NAV ──────────────────────────────────── */}
      <nav className="fixed left-1/2 top-4 z-50 -translate-x-1/2">
        <div
          className="flex items-center gap-8 rounded-2xl px-6 py-3"
          style={{
            background: "rgba(255,255,255,0.4)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.6)",
            boxShadow: "0 4px 30px rgba(0,0,0,0.06)",
          }}
        >
          <span className="text-sm font-bold" style={{ color: "#1d1c15" }}>Brand</span>
          <div className="hidden items-center gap-6 text-sm md:flex" style={{ color: "#555555" }}>
            <a href="#features" className="hover:text-black transition">Features</a>
            <a href="#pricing" className="hover:text-black transition">Pricing</a>
            <a href="#faq" className="hover:text-black transition">FAQ</a>
          </div>
          <button
            className="rounded-xl px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
            style={{ background: "#FF5E3A" }}
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────────────────────── */}
      <section
        className="relative flex min-h-[90vh] flex-col items-center justify-center px-6 pt-24 text-center"
        style={{
          background: "linear-gradient(180deg, rgba(56,189,248,0.15) 0%, rgba(192,132,252,0.08) 50%, #ffffff 100%)",
        }}
      >
        <span
          className="mb-6 inline-block rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider"
          style={{ background: "#ffdbd0", color: "#FF5E3A" }}
        >
          New
        </span>
        <h1
          className="max-w-4xl font-extrabold"
          style={{
            fontSize: "clamp(36px, 5vw, 64px)",
            lineHeight: 1.1,
            letterSpacing: "-0.04em",
            color: "#1d1c15",
          }}
        >
          {data.titolo ?? "Titolo del tuo prodotto"}
        </h1>
        <p
          className="mt-6 max-w-2xl text-lg"
          style={{ color: "#555555", lineHeight: 1.6 }}
        >
          {data.sottotitolo ?? "Sottotitolo che descrive il valore del prodotto in modo chiaro."}
        </p>
        <div className="mt-8 flex gap-4">
          <a
            href="#pricing"
            className="rounded-xl px-8 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
            style={{ background: "#FF5E3A", boxShadow: "0 4px 20px rgba(255,94,58,0.3)" }}
          >
            {data.cta || "Acquista Ora"}
          </a>
          <a
            href="#features"
            className="rounded-xl border px-8 py-3 text-sm font-semibold transition hover:bg-black/5"
            style={{ borderColor: "#ddc0b8", color: "#1d1c15" }}
          >
            Scopri di Più
          </a>
        </div>
      </section>

      {/* ── PROBLEMA ─────────────────────────────────────── */}
      {data.problema && (
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <span
              className="mb-4 inline-block rounded-full px-4 py-1 text-xs font-bold uppercase tracking-wider"
              style={{ background: "#f3ede2", color: "#89726b" }}
            >
              Il Problema
            </span>
            <h2
              className="mt-4 font-bold"
              style={{
                fontSize: "clamp(28px, 4vw, 48px)",
                lineHeight: 1.2,
                letterSpacing: "-0.02em",
                color: "#1d1c15",
                textWrap: "balance",
              }}
            >
              {data.problema}
            </h2>
          </div>
        </section>
      )}

      {/* ── STORIA ───────────────────────────────────────── */}
      {data.storia && (
        <section id="features" className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid items-center gap-12 md:grid-cols-2">
              {/* Cover / Visual */}
              <div
                className="flex h-[400px] items-center justify-center overflow-hidden rounded-3xl"
                style={{ background: "#f3ede2" }}
              >
                {data.coverUrl ? (
                  <img src={data.coverUrl} alt="Cover" className="h-full w-full object-cover" />
                ) : (
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl" style={{ background: "#ff8a65" }}>
                      <span className="text-3xl text-white">📖</span>
                    </div>
                    <p className="text-sm font-medium" style={{ color: "#89726b" }}>Cover del Prodotto</p>
                  </div>
                )}
              </div>
              {/* Text */}
              <div>
                <span className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider" style={{ background: "#f3ede2", color: "#89726b" }}>
                  La Nostra Storia
                </span>
                <h2 className="mt-3 font-bold" style={{ fontSize: "clamp(24px, 3vw, 36px)", lineHeight: 1.2, color: "#1d1c15" }}>
                  {data.storia.split("\n")[0] ?? "La storia del prodotto"}
                </h2>
                <p className="mt-4 leading-relaxed" style={{ color: "#555555" }}>
                  {data.storia.split("\n").slice(1).join("\n") || data.storia}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── LEZIONI ──────────────────────────────────────── */}
      {data.lezioni && data.lezioni.length > 0 && (
        <section className="py-20" style={{ background: "#fff9ee" }}>
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-12 text-center">
              <span className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider" style={{ background: "#f3ede2", color: "#89726b" }}>
                Cosa Imparerai
              </span>
              <h2 className="mt-3 font-bold" style={{ fontSize: "clamp(24px, 3vw, 36px)", color: "#1d1c15" }}>
                Lezioni del Corso
              </h2>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data.lezioni.map((lez, i) => (
                <div
                  key={i}
                  className="group rounded-3xl p-6 transition hover:-translate-y-1"
                  style={{
                    background: "rgba(255,255,255,0.6)",
                    backdropFilter: "blur(10px)",
                    border: "1px solid rgba(255,255,255,0.8)",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
                  }}
                >
                  <div
                    className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold text-white"
                    style={{ background: "#FF5E3A" }}
                  >
                    {i + 1}
                  </div>
                  <h3 className="font-semibold" style={{ color: "#1d1c15" }}>{lez.titolo}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "#555555" }}>
                    {lez.descrizione}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── RECENSIONI ──────────────────────────────────── */}
      {data.recensioni && (
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <span className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider" style={{ background: "#f3ede2", color: "#89726b" }}>
              Testimonianze
            </span>
            <p
              className="mt-6 font-bold"
              style={{
                fontSize: "clamp(20px, 3vw, 32px)",
                lineHeight: 1.4,
                color: "#1d1c15",
              }}
            >
              &ldquo;{data.recensioni}&rdquo;
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <div className="h-10 w-10 rounded-full" style={{ background: "linear-gradient(135deg, #FF9A9E, #FECFEF)" }} />
              <div className="text-left">
                <p className="text-sm font-semibold" style={{ color: "#1d1c15" }}>Nome Cliente</p>
                <p className="text-xs" style={{ color: "#89726b" }}>Ruolo, Azienda</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── PRICING ──────────────────────────────────────── */}
      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-4xl px-6">
          <div className="mb-12 text-center">
            <h2 className="font-bold" style={{ fontSize: "clamp(28px, 4vw, 40px)", color: "#1d1c15" }}>
              Pricing
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {/* Free tier */}
            <div
              className="rounded-3xl p-8"
              style={{
                background: "rgba(255,255,255,0.6)",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255,255,255,0.8)",
              }}
            >
              <h3 className="text-lg font-bold" style={{ color: "#1d1c15" }}>Free</h3>
              <p className="mt-2 text-sm" style={{ color: "#555555" }}>Per iniziare</p>
              <p className="mt-4 text-4xl font-extrabold" style={{ color: "#1d1c15" }}>$0<span className="text-sm font-normal" style={{ color: "#89726b" }}>/mo</span></p>
              <ul className="mt-6 flex flex-col gap-3 text-sm" style={{ color: "#555555" }}>
                <li>✓ 1 Prodotto</li>
                <li>✓ 3 Lingue</li>
                <li>✓ Analytics base</li>
              </ul>
              <button className="mt-8 w-full rounded-xl border py-3 text-sm font-semibold transition hover:bg-black/5" style={{ borderColor: "#ddc0b8", color: "#1d1c15" }}>
                Inizia Gratis
              </button>
            </div>
            {/* Pro tier */}
            <div
              className="relative rounded-3xl p-8"
              style={{
                background: "#1d1c15",
                boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
              }}
            >
              <span className="absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-bold" style={{ background: "#FF5E3A", color: "white" }}>
                Popular
              </span>
              <h3 className="text-lg font-bold text-white">Pro</h3>
              <p className="mt-2 text-sm text-gray-400">Per crescere</p>
              <p className="mt-4 text-4xl font-extrabold text-white">{data.prezzo ?? "$20"}<span className="text-sm font-normal text-gray-400">/mo</span></p>
              <ul className="mt-6 flex flex-col gap-3 text-sm text-gray-300">
                <li>✓ Prodotti illimitati</li>
                <li>✓ 20 Lingue</li>
                <li>✓ Traduzioni AI</li>
                <li>✓ Analytics avanzati</li>
                <li>✓ Stripe integrato</li>
              </ul>
              <button
                className="mt-8 w-full rounded-xl py-3 text-sm font-semibold text-white transition hover:opacity-90"
                style={{ background: "#FF5E3A" }}
              >
                {data.cta || "Acquista Ora"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <section id="faq" className="py-20" style={{ background: "#fff9ee" }}>
        <div className="mx-auto max-w-4xl px-6">
          <div className="grid gap-12 md:grid-cols-[200px_1fr]">
            <h2 className="font-bold" style={{ fontSize: "clamp(24px, 3vw, 36px)", color: "#1d1c15", position: "sticky", top: "100px" }}>
              FAQ
            </h2>
            <div className="flex flex-col">
              {[
                { q: "Come funziona?", a: "Scegli un template, personalizza con AI, pubblica." },
                { q: "Posso cambiare template dopo?", a: "Sì, puoi switchare in qualsiasi momento." },
                { q: "Accetta pagamenti internazionali?", a: "Sì, Stripe gestisce 135+ valute automaticamente." },
                { q: "Serve conoscere il codice?", a: "No, il Cervellone fa tutto per te." },
              ].map((faq, i) => (
                <div key={i} className="border-b py-4" style={{ borderColor: "#ddc0b8" }}>
                  <h3 className="font-semibold" style={{ color: "#1d1c15" }}>{faq.q}</h3>
                  <p className="mt-2 text-sm" style={{ color: "#555555" }}>{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA (Cursor Glow) ─────────────────────── */}
      <section
        ref={ctaRef}
        onMouseMove={handleMouseMove}
        className="relative overflow-hidden py-32"
        style={{
          background: "linear-gradient(135deg, #312e81, #581c87, #134e4a)",
        }}
      >
        {/* Cursor glow */}
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{
            background: `radial-gradient(400px circle at ${mousePos.x}px ${mousePos.y}px, rgba(255,255,255,0.08), transparent 60%)`,
          }}
        />
        <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <h2 className="font-extrabold text-white" style={{ fontSize: "clamp(28px, 4vw, 54px)", letterSpacing: "-0.03em" }}>
            {data.cta || "Inizia Oggi"}
          </h2>
          <p className="mt-4 text-lg text-gray-300">
            {data.prezzo ? `Prezzo: ${data.prezzo}` : "Offerta speciale di lancio"}
          </p>
          <button
            className="mt-8 rounded-xl px-10 py-4 text-base font-semibold text-white transition hover:-translate-y-0.5"
            style={{ background: "#FF5E3A", boxShadow: "0 4px 30px rgba(255,94,58,0.4)" }}
          >
            {data.cta || "Acquista Ora"}
          </button>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────── */}
      <footer className="py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
          <span className="font-bold" style={{ color: "#1d1c15" }}>Brand</span>
          <div className="flex gap-6 text-sm" style={{ color: "#89726b" }}>
            <a href="#" className="hover:text-black transition">Privacy</a>
            <a href="#" className="hover:text-black transition">Terms</a>
            <a href="#" className="hover:text-black transition">Contact</a>
          </div>
        </div>
        <div className="mt-4 text-center text-xs" style={{ color: "#ddc0b8" }}>
          © {new Date().getFullYear()} Brand. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
