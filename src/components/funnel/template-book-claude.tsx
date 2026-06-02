"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronRight, Check, BookOpen, Sparkles, Heart, 
  DollarSign, Leaf, Shield, Star, ArrowRight, Clock,
  Users, TrendingUp, PiggyBank, Home, GraduationCap,
  Zap, Award, Quote
} from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";

interface BookClaudeProps {
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

// ─── Icon pool for feature cards ────────────────
const FEATURE_ICONS = [
  { icon: PiggyBank, color: "#FF6B00" },
  { icon: TrendingUp, color: "#2563EB" },
  { icon: Home, color: "#059669" },
  { icon: Heart, color: "#DC2626" },
  { icon: Leaf, color: "#65A30D" },
  { icon: DollarSign, color: "#D97706" },
  { icon: Users, color: "#7C3AED" },
  { icon: GraduationCap, color: "#0891B2" },
];

// ─── FAQ data ───────────────────────────────────
const FAQ_IT = [
  { q: "Cosa include esattamente?", a: "Ricevi l'eBook completo in PDF, ePub e Kindle. In più hai accesso a vita a tutti gli aggiornamenti futuri e all'area riservata." },
  { q: "Come accedo ai contenuti dopo l'acquisto?", a: "Subito dopo il pagamento verrai reindirizzato alla tua area riservata personale dove puoi leggere online o scaricare tutto." },
  { q: "È un libro fisico o digitale?", a: "È un prodotto digitale (eBook). Puoi leggerlo su qualsiasi dispositivo: telefono, tablet, computer o e-reader." },
  { q: "Se non sono soddisfatto?", a: "Nessun problema. Sei protetto dalla nostra garanzia soddisfatti o rimborsati di 30 giorni. Se non sei contento per qualsiasi motivo, scrivici e ti rimborsiamo immediatamente." },
  { q: "Quanto tempo ci vuole per leggerlo?", a: "Il contenuto principale si legge in circa 2-3 ore. Ogni capitolo è progettato per essere letto in sessioni di 15-20 minuti." },
];

const FAQ_EN = [
  { q: "What exactly is included?", a: "You get the complete eBook in PDF, ePub, and Kindle formats. Plus lifetime access to all future updates and the private members-only area." },
  { q: "How do I access the content after purchase?", a: "Immediately after payment, you'll be redirected to your personal member area where you can read online or download everything." },
  { q: "Is this a physical book or digital?", a: "This is a digital product (eBook). You can read it on any device: phone, tablet, computer, or e-reader." },
  { q: "What if I'm not satisfied?", a: "No problem. You're protected by our 30-day money-back guarantee. If you're not happy for any reason, just email us and we'll refund you immediately." },
  { q: "How long will it take to read?", a: "The core content takes about 2-3 hours to read. Each chapter is designed to be digestible in 15-20 minute sessions." },
];

function t(locale: string, it: string, en: string): string {
  return locale === "en" ? en : it;
}

// ─── Component ──────────────────────────────────
export default function TemplateBookClaude({
  data,
  locale = "it",
  productId,
  productSlug,
  checkoutUrl,
}: BookClaudeProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const faqItems = locale === "en" ? FAQ_EN : FAQ_IT;

  // ─── Default benefit descriptions (for fallback when storia has few paragraphs) ─
  const defaultBenefits = useMemo(() => {
    const isEn = locale === "en";
    return [
      { title: isEn ? "Frugal Mindset" : "Mentalità Frugale", desc: isEn ? "Develop the same mindset that allows communities to thrive with less." : "Sviluppa la stessa mentalità che permette a intere comunità di prosperare con meno." },
      { title: isEn ? "Smart Budgeting" : "Budget Intelligente", desc: isEn ? "Learn practical systems to track, cut, and optimize every expense." : "Impara sistemi pratici per tracciare, tagliare e ottimizzare ogni spesa." },
      { title: isEn ? "Debt Elimination" : "Eliminazione Debiti", desc: isEn ? "Proven strategies to get out of debt faster without sacrificing quality of life." : "Strategie comprovate per uscire dai debiti più velocemente senza sacrificare la qualità della vita." },
      { title: isEn ? "Saving Techniques" : "Tecniche di Risparmio", desc: isEn ? "Discover the saving secrets that have been passed down through generations." : "Scopri i segreti di risparmio tramandati da generazioni." },
      { title: isEn ? "Smart Investing" : "Investimenti Intelligenti", desc: isEn ? "Simple, low-risk investment principles anyone can start with." : "Principi di investimento semplici e a basso rischio che chiunque può iniziare." },
      { title: isEn ? "Financial Freedom" : "Libertà Finanziaria", desc: isEn ? "Create a long-term plan to achieve true independence from the paycheck-to-paycheck cycle." : "Crea un piano a lungo termine per raggiungere la vera indipendenza dal ciclo stipendio-spesa." },
    ];
  }, [locale]);

  // Split storia into paragraphs for features
  const storyParagraphs = useMemo(
    () =>
      (data.storia ?? "")
        .split("\n")
        .map((p) => p.trim())
        .filter((p) => p.length > 0),
    [data.storia]
  );

  // Build feature cards — always at least 6
  const featureCards = useMemo(() => {
    // If lessons exist, use them (supplement with defaults if < 6)
    if (data.lezioni && data.lezioni.length > 0) {
      const fromLessons = data.lezioni.map((l, i) => ({
        title: l.titolo,
        desc: l.descrizione,
        icon: FEATURE_ICONS[i % FEATURE_ICONS.length].icon,
        color: FEATURE_ICONS[i % FEATURE_ICONS.length].color,
      }));
      // Fill up to 6 with defaults
      while (fromLessons.length < 6) {
        const idx = fromLessons.length;
        fromLessons.push({
          ...defaultBenefits[idx % defaultBenefits.length],
          icon: FEATURE_ICONS[idx % FEATURE_ICONS.length].icon,
          color: FEATURE_ICONS[idx % FEATURE_ICONS.length].color,
        });
      }
      return fromLessons;
    }
    // Use storia paragraphs + defaults to reach 6
    const cards: { title: string; desc: string; icon: typeof PiggyBank; color: string }[] = [];
    for (let i = 0; i < Math.max(6, storyParagraphs.length); i++) {
      cards.push({
        title: i < storyParagraphs.length
          ? (["Frugal Mindset","Smart Budgeting","Debt Elimination","Saving Techniques","Smart Investing","Financial Freedom"][i] ??
             defaultBenefits[i % defaultBenefits.length].title)
          : defaultBenefits[i % defaultBenefits.length].title,
        desc: i < storyParagraphs.length ? storyParagraphs[i] : defaultBenefits[i % defaultBenefits.length].desc,
        icon: FEATURE_ICONS[i % FEATURE_ICONS.length].icon,
        color: FEATURE_ICONS[i % FEATURE_ICONS.length].color,
      });
    }
    return cards.slice(0, 6);
  }, [data.lezioni, storyParagraphs, locale, defaultBenefits]);

  // Build chapter previews from storia (for "What's Inside")
  const chapterPreviews = useMemo(() => {
    if (storyParagraphs.length >= 2) {
      return storyParagraphs.slice(0, 4);
    }
    // Fallback generic chapter descriptions
    const generic = locale === "en"
      ? [
          "Discover the core principles of frugal living that have sustained communities for generations.",
          "Learn practical money management techniques that anyone can apply starting today.",
          "Understand how to build lasting wealth through simple, repeatable habits.",
          "Create a personalized action plan to transform your financial future.",
        ]
      : [
          "Scopri i principi fondamentali del vivere frugale che hanno sostenuto intere comunità per generazioni.",
          "Impara tecniche pratiche di gestione del denaro che chiunque può applicare da subito.",
          "Capisci come costruire ricchezza duratura attraverso abitudini semplici e ripetibili.",
          "Crea un piano d'azione personalizzato per trasformare il tuo futuro finanziario.",
        ];
    return generic;
  }, [storyParagraphs, locale]);

  // ─── RENDER ────────────────────────────────────
  return (
    <div className="min-h-screen bg-white text-[#1A1A1A] font-sans selection:bg-[#FF6B00]/20 antialiased">
      {/* ================================================================ */}
      {/* HERO SECTION */}
      {/* ================================================================ */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#FFF8F0] via-white to-[#FFF3EB] opacity-60" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#FF6B00]/[0.03] to-transparent" />
        
        {/* Decorative elements */}
        <div className="absolute top-20 right-20 w-64 h-64 rounded-full bg-[#FF6B00]/[0.04] blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 rounded-full bg-[#FF6B00]/[0.03] blur-3xl" />

        <div className="relative w-full max-w-[1200px] mx-auto px-6 py-24">
          <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
            {/* ── Left: Book Cover ── */}
            <div className="flex justify-center lg:justify-end order-2 lg:order-1">
              <div className="relative w-full max-w-[340px] sm:max-w-[380px] group perspective-[1500px]">
                <div className="relative aspect-[3/4.2] transition-all duration-700 group-hover:-translate-y-2"
                     style={{ transform: "rotateY(-8deg) rotateX(4deg)", transformStyle: "preserve-3d" }}>
                  {/* Spine */}
                  <div className="absolute -left-4 top-[3%] bottom-[3%] w-8 bg-gradient-to-r from-[#e8e8e8] to-[#fafafa] rounded-l-lg border border-black/5"
                       style={{ transform: "rotateY(85deg) translateZ(-1px)", transformStyle: "preserve-3d" }} />
                  {/* Cover */}
                  <div className="w-full h-full rounded-2xl overflow-hidden border border-black/10 shadow-[0_20px_60px_rgba(255,107,0,0.15),0_8px_20px_rgba(0,0,0,0.06)]">
                    {data.coverUrl ? (
                      <img src={data.coverUrl} alt={data.titolo ?? ""} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#FFF3EB] to-white flex items-center justify-center p-8">
                        <div className="text-center">
                          <BookOpen className="w-12 h-12 text-[#FF6B00]/40 mx-auto mb-4" />
                          <p className="text-sm font-bold text-[#FF6B00]">{t(locale, "Copertina", "Cover")}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Shadow */}
                  <div className="absolute -bottom-6 left-[10%] right-[10%] h-6 bg-black/5 blur-xl rounded-full" />
                </div>
              </div>
            </div>

            {/* ── Right: Content ── */}
            <div className="order-1 lg:order-2 space-y-8 max-w-xl">
              {/* Badge */}
              <div className="inline-flex items-center gap-2.5 px-4 py-2 bg-[#FFF3EB] border border-[#FF6B00]/15 rounded-full">
                <span className="w-2 h-2 bg-[#FF6B00] rounded-full animate-pulse" />
                <span className="text-xs font-bold text-[#E05E00] uppercase tracking-[0.15em]">
                  {t(locale, "Nuovo Lancio", "New Release")}
                </span>
              </div>

              {/* Title */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05] text-[#1A1A1A]">
                {data.titolo}
              </h1>

              {/* Subtitle */}
              <p className="text-xl sm:text-2xl text-[#4A4A4A] font-medium leading-relaxed">
                {data.sottotitolo}
              </p>

              {/* Story preview */}
              {data.storia && (
                <p className="text-base text-[#6B7280] leading-relaxed border-l-4 border-[#FF6B00]/30 pl-5 italic">
                  &ldquo;{data.storia.split("\n")[0] || data.storia}&rdquo;
                </p>
              )}

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 pt-2">
                <TrackedCtaButton
                  href={checkoutUrl}
                  productSlug={productSlug ?? ""}
                  productId={productId}
                  locale={locale}
                  className="bg-[#FF6B00] text-white px-10 py-5 rounded-xl font-bold text-lg shadow-[0_8px_28px_rgba(255,107,0,0.25)] hover:bg-[#E05E00] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group"
                >
                  {t(locale, "Acquista Ora —", "Buy Now —")} {data.prezzo ?? ""}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </TrackedCtaButton>
                {chapterPreviews.length >= 2 && (
                  <a
                    href="#inside"
                    className="bg-white text-[#1A1A1A] border-2 border-[#EAEAEA] px-10 py-5 rounded-xl font-bold hover:bg-[#FAFAFA] hover:border-[#D0D0D0] transition-all flex items-center justify-center gap-2"
                  >
                    <BookOpen className="w-5 h-5" />
                    {t(locale, "Scopri di Più", "Learn More")}
                  </a>
                )}
              </div>

              {/* Trust badges */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#EAEAEA]">
                {[
                  { icon: Check, label: t(locale, "eBook Immediato", "Instant eBook") },
                  { icon: Shield, label: t(locale, "Accesso a Vita", "Lifetime Access") },
                  { icon: Star, label: t(locale, "30 Giorni Garanzia", "30-Day Guarantee") },
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0">
                      <b.icon className="w-4 h-4 text-[#FF6B00]" />
                    </div>
                    <span className="text-[11px] font-bold text-[#6B7280] uppercase tracking-[0.05em] leading-tight">
                      {b.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* TRUST BAR */}
      {/* ================================================================ */}
      <section className="py-12 border-y border-[#EAEAEA] bg-[#FAFAFA]">
        <div className="max-w-[1120px] mx-auto px-6">
          <p className="text-center text-xs font-bold text-[#6B7280] uppercase tracking-[0.2em] mb-8">
            {t(locale, "Consigliato da migliaia di lettori", "Trusted by thousands of readers")}
          </p>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-40">
            {[PiggyBank, TrendingUp, DollarSign, Leaf, Shield, Award].map((Icon, i) => (
              <div key={i} className="flex items-center gap-2">
                <Icon className="w-5 h-5 text-[#6B7280]" />
                <span className="text-sm font-bold text-[#6B7280]">
                  {["FrugalLife", "MoneyWise", "SaveMore", "EcoFinance", "WealthLab", "SmartBudget"][i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* PROBLEM SECTION */}
      {/* ================================================================ */}
      {data.problema && (
        <section className="py-24 px-6">
          <div className="max-w-[900px] mx-auto text-center">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-6">
              {t(locale, "// 01 — Il Problema", "// 01 — The Problem")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-[1.1] max-w-3xl mx-auto">
              {data.problema}
            </h2>
            <div className="mt-10 max-w-2xl mx-auto">
              <div className="relative bg-[#FFF3EB] rounded-3xl p-8 lg:p-10 border border-[#FF6B00]/10">
                <Quote className="absolute top-4 left-4 w-8 h-8 text-[#FF6B00]/20" />
                <p className="text-lg text-[#4A4A4A] leading-relaxed relative z-10 italic">
                  &ldquo;{data.storia?.split("\n")[0] || data.storia}&rdquo;
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* FEATURES / BENEFITS */}
      {/* ================================================================ */}
      {featureCards.length > 0 && (
        <section className="py-24 bg-[#FAFAFA] border-y border-[#EAEAEA] px-6">
          <div className="max-w-[1120px] mx-auto">
            <div className="text-center mb-16">
              <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
                {t(locale, "// 02 — Cosa Imparerai", "// 02 — What You'll Learn")}
              </span>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
                {t(locale, "Trasforma le tue finanze", "Transform Your Finances")}
              </h2>
              <p className="mt-4 text-lg text-[#6B7280] max-w-2xl mx-auto">
                {t(locale,
                  "Ogni modulo è progettato per darti risultati concreti, subito applicabili.",
                  "Every module is designed to give you concrete, actionable results."
                )}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {featureCards.slice(0, 6).map((f, i) => {
                const Icon = f.icon;
                return (
                  <div
                    key={i}
                    className="group bg-white rounded-2xl p-8 border border-[#EAEAEA] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300"
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 transition-colors"
                      style={{ background: `${f.color}12` }}
                    >
                      <Icon className="w-6 h-6" style={{ color: f.color }} />
                    </div>
                    <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                    <p className="text-sm text-[#6B7280] leading-relaxed">{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* WHAT'S INSIDE */}
      {/* ================================================================ */}
      <section id="inside" className="py-24 px-6">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-16">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "// 03 — Cosa Troverai", "// 03 — What's Inside")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t(locale, "Contenuti Premium", "Premium Content")}
            </h2>
          </div>

          <div className="space-y-4">
            {chapterPreviews.map((chapter, i) => (
              <div
                key={i}
                className="flex items-start gap-6 p-6 rounded-2xl border border-[#EAEAEA] hover:bg-[#FAFAFA] transition-colors group"
              >
                <div className="w-12 h-12 rounded-xl bg-[#FFF3EB] flex items-center justify-center shrink-0 font-bold text-[#FF6B00] group-hover:scale-110 transition-transform">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base mb-1">
                    {t(locale, `Capitolo ${i + 1}`, `Chapter ${i + 1}`)}
                  </h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed">{chapter}</p>
                </div>
                <div className="hidden sm:flex w-8 h-8 rounded-full bg-[#FFF3EB] items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="w-4 h-4 text-[#FF6B00]" />
                </div>
              </div>
            ))}
          </div>

          {/* What you get */}
          <div className="mt-12 bg-[#FAFAFA] rounded-3xl p-8 lg:p-10 border border-[#EAEAEA]">
            <h3 className="font-bold text-xl mb-6">
              {t(locale, "Include:", "Includes:")}
            </h3>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                t(locale, "eBook completo (PDF, ePub, Kindle)", "Full eBook (PDF, ePub, Kindle)"),
                t(locale, "Accesso immediato e permanente", "Instant & permanent access"),
                t(locale, "Aggiornamenti gratuiti a vita", "Free lifetime updates"),
                t(locale, "Area riservata esclusiva", "Private members area"),
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 text-[#FF6B00]" strokeWidth={3} />
                  </div>
                  <span className="text-sm font-medium text-[#4A4A4A]">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* TESTIMONIAL */}
      {/* ================================================================ */}
      {data.recensioni && data.recensioni !== data.storia && (
        <section className="py-24 bg-[#FFF8F0] border-y border-[#EAEAEA] px-6">
          <div className="max-w-[800px] mx-auto text-center">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "// 04 — Testimonianze", "// 04 — Testimonials")}
            </span>
            <div className="relative">
              <Quote className="w-12 h-12 text-[#FF6B00]/15 mx-auto mb-6" />
              <blockquote className="text-2xl sm:text-3xl font-bold leading-relaxed tracking-tight text-[#1A1A1A]">
                &ldquo;{data.recensioni}&rdquo;
              </blockquote>
            </div>
            <div className="mt-8 flex items-center justify-center gap-3">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-[#FF6B00] text-[#FF6B00]" />
                ))}
              </div>
            </div>
            <p className="mt-4 text-sm text-[#6B7280]">
              — {t(locale, "Primi lettori entusiasti", "Happy early readers")}
            </p>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* PRICING */}
      {/* ================================================================ */}
      <section className="py-24 px-6">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-16">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "// 05 — Prezzo", "// 05 — Pricing")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t(locale, "Investi in Te Stesso", "Invest in Yourself")}
            </h2>
            <p className="mt-4 text-lg text-[#6B7280]">
              {t(locale,
                "Prezzo di lancio. La qualità non ha prezzo.",
                "Launch pricing. Quality doesn't cost, it pays."
              )}
            </p>
          </div>

          <div className="max-w-[500px] mx-auto">
            <div className="relative bg-white rounded-3xl border-2 border-[#FF6B00]/20 shadow-[0_8px_40px_rgba(255,107,0,0.08)] p-8 lg:p-10">
              {/* Badge */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-5 py-1.5 bg-[#FF6B00] text-white rounded-full text-xs font-bold uppercase tracking-wider shadow-lg">
                <Zap className="w-3.5 h-3.5" />
                {t(locale, "Offerta di Lancio", "Launch Offer")}
              </div>

              <div className="mt-4 text-center">
                <p className="text-sm font-bold text-[#6B7280] uppercase tracking-widest mb-2">
                  {t(locale, "Accesso Completo", "Full Access")}
                </p>

                {/* Price */}
                <div className="flex items-baseline justify-center gap-1 mt-4">
                  <span className="text-6xl font-black tracking-tighter">{data.prezzo}</span>
                </div>

                {/* One-time */}
                <p className="mt-1 text-sm text-[#6B7280] font-medium">
                  {t(locale, "Pagamento unico — nessun abbonamento", "One-time payment — no subscription")}
                </p>

                {/* Features */}
                <ul className="mt-8 space-y-4 text-left max-w-sm mx-auto">
                  {[
                    t(locale, "eBook in PDF, ePub e Kindle", "eBook in PDF, ePub & Kindle"),
                    t(locale, "Download immediato", "Instant download"),
                    t(locale, "Accesso a vita all'area riservata", "Lifetime member area access"),
                    t(locale, "Aggiornamenti futuri inclusi", "All future updates included"),
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 text-[#FF6B00]" strokeWidth={3} />
                      </div>
                      <span className="text-sm text-[#4A4A4A]">{item}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="mt-8">
                  <TrackedCtaButton
                    href={checkoutUrl}
                    productSlug={productSlug ?? ""}
                    productId={productId}
                    locale={locale}
                    className="w-full bg-[#FF6B00] hover:bg-[#E05E00] text-white py-5 rounded-2xl font-black text-base uppercase tracking-widest transition-all shadow-[0_8px_32px_rgba(255,107,0,0.3)] hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    {t(locale, "Acquista Ora", "Buy Now")}
                    <ArrowRight className="w-5 h-5" />
                  </TrackedCtaButton>
                </div>

                {/* Guarantee */}
                <p className="mt-4 text-xs text-[#6B7280] flex items-center justify-center gap-2">
                  <Shield className="w-4 h-4 text-[#059669]" />
                  {t(locale,
                    "Garanzia soddisfatti o rimborsati 30 giorni",
                    "30-day money-back guarantee"
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FAQ */}
      {/* ================================================================ */}
      <section className="py-24 bg-[#FAFAFA] border-y border-[#EAEAEA] px-6">
        <div className="max-w-[700px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "// 06 — FAQ", "// 06 — FAQ")}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
              {t(locale, "Domande Frequenti", "Frequently Asked Questions")}
            </h2>
          </div>

          <div className="space-y-3">
            {faqItems.map((faq, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-[#EAEAEA] overflow-hidden transition-shadow hover:shadow-sm"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left"
                >
                  <span className="font-bold text-sm pr-4">{faq.q}</span>
                  <div
                    className={`w-6 h-6 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0 transition-transform ${
                      openFaq === i ? "rotate-180" : ""
                    }`}
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-[#FF6B00]" />
                  </div>
                </button>
                <div
                  className={`grid transition-all duration-300 ${
                    openFaq === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="px-6 pb-5 text-sm text-[#6B7280] leading-relaxed">
                      {faq.a}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FINAL CTA — URGENCY */}
      {/* ================================================================ */}
      <section className="py-32 px-6 relative overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-[#0B0B0C]" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `radial-gradient(circle at 30% 20%, #FF6B00 0%, transparent 50%), radial-gradient(circle at 70% 80%, #FF6B00 0%, transparent 50%)`,
          }}
        />

        <div className="relative z-10 max-w-[700px] mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full mb-8">
            <Clock className="w-4 h-4 text-[#FF6B00]" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {t(locale, "Offerta a tempo limitato", "Limited time offer")}
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.1] mb-6">
            {t(locale,
              "Inizia il tuo viaggio verso la libertà finanziaria",
              "Start Your Journey to Financial Freedom"
            )}
          </h2>

          <p className="text-lg text-gray-400 mb-10 max-w-lg mx-auto">
            {t(locale,
              "Unisciti a centinaia di lettori che hanno già trasformato il loro rapporto con il denaro.",
              "Join hundreds of readers who have already transformed their relationship with money."
            )}
          </p>

          <TrackedCtaButton
            href={checkoutUrl}
            productSlug={productSlug ?? ""}
            productId={productId}
            locale={locale}
            className="inline-flex items-center gap-3 bg-[#FF6B00] hover:bg-[#E05E00] text-white px-12 py-5 rounded-2xl font-black text-lg tracking-wide transition-all shadow-[0_8px_32px_rgba(255,107,0,0.35)] hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(255,107,0,0.45)]"
          >
            {t(locale, "Acquista Ora —", "Buy Now —")} {data.prezzo ?? ""}
            <ArrowRight className="w-5 h-5" />
          </TrackedCtaButton>

          {/* Guarantee badges */}
          <div className="mt-10 flex flex-wrap justify-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#059669]" />
              {t(locale, "30 Giorni Soddisfatti", "30-Day Guarantee")}
            </span>
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#FF6B00]" />
              {t(locale, "Accesso Istantaneo", "Instant Access")}
            </span>
            <span className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[#FF6B00]" />
              {t(locale, "Aggiornamenti a Vita", "Lifetime Updates")}
            </span>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FOOTER */}
      {/* ================================================================ */}
      <footer className="py-10 border-t border-[#EAEAEA] bg-white">
        <div className="max-w-[1120px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-[#6B7280] font-medium">
          <div>
            &copy; {new Date().getFullYear()} Courssy — {t(locale, "Tutti i diritti riservati.", "All rights reserved.")}
          </div>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-[#1A1A1A] transition-colors">
              {t(locale, "Privacy", "Privacy")}
            </a>
            <a href="/terms" className="hover:text-[#1A1A1A] transition-colors">
              {t(locale, "Termini", "Terms")}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
