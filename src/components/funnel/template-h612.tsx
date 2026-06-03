"use client";

// ─── TEMPLATE H612: Dark Monochrome + Tonal Layering ─────
// Estetica scura, scholarly, serif + sans dual font, liquid orbs, parallax

interface H612Props {
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
    localeContent?: {
      nav?: { brand?: string; features?: string; pricing?: string; get_started?: string; learn_more?: string };
      hero?: { badge?: string; cta?: string; secondary_cta?: string; price_label?: string };
      problem?: { badge?: string };
      story?: { badge?: string };
      lessons?: { badge?: string; title?: string };
      testimonials?: { badge?: string; items?: { name?: string; role?: string }[] };
      offer?: { one_time?: string };
      footer?: { rights_reserved?: string; privacy?: string; terms?: string; contact?: string };
      course?: { now_playing?: string; module_label?: string };
      trust?: { title?: string; company_names?: string[] };
      ui?: { labels?: Record<string, string> };
    };
  };
  locale?: string;
  productId?: string;
  productSlug?: string;
  checkoutUrl?: string;
}

export default function TemplateH612({ data, locale: _locale = "it" }: H612Props) {
  const lc = data.localeContent;
  return (
    <div className="min-h-screen" style={{ background: "#141313", color: "#ffffff" }}>
      {/* ── NAV ───────────────────────────────────────────── */}
      <nav
        className="fixed left-0 right-0 top-0 z-50 border-b"
        style={{
          background: "rgba(20,19,19,0.8)",
          backdropFilter: "blur(20px)",
          borderColor: "#353434",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold text-white">{lc?.nav?.brand || "Brand"}</span>
          <div className="flex items-center gap-6">
            <a href="#features" className="text-sm text-gray-400 hover:text-white transition">{lc?.nav?.features || "Features"}</a>
            <a href="#pricing" className="text-sm text-gray-400 hover:text-white transition">{lc?.nav?.pricing || "Pricing"}</a>
            <button
              className="rounded-full border px-5 py-2 text-sm font-medium text-white transition hover:bg-white/10"
              style={{ borderColor: "#444748" }}
            >
              {lc?.nav?.get_started || "Get Started"}
            </button>
          </div>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────────────────────── */}
      <section className="flex min-h-[80vh] flex-col justify-center px-6 pt-24">
        <div className="mx-auto max-w-4xl">
          <h1
            className="font-normal"
            style={{
              fontFamily: "'Noto Serif', serif",
              fontSize: "clamp(36px, 5vw, 72px)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            {data.titolo ?? "Titolo del Prodotto"}
          </h1>
          <p className="mt-6 max-w-2xl text-lg" style={{ color: "#c7c6c6", fontFamily: "'Manrope', sans-serif" }}>
            {data.sottotitolo ?? "Sottotitolo che introduce il valore del prodotto in modo elegante e diretto."}
          </p>
          <div className="mt-8 flex gap-4">
            <a
              href="#pricing"
              className="rounded-lg px-8 py-3 text-sm font-medium text-black transition hover:opacity-90"
              style={{ background: "#ffffff" }}
            >                {data.cta || lc?.hero?.cta || lc?.ui?.labels?.start_today || "Inizia Ora"}
            </a>
            <a
              href="#features"
              className="rounded-lg border px-8 py-3 text-sm font-medium text-white transition hover:bg-white/5"
              style={{ borderColor: "#444748" }}
            >
              {lc?.nav?.learn_more || "Scopri di Più"}
            </a>
          </div>
        </div>
      </section>

      {/* ── LOGO ROLL ────────────────────────────────────── */}
      <section className="overflow-hidden border-y py-10" style={{ borderColor: "#353434" }}>
        <div className="flex gap-20 animate-[marquee_25s_linear_infinite] whitespace-nowrap">
          {(lc?.trust?.company_names?.length ? lc.trust.company_names : ["Brand Alpha", "TechCorp", "Studio Pro", "Creative Inc", "Digital Labs", "Brand Alpha", "TechCorp", "Studio Pro"]).map((name, i) => (
            <span key={i} className="text-xl font-bold opacity-20" style={{ fontFamily: "'Noto Serif', serif" }}>
              {name}
            </span>
          ))}
        </div>
      </section>

      {/* ── PROBLEMA ─────────────────────────────────────── */}
      {data.problema && (
        <section className="py-24">
          <div className="mx-auto max-w-3xl px-6">
            <span className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest" style={{ color: "#8e9192" }}>
              {lc?.problem?.badge || lc?.ui?.labels?.the_problem || "The Problem"}
            </span>
            <h2
              className="mt-4"
              style={{
                fontFamily: "'Noto Serif', serif",
                fontSize: "clamp(28px, 4vw, 48px)",
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
              }}
            >
              {data.problema}
            </h2>
          </div>
        </section>
      )}

      {/* ── STORIA (Feature split) ──────────────────────── */}
      {data.storia && (
        <section id="features" className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid items-center gap-12 md:grid-cols-2">
              {/* Visual placeholder */}
              <div
                className="relative flex h-[450px] items-center justify-center overflow-hidden rounded-2xl"
                style={{ background: "#201f1f" }}
              >
                {data.coverUrl ? (
                  <img src={data.coverUrl} alt="Cover" className="h-full w-full object-cover" />
                ) : (
                  <>
                    {/* Liquid orb */}
                    <div
                      className="absolute h-32 w-32 rounded-full opacity-60"
                      style={{
                        background: "linear-gradient(135deg, #4facfe, #00f2fe)",
                        filter: "blur(40px)",
                        animation: "liquidFlow 6s ease-in-out infinite",
                      }}
                    />
                    <div
                      className="absolute h-24 w-24 rounded-full opacity-40"
                      style={{
                        background: "linear-gradient(135deg, #f093fb, #f5576c)",
                        filter: "blur(30px)",
                        animation: "liquidFlow 8s ease-in-out infinite reverse",
                        top: "30%",
                        left: "60%",
                      }}
                    />
                    <div className="relative z-10 text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl" style={{ background: "#2a2a2a" }}>
                        <span className="text-2xl">📖</span>
                      </div>
                      <p className="text-sm" style={{ color: "#8e9192" }}>{lc?.ui?.labels?.cover_placeholder || "Cover del Prodotto"}</p>
                    </div>
                  </>
                )}
              </div>
              {/* Text */}
              <div>
                <span className="mb-3 inline-block text-xs font-semibold uppercase tracking-widest" style={{ color: "#8e9192" }}>
                  {lc?.story?.badge || lc?.ui?.labels?.our_story || "Our Story"}
                </span>
                <h2
                  className="mt-3"
                  style={{ fontFamily: "'Noto Serif', serif", fontSize: "clamp(24px, 3vw, 36px)", lineHeight: 1.2 }}
                >
                  {data.storia.split("\n")[0] ?? "La storia del prodotto"}
                </h2>
                <p className="mt-4 leading-relaxed" style={{ color: "#c7c6c6", fontFamily: "'Manrope', sans-serif" }}>
                  {data.storia.split("\n").slice(1).join("\n") || data.storia}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── LEZIONI ──────────────────────────────────────── */}
      {data.lezioni && data.lezioni.length > 0 && (
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <span className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest" style={{ color: "#8e9192" }}>
              {lc?.lessons?.badge || lc?.ui?.labels?.curriculum || "Curriculum"}
            </span>
            <h2
              className="mb-12"
              style={{ fontFamily: "'Noto Serif', serif", fontSize: "clamp(24px, 3vw, 36px)" }}
            >
              {lc?.lessons?.title || "Lezioni del Corso"}
            </h2>
            <div className="flex flex-col gap-4">
              {data.lezioni.map((lez, i) => (
                <div
                  key={i}
                  className="group flex items-start gap-6 rounded-xl p-6 transition hover:bg-white/5"
                  style={{ background: "#1c1b1b", border: "1px solid #353434" }}
                >
                  <span
                    className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                    style={{ background: "#2a2a2a", color: "#ffffff" }}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className="font-medium" style={{ fontFamily: "'Manrope', sans-serif" }}>
                      {lez.titolo}
                    </h3>
                    <p className="mt-1 text-sm" style={{ color: "#8e9192" }}>
                      {lez.descrizione}
                    </p>
                  </div>
                  <div className="ml-auto mt-2 h-[2px] w-0 flex-shrink-0 transition-all group-hover:w-16" style={{ background: "linear-gradient(90deg, #4facfe, #00f2fe)" }} />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── RECENSIONI ──────────────────────────────────── */}
      {data.recensioni && (
        <section className="py-24">
          <div className="mx-auto max-w-3xl px-6 text-center">
            <span className="mb-4 inline-block text-xs font-semibold uppercase tracking-widest" style={{ color: "#8e9192" }}>
              {lc?.testimonials?.badge || "Testimonianze"}
            </span>
            <p
              className="mt-6"
              style={{
                fontFamily: "'Noto Serif', serif",
                fontSize: "clamp(20px, 3vw, 32px)",
                lineHeight: 1.4,
                color: "#ffffff",
              }}
            >
              &ldquo;{data.recensioni}&rdquo;
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <div className="h-10 w-10 rounded-full" style={{ background: "linear-gradient(135deg, #4facfe, #00f2fe)" }} />
              <div className="text-left">
                <p className="text-sm font-medium text-white">{data.localeContent?.testimonials?.items?.[0]?.name || "Nome Cliente"}</p>
                <p className="text-xs" style={{ color: "#8e9192" }}>{data.localeContent?.testimonials?.items?.[0]?.role || "Ruolo, Azienda"}</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── CTA ──────────────────────────────────────────── */}
      <section id="pricing" className="relative overflow-hidden py-24">
        {/* Floating orbs */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/4 top-1/4 h-[300px] w-[300px] rounded-full opacity-20" style={{ background: "linear-gradient(135deg, #4facfe, #00f2fe)", filter: "blur(80px)", animation: "float 8s ease-in-out infinite" }} />
          <div className="absolute bottom-1/4 right-1/4 h-[250px] w-[250px] rounded-full opacity-15" style={{ background: "linear-gradient(135deg, #f093fb, #f5576c)", filter: "blur(80px)", animation: "float 10s ease-in-out infinite reverse" }} />
        </div>
        <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
          <h2
            style={{ fontFamily: "'Noto Serif', serif", fontSize: "clamp(28px, 4vw, 48px)" }}
          >
            {data.cta || lc?.hero?.cta || "Inizia Oggi"}
          </h2>
          <p className="mt-4 text-lg" style={{ color: "#c7c6c6" }}>
            {data.prezzo ? `${lc?.ui?.labels?.price || "Prezzo"}: ${data.prezzo}` : (lc?.hero?.price_label || lc?.ui?.labels?.price_special || "Offerta speciale di lancio")}
          </p>
          <button
            className="mt-8 rounded-lg px-10 py-4 text-base font-medium text-black transition hover:opacity-90"
            style={{ background: "#ffffff" }}
          >
            {data.cta || lc?.hero?.cta || lc?.ui?.labels?.buy_now || "Acquista Ora"}
          </button>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────── */}
      <footer className="border-t py-8" style={{ borderColor: "#353434" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
          <span className="font-semibold">{lc?.nav?.brand || "Brand"}</span>
          <div className="flex gap-6 text-sm" style={{ color: "#8e9192" }}>
            <a href="#" className="hover:text-white transition">{lc?.footer?.privacy || lc?.ui?.labels?.privacy || "Privacy"}</a>
            <a href="#" className="hover:text-white transition">{lc?.footer?.terms || lc?.ui?.labels?.terms || "Terms"}</a>
            <a href="#" className="hover:text-white transition">{lc?.footer?.contact || lc?.ui?.labels?.contact || "Contact"}</a>
          </div>
        </div>
        <div className="mt-4 text-center text-xs" style={{ color: "#444748" }}>
          © {new Date().getFullYear()} {lc?.nav?.brand || "Brand"}. {lc?.footer?.rights_reserved || lc?.ui?.labels?.rights_reserved || "All rights reserved."}
        </div>
      </footer>

      <style jsx>{`
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes liquidFlow {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50% { transform: scale(1.2) rotate(180deg); }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-30px); }
        }
      `}</style>
    </div>
  );
}
