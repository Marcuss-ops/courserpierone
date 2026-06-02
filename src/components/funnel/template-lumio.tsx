"use client";

// ─── TEMPLATE LUMIO: Minimalism + Glassmorphism ──────────
// Tonalità calda ivory, nav floating pill, gradienti sunset, glassmorphism


interface LumioProps {
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
  productId?: string;
  productSlug?: string;
  checkoutUrl?: string;
}

export default function TemplateLumio({ data, locale: _locale = "it" }: LumioProps) {
  return (
    <div className="min-h-screen" style={{ background: "#FAF9F5" }}>
      {/* ── FLOATING NAV ──────────────────────────────────── */}
      <nav className="fixed left-1/2 top-4 z-50 -translate-x-1/2">
        <div
          className="flex items-center gap-8 rounded-full px-6 py-3"
          style={{
            background: "#1B1B1B",
            backdropFilter: "blur(20px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
          }}
        >
          <span className="text-sm font-semibold text-white">Brand</span>
          <div className="hidden items-center gap-6 text-sm text-gray-400 md:flex">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#pricing" className="hover:text-white transition">Pricing</a>
            <a href="#testimonials" className="hover:text-white transition">Testimonials</a>
          </div>
          <button
            className="rounded-full px-4 py-1.5 text-sm font-medium text-white"
            style={{ background: "linear-gradient(135deg, #FF416C, #FF4B2B)" }}
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────────────────────── */}
      <section className="flex min-h-[90vh] flex-col items-center justify-center px-6 pt-24 text-center">
        <h1
          className="max-w-4xl font-bold"
          style={{
            fontSize: "clamp(40px, 6vw, 82px)",
            lineHeight: 1.05,
            letterSpacing: "-0.04em",
            color: "#1B1B1B",
            textWrap: "balance",
          }}
        >
          {data.titolo ?? "Titolo del tuo prodotto"}
        </h1>
        <p
          className="mt-6 max-w-2xl text-lg"
          style={{ color: "#8C8880", lineHeight: 1.6 }}
        >
          {data.sottotitolo ?? "Sottotitolo che descrive il valore del prodotto in modo chiaro e diretto."}
        </p>
        <div className="mt-8 flex gap-4">
          <a
            href="#pricing"
            className="rounded-full px-8 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5"
            style={{
              background: "linear-gradient(135deg, #FF416C, #FF4B2B)",
              boxShadow: "0 4px 20px rgba(255,65,108,0.3)",
            }}
          >
            {data.cta || "Acquista Ora"}
          </a>
          <a
            href="#features"
            className="rounded-full border px-8 py-3 text-sm font-semibold transition hover:bg-black/5"
            style={{ borderColor: "#D9D7D0", color: "#1B1B1B" }}
          >
            Scopri di Più
          </a>
        </div>
      </section>

      {/* ── TRUST STRIP (Loghi placeholder) ──────────────── */}
      <section className="py-12 overflow-hidden">
        <p className="mb-6 text-center text-xs font-semibold uppercase tracking-widest" style={{ color: "#8C8880" }}>
          Trusted by teams worldwide
        </p>
        <div className="flex gap-16 animate-[marquee_20s_linear_infinite] whitespace-nowrap">
          {["Brand Alpha", "TechCorp", "Studio Pro", "Creative Inc", "Digital Labs", "Brand Alpha", "TechCorp", "Studio Pro"].map((name, i) => (
            <span key={i} className="text-lg font-bold opacity-30" style={{ color: "#1B1B1B" }}>
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* ── PROBLEMA ─────────────────────────────────────── */}
      {data.problema && (
        <section className="py-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <span
              className="mb-4 inline-block rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wider"
              style={{ background: "#F0EFEB", color: "#8C8880" }}
            >
              Il Problema
            </span>
            <h2
              className="mt-4 font-bold"
              style={{ fontSize: "clamp(28px, 4vw, 49px)", lineHeight: 1.2, letterSpacing: "-0.02em", color: "#1B1B1B", textWrap: "balance" }}
            >
              {data.problema}
            </h2>
          </div>
        </section>
      )}

      {/* ── STORIA (Feature 2-col) ──────────────────────── */}
      {data.storia && (
        <section id="features" className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid items-center gap-12 md:grid-cols-2">
              {/* Cover / Placeholder */}
              <div
                className="flex h-[400px] items-center justify-center rounded-[40px] overflow-hidden"
                style={{ background: "#F0EFEB" }}
              >
                {data.coverUrl ? (
                  <img src={data.coverUrl} alt="Cover" className="h-full w-full object-cover" />
                ) : (
                  <div className="text-center">
                    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(135deg, #FF416C, #FF4B2B)" }}>
                      <span className="text-3xl text-white">📖</span>
                    </div>
                    <p className="text-sm font-medium" style={{ color: "#8C8880" }}>Cover del Prodotto</p>
                  </div>
                )}
              </div>
              {/* Testo */}
              <div>
                <span className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider" style={{ background: "#F0EFEB", color: "#8C8880" }}>
                  La Nostra Storia
                </span>
                <h2 className="mt-3 font-bold" style={{ fontSize: "clamp(24px, 3vw, 36px)", lineHeight: 1.2, color: "#1B1B1B" }}>
                  {data.storia.split("\n")[0] ?? "La storia del prodotto"}
                </h2>
                <p className="mt-4 leading-relaxed" style={{ color: "#8C8880", lineHeight: 1.7 }}>
                  {data.storia.split("\n").slice(1).join("\n") || data.storia}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── LEZIONI / FEATURES ───────────────────────────── */}
      {data.lezioni && data.lezioni.length > 0 && (
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-12 text-center">
              <span className="mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider" style={{ background: "#F0EFEB", color: "#8C8880" }}>
                Cosa Imparerai
              </span>
              <h2 className="mt-3 font-bold" style={{ fontSize: "clamp(24px, 3vw, 36px)", color: "#1B1B1B" }}>
                Lezioni del Corso
              </h2>
            </div>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {data.lezioni.map((lez, i) => (
                <div
                  key={i}
                  className="group rounded-3xl p-6 transition hover:-translate-y-1"
                  style={{ background: "#FFFDF8", border: "1px solid #D9D7D0" }}
                >
                  <div
                    className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-bold text-white"
                    style={{ background: "linear-gradient(135deg, #8A2387, #E94057)" }}
                  >
                    {i + 1}
                  </div>
                  <h3 className="font-semibold" style={{ color: "#1B1B1B" }}>{lez.titolo}</h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "#8C8880" }}>
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
        <section id="testimonials" className="py-20">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <span className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider" style={{ background: "#F0EFEB", color: "#8C8880" }}>
              Testimonianze
            </span>
            <div className="mt-6 text-xl leading-relaxed" style={{ color: "#1B1B1B" }}>
              <span style={{ background: "linear-gradient(135deg, #FF416C, #FF4B2B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", fontSize: "48px" }}>&ldquo;</span>
              <p className="mt-2" style={{ fontSize: "clamp(18px, 2.5vw, 24px)" }}>
                {data.recensioni}
              </p>
            </div>
            <div className="mt-6 flex items-center justify-center gap-3">
              <div className="h-10 w-10 rounded-full" style={{ background: "linear-gradient(135deg, #FF416C, #FF4B2B)" }} />
              <div className="text-left">
                <p className="text-sm font-semibold" style={{ color: "#1B1B1B" }}>Nome Cliente</p>
                <p className="text-xs" style={{ color: "#8C8880" }}>Ruolo, Azienda</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── CTA / VENDITA ────────────────────────────────── */}
      <section id="pricing" className="py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div
            className="rounded-[40px] p-12"
            style={{ background: "#1B1B1B" }}
          >
            <h2 className="text-3xl font-bold text-white">{data.cta ?? "Inizia Oggi"}</h2>
            <p className="mt-4 text-lg text-gray-400">
              {data.prezzo ? `Prezzo: ${data.prezzo}` : "Prezzo speciale di lancio"}
            </p>
            <button
              className="mt-8 rounded-full px-10 py-4 text-base font-semibold text-white transition hover:-translate-y-0.5"
              style={{
                background: "linear-gradient(135deg, #FF416C, #FF4B2B)",
                boxShadow: "0 4px 20px rgba(255,65,108,0.4)",
              }}
            >
              {data.cta || "Acquista Ora"}
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────── */}
      <footer style={{ background: "linear-gradient(180deg, #181818, #0a0a0a)" }} className="py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-6 md:flex-row">
            <span className="text-lg font-bold text-white">Brand</span>
            <div className="flex gap-6 text-sm text-gray-500">
              <a href="#" className="hover:text-white transition">Privacy</a>
              <a href="#" className="hover:text-white transition">Terms</a>
              <a href="#" className="hover:text-white transition">Contact</a>
            </div>
          </div>
          <div className="mt-8 text-center text-xs text-gray-600">
            © {new Date().getFullYear()} Brand. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
