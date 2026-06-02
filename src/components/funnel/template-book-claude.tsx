"use client";

import React, { useState, useMemo } from "react";
import {
  ChevronRight, Check, BookOpen,
  DollarSign, Leaf, Shield, Star, ArrowRight, Clock,
  Users, TrendingUp, PiggyBank, Home, Heart,
  Zap, Award, Quote, ThumbsUp, X, Wrench,
  CalendarCheck, Smartphone, CreditCard, Lock
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

// ─── Constants ─────────────────────────────────
const FEATURE_ICONS = [
  { icon: PiggyBank, color: "#FF6B00" },
  { icon: TrendingUp, color: "#2563EB" },
  { icon: Home, color: "#059669" },
  { icon: Heart, color: "#DC2626" },
  { icon: Leaf, color: "#65A30D" },
  { icon: DollarSign, color: "#D97706" },
  { icon: Users, color: "#7C3AED" },
  { icon: Wrench, color: "#0891B2" },
];

const FAQ_IT = [
  { q: "Cosa include esattamente?", a: "Ricevi l'eBook completo in PDF, ePub e Kindle. In più hai accesso a vita a tutti gli aggiornamenti futuri e all'area riservata." },
  { q: "È in italiano?", a: "Sì, il corso è completamente tradotto in italiano con contenuti aggiuntivi in inglese." },
  { q: "In che formato ricevo il corso?", a: "eBook in PDF (impaginato), ePub (reflowable) e formato Kindle. I video sono in MP4, accessibili dall'area riservata." },
  { q: "Quando ricevo l'accesso?", a: "Immediatamente dopo il pagamento. Ricevi una email con il link all'area riservata dove trovi tutto." },
  { q: "Se non sono soddisfatto?", a: "Nessun problema. Sei protetto dalla garanzia soddisfatti o rimborsati 30 giorni. Se non risparmi almeno €100, ti rimborsiamo. Nessuna domanda." },
  { q: "Quanto tempo ci vuole?", a: "Il percorso completo si segue in circa 3-4 ore. Ogni modulo è pensato per sessioni da 20 minuti." },
];

const FAQ_EN = [
  { q: "What exactly is included?", a: "You get the complete eBook in PDF, ePub, and Kindle formats. Plus lifetime access to all future updates and the private members area." },
  { q: "Is it in English?", a: "Yes, the course is fully available in English with Italian as a secondary language." },
  { q: "What format is the course in?", a: "eBook in PDF, ePub, and Kindle formats. Videos are in MP4 format, accessible from the members area." },
  { q: "When do I get access?", a: "Immediately after payment. You'll receive an email with the link to your personal members area." },
  { q: "What if I'm not satisfied?", a: "You're protected by our 30-day money-back guarantee. If you don't save at least $100, we'll refund you. No questions asked." },
  { q: "How long does it take?", a: "The complete program takes about 3-4 hours. Each module is designed for 20-minute sessions." },
];

/**
 * t() supporta 100+ lingue con fallback universale.
 * - locale "it" → testo italiano
 * - TUTTE le altre lingue (en, fr, es, de, ja, zh, pt, ar, hi, ru, etc.) → inglese
 * 
 * Il contenuto del prodotto (titolo, storia, etc.) viene già dal database
 * in qualsiasi lingua — questo gestisce solo le label fisse della UI.
 */
function t(locale: string, it: string, en: string): string {
  return locale?.toLowerCase() === "it" ? it : en;
}

// ─── Benefit data ──────────────────────────────
const BENEFITS_IT: { title: string; desc: string }[] = [
  { title: "Budget Amish", desc: "Come vivere con il 30% in meno senza sacrifici — il sistema di bilancio che funziona da 300 anni." },
  { title: "Dispensa Infinita", desc: "Il metodo di conservazione e gestione delle scorte che elimina gli sprechi e taglia la spesa del 40%." },
  { title: "Debito Zero", desc: "Il framework per uscire dai debiti e non tornarci mai più. Niente credito, niente rate, niente interessi." },
  { title: "Ripara Tutto", desc: "12 strumenti essenziali e come usarli per riparare casa, vestiti e oggetti da solo. Addio artigiani costosi." },
  { title: "Scambio Senza Soldi", desc: "Come attivare una rete di baratto nella tua comunità per ottenere servizi gratuitamente." },
  { title: "Dalla Terra alla Tavola", desc: "Guida pratica all'orto domestico e alla cucina a spreco zero. Anche in un balcone." },
  { title: "Energia Libera", desc: "Come ridurre le bollette del 50% con soluzioni a basso costo ispirate alla vita Amish." },
  { title: "Piano 30 Giorni", desc: "Checklist stampabile giorno per giorno per trasformare le tue finanze in un mese." },
];

const BENEFITS_EN: { title: string; desc: string }[] = [
  { title: "Amish Budget", desc: "Live on 30% less without sacrifice — the budgeting system that has worked for 300 years." },
  { title: "Infinite Pantry", desc: "The food storage and management method that eliminates waste and cuts grocery bills by 40%." },
  { title: "Zero Debt", desc: "The framework to get out of debt and stay out. No credit, no installments, no interest." },
  { title: "Fix Everything", desc: "12 essential tools and how to use them to repair your home, clothes, and belongings yourself." },
  { title: "Money-Free Exchange", desc: "How to activate a barter network in your community to get services for free." },
  { title: "Farm to Table", desc: "Practical guide to home gardening and zero-waste cooking. Even on a balcony." },
  { title: "Free Energy", desc: "How to cut your utility bills by 50% with low-cost solutions inspired by Amish living." },
  { title: "30-Day Plan", desc: "Printable day-by-day checklist to transform your finances in one month." },
];

// ─── Component ─────────────────────────────────
export default function TemplateBookClaude({
  data,
  locale = "it",
  productId,
  productSlug,
  checkoutUrl,
}: BookClaudeProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  // Supporto 100+ lingue: italiano per locale "it", inglese per tutto il resto
  const faqItems = locale?.toLowerCase() === "it" ? FAQ_IT : FAQ_EN;
  const benefits = locale?.toLowerCase() === "it" ? BENEFITS_IT : BENEFITS_EN;

  // ─── RENDER ────────────────────────────────────
  return (
    <div className="min-h-screen bg-white text-[#1A1A1A] font-sans selection:bg-[#FF6B00]/20 antialiased">
      {/* ================================================================ */}
      {/* STICKY MOBILE CTA BAR */}
      {/* ================================================================ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#EAEAEA] p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-black tracking-tight">{data.prezzo}</div>
            <div className="text-[10px] text-[#6B7280] font-medium">
              {t(locale, "Accesso immediato", "Instant access")}
            </div>
          </div>
          <TrackedCtaButton
            href={checkoutUrl}
            productSlug={productSlug ?? ""}
            productId={productId}
            locale={locale}
            className="bg-[#FF6B00] text-white px-6 py-3.5 rounded-xl font-bold text-sm shadow-[0_4px_16px_rgba(255,107,0,0.3)] hover:bg-[#E05E00] transition-all flex items-center gap-2 shrink-0"
          >
            {t(locale, "Acquista Ora →", "Buy Now →")}
          </TrackedCtaButton>
        </div>
      </div>

      {/* ================================================================ */}
      {/* HERO */}
      {/* ================================================================ */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden pb-16 md:pb-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#FFF8F0] via-white to-[#FFF3EB] opacity-60" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#FF6B00]/[0.03] to-transparent" />
        <div className="absolute top-20 right-20 w-64 h-64 rounded-full bg-[#FF6B00]/[0.04] blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 rounded-full bg-[#FF6B00]/[0.03] blur-3xl" />

        <div className="relative w-full max-w-[1200px] mx-auto px-6 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* ── Left: Mockup ── */}
            <div className="order-2 lg:order-1">
              <div className="relative w-full max-w-[320px] sm:max-w-[380px] mx-auto group perspective-[1500px]">
                {/* 3D Book Cover */}
                <div className="relative aspect-[3/4.2] transition-all duration-700 group-hover:-translate-y-2"
                     style={{ transform: "rotateY(-8deg) rotateX(4deg)", transformStyle: "preserve-3d" }}>
                  <div className="absolute -left-4 top-[3%] bottom-[3%] w-8 bg-gradient-to-r from-[#e8e8e8] to-[#fafafa] rounded-l-lg border border-black/5"
                       style={{ transform: "rotateY(85deg) translateZ(-1px)" }} />
                  <div className="w-full h-full rounded-2xl overflow-hidden border border-black/10 shadow-[0_20px_60px_rgba(255,107,0,0.15)]">
                    {data.coverUrl ? (
                      <img src={data.coverUrl} alt={data.titolo ?? ""} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#FFF3EB] to-white flex items-center justify-center p-8">
                        <BookOpen className="w-12 h-12 text-[#FF6B00]/40 mx-auto" />
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-6 left-[10%] right-[10%] h-6 bg-black/5 blur-xl rounded-full" />
                </div>
                {/* Badge flottante "Best Seller" */}
                <div className="absolute -top-3 -right-3 bg-[#FF6B00] text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg animate-pulse flex items-center gap-1.5">
                  <Award className="w-3 h-3" />
                  Best Seller
                </div>
              </div>
            </div>

            {/* ── Right: Content ── */}
            <div className="order-1 lg:order-2 space-y-6 max-w-xl">
              {/* Social proof */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-[#FF6B00] text-[#FF6B00]" />
                  ))}
                </div>
                <span className="text-sm font-bold text-[#1A1A1A]">4.8/5</span>
                <span className="text-sm text-[#6B7280]">— {t(locale, "1,247 lettori", "1,247 readers")}</span>
              </div>

              {/* Title */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05]">
                {data.titolo}
              </h1>

              {/* Subtitle */}
              <p className="text-lg sm:text-xl text-[#4A4A4A] font-medium leading-relaxed">
                {data.sottotitolo}
              </p>

              {/* Story / Hook */}
              {data.storia && (
                <p className="text-base text-[#6B7280] leading-relaxed border-l-4 border-[#FF6B00]/30 pl-5 italic">
                  &ldquo;{data.storia.split("\n")[0] || data.storia}&rdquo;
                </p>
              )}

              {/* CTA + Secondary */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <TrackedCtaButton
                  href={checkoutUrl}
                  productSlug={productSlug ?? ""}
                  productId={productId}
                  locale={locale}
                  className="bg-[#FF6B00] text-white px-10 py-5 rounded-xl font-bold text-lg shadow-[0_8px_28px_rgba(255,107,0,0.25)] hover:bg-[#E05E00] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group"
                >
                  {t(locale, "Acquista Ora —", "Buy Now —")} {data.prezzo ?? ""}
                </TrackedCtaButton>
                <a href="#benefits" className="bg-white text-[#1A1A1A] border-2 border-[#EAEAEA] px-8 py-5 rounded-xl font-bold hover:bg-[#FAFAFA] transition-all flex items-center justify-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  {t(locale, "Scopri i Moduli", "View Modules")}
                </a>
              </div>

              {/* Payment Icons + Secure */}
              <div className="flex items-center gap-4 flex-wrap pt-2">
                <div className="flex items-center gap-2 text-[#6B7280]">
                  {[CreditCard, Smartphone, DollarSign].map((Icon, i) => (
                    <div key={i} className="w-8 h-8 rounded-lg border border-[#EAEAEA] flex items-center justify-center bg-white">
                      <Icon className="w-4 h-4" />
                    </div>
                  ))}
                </div>
                <span className="text-xs text-[#6B7280] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#059669]" />
                  {t(locale, "Pagamento sicuro SSL", "Secure SSL payment")}
                </span>
              </div>

              {/* Trust badges */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#EAEAEA]">
                {[
                  { icon: Check, label: t(locale, "Download Immediato", "Instant Download") },
                  { icon: Shield, label: t(locale, "Accesso a Vita", "Lifetime Access") },
                  { icon: Star, label: t(locale, "30 Giorni Garanzia", "30-Day Guarantee") },
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0">
                      <b.icon className="w-3.5 h-3.5 text-[#FF6B00]" />
                    </div>
                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.03em] leading-tight">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* PER CHI È / NON PER CHI È */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "// 01 — Per Chi È", "// 01 — Who Is This For")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t(locale, "Questo corso fa per te?", "Is This Course For You?")}
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Per chi è */}
            <div className="bg-white rounded-3xl p-8 lg:p-10 border border-[#EAEAEA] shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#059669]/10 flex items-center justify-center">
                  <ThumbsUp className="w-5 h-5 text-[#059669]" />
                </div>
                <h3 className="text-lg font-black">
                  {t(locale, "Perfetto per te se:", "Perfect for you if:")}
                </h3>
              </div>
              <ul className="space-y-4">
                {[
                  t(locale, "Fai fatica ad arrivare a fine mese", "You struggle to make ends meet"),
                  t(locale, "Vuoi tagliare le spese senza sacrificare la qualità della vita", "You want to cut costs without sacrificing quality of life"),
                  t(locale, "Sei stanco di vivere con la cultura del consumo e del debito", "You're tired of the consumerism and debt culture"),
                  t(locale, "Cerchi metodi pratici, testati da secoli", "You want practical, time-tested methods"),
                  t(locale, "Vuoi costruire un futuro finanziario solido per la tua famiglia", "You want to build a solid financial future for your family"),
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-[#059669] shrink-0 mt-0.5" strokeWidth={3} />
                    <span className="text-sm font-medium text-[#4A4A4A]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Non per chi è */}
            <div className="bg-white rounded-3xl p-8 lg:p-10 border border-[#EAEAEA] shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#DC2626]/10 flex items-center justify-center">
                  <X className="w-5 h-5 text-[#DC2626]" />
                </div>
                <h3 className="text-lg font-black">
                  {t(locale, "Non fa per te se:", "Not for you if:")}
                </h3>
              </div>
              <ul className="space-y-4">
                {[
                  t(locale, "Cerchi schemi per diventare milionario in una settimana", "You're looking for get-rich-quick schemes"),
                  t(locale, "Non vuoi cambiare le tue abitudini di spesa", "You don't want to change your spending habits"),
                  t(locale, "Preferisci soluzioni rapide invece di un percorso solido", "You prefer quick fixes over a solid foundation"),
                  t(locale, "Non sei disposto a mettere in pratica ciò che impari", "You're not willing to implement what you learn"),
                  t(locale, "Cerchi consulenza finanziaria personalizzata", "You're looking for personalized financial advice"),
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <X className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" strokeWidth={3} />
                    <span className="text-sm font-medium text-[#6B7280]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* WHAT YOU'LL LEARN — 8 Benefits */}
      {/* ================================================================ */}
      <section id="benefits" className="py-20 lg:py-24 px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "// 02 — Cosa Imparerai", "// 02 — What You'll Learn")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t(locale, "I Segreti dei Maestri Amish", "The Amish Masters' Secrets")}
            </h2>
            <p className="mt-4 text-lg text-[#6B7280] max-w-2xl mx-auto">
              {t(locale,
                "8 moduli pratici che trasformano la saggezza Amish in azioni concrete per la tua vita quotidiana.",
                "8 practical modules that turn Amish wisdom into concrete actions for your daily life."
              )}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {benefits.map((b, i) => {
              const iconConfig = FEATURE_ICONS[i % FEATURE_ICONS.length];
              const Icon = iconConfig.icon;
              return (
                <div
                  key={i}
                  className="group bg-white rounded-2xl p-6 border border-[#EAEAEA] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col"
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: `${iconConfig.color}12` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: iconConfig.color }} />
                  </div>
                  <h3 className="text-base font-bold mb-2">{b.title}</h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed flex-1">{b.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* AUTHOR / CREDIBILITÀ (placeholder) */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "// 03 — L'Autore", "// 03 — The Author")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t(locale, "Chi c'è dietro questo corso", "Behind This Course")}
            </h2>
          </div>

          <div className="bg-white rounded-3xl p-8 lg:p-12 border border-[#EAEAEA] shadow-sm">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 text-center sm:text-left">
              {/* Foto placeholder — SOSTITUISCI CON FOTO REALE */}
              <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-[#FFF3EB] to-[#FF6B00]/10 flex items-center justify-center shrink-0 border-2 border-[#FF6B00]/20">
                <Users className="w-10 h-10 text-[#FF6B00]/40" />
                {/* <img src="/autore.jpg" alt="Nome Autore" className="w-full h-full object-cover rounded-2xl" /> */}
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-black mb-2">
                  {t(locale, "Il Tuo Nome Qui", "Your Name Here")}
                </h3>
                <p className="text-sm text-[#FF6B00] font-bold uppercase tracking-wider mb-4">
                  {t(locale, "Ricercatore · Autore", "Researcher · Author")}
                </p>
                <p className="text-sm text-[#6B7280] leading-relaxed">
                  {t(locale,
                    "[Aggiungi qui la tua storia: ho vissuto 3 mesi in Pennsylvania, intervistato 12 famiglie Amish, studiato il loro sistema economico. Nessuna teoria, solo pratiche.]",
                    "[Add your story here: I lived 3 months in Pennsylvania, interviewed 12 Amish families, studied their economic system. No theory, only practice.]"
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* WHAT'S INSIDE (Chapter Previews) */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "// 04 — Contenuto del Corso", "// 04 — Course Content")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t(locale, "Cosa Troverai Dentro", "What You'll Find Inside")}
            </h2>
          </div>

          <div className="space-y-3">
            {benefits.slice(0, 8).map((b, i) => (
              <div key={i} className="flex items-start gap-5 p-5 rounded-2xl border border-[#EAEAEA] hover:bg-[#FAFAFA] transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-[#FFF3EB] flex items-center justify-center shrink-0 font-bold text-[#FF6B00] group-hover:scale-110 transition-transform">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm mb-0.5">{b.title}</h3>
                  <p className="text-sm text-[#6B7280]">{b.desc}</p>
                </div>
                <div className="hidden sm:flex w-7 h-7 rounded-full bg-[#FFF3EB] items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="w-3.5 h-3.5 text-[#FF6B00]" />
                </div>
              </div>
            ))}
          </div>

          {/* What you get */}
          <div className="mt-10 bg-[#FAFAFA] rounded-3xl p-8 border border-[#EAEAEA]">
            <h3 className="font-bold text-lg mb-5">
              {t(locale, "Include anche:", "Also includes:")}
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                t(locale, "eBook completo (PDF, ePub, Kindle)", "Full eBook (PDF, ePub, Kindle)"),
                t(locale, "Checklist stampabile 30 giorni", "Printable 30-day checklist"),
                t(locale, "Foglio Excel budget Amish", "Amish budget Excel sheet"),
                t(locale, "Lista della spesa settimanale", "Weekly shopping list template"),
                t(locale, "Accesso a vita all'area riservata", "Lifetime member area access"),
                t(locale, "Aggiornamenti gratuiti futuri", "Free future updates"),
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-[#FF6B00]" strokeWidth={3} />
                  </div>
                  <span className="text-sm text-[#4A4A4A]">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* PRICING — Value Stack */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6 bg-[#FFF8F0] border-y border-[#EAEAEA]">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "// 05 — Offerta", "// 05 — The Offer")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t(locale, "Investi in Te Stesso", "Invest in Yourself")}
            </h2>
          </div>

          <div className="max-w-[520px] mx-auto">
            <div className="relative bg-white rounded-3xl border-2 border-[#FF6B00]/20 shadow-[0_8px_40px_rgba(255,107,0,0.08)] p-8 lg:p-10">
              {/* Badge */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-5 py-1.5 bg-[#FF6B00] text-white rounded-full text-xs font-bold uppercase tracking-wider shadow-lg whitespace-nowrap">
                <Zap className="w-3.5 h-3.5" />
                {t(locale, "Offerta di Lancio", "Launch Offer")}
              </div>

              <div className="mt-6 text-center">
                <p className="text-sm font-bold text-[#6B7280] uppercase tracking-widest mb-4">
                  {t(locale, "Pacchetto Completo", "Complete Package")}
                </p>

                {/* Value Stack */}
                <div className="space-y-1 mb-5">
                  <div className="text-sm text-[#6B7280] line-through">
                    {t(locale, "Corso: €97", "Course: $97")}
                  </div>
                  <div className="text-sm text-[#6B7280] line-through">
                    {t(locale, "Bonus: €27", "Bonus: $27")}
                  </div>
                  <div className="w-16 h-0.5 bg-[#FF6B00]/30 mx-auto my-3" />
                </div>

                {/* Price */}
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-6xl font-black tracking-tighter">{data.prezzo}</span>
                </div>
                <p className="mt-1 text-sm text-[#6B7280] font-medium">
                  {t(locale, "Pagamento unico — nessun abbonamento", "One-time payment — no subscription")}
                </p>

                {/* Urgency */}
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-[#FFF3EB] rounded-full border border-[#FF6B00]/10">
                  <Clock className="w-3.5 h-3.5 text-[#FF6B00]" />
                  <span className="text-[11px] font-bold text-[#E05E00] uppercase tracking-wider">
                    {t(locale, "Prezzo lancio — poi €37", "Launch price — then $37")}
                  </span>
                </div>

                {/* What's included */}
                <ul className="mt-6 space-y-3 text-left max-w-sm mx-auto">
                  {[
                    t(locale, "Corso completo (valore €97)", "Full course (value $97)"),
                    t(locale, "eBook PDF, ePub, Kindle", "eBook PDF, ePub, Kindle"),
                    t(locale, "Checklist 30 giorni stampabile", "Printable 30-day checklist"),
                    t(locale, "Foglio Excel budget Amish", "Amish budget Excel sheet"),
                    t(locale, "Accesso a vita + aggiornamenti", "Lifetime access + updates"),
                    t(locale, "BONUS: Lista spesa settimanale (valore €27)", "BONUS: Weekly shopping list (value $27)"),
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-[#FF6B00]" strokeWidth={3} />
                      </div>
                      <span className="text-sm text-[#4A4A4A]">{item}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="mt-7">
                  <TrackedCtaButton
                    href={checkoutUrl}
                    productSlug={productSlug ?? ""}
                    productId={productId}
                    locale={locale}
                    className="w-full bg-[#FF6B00] hover:bg-[#E05E00] text-white py-5 rounded-2xl font-black text-base uppercase tracking-widest transition-all shadow-[0_8px_32px_rgba(255,107,0,0.3)] hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    {t(locale, "Sblocca Accesso Ora", "Unlock Access Now")}
                  </TrackedCtaButton>
                </div>

                {/* Guarantee */}
                <div className="mt-6 bg-[#FFF3EB] rounded-2xl p-5 border border-[#FF6B00]/15">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Shield className="w-5 h-5 text-[#059669]" />
                    <span className="font-black text-sm uppercase tracking-wider">
                      {t(locale, "Garanzia Soddisfatti o Rimborsati", "30-Day Money-Back Guarantee")}
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280] leading-relaxed">
                    {t(locale,
                      "Provalo per 30 giorni. Se non risparmi almeno €100, ti rimborsiamo l'intero importo. Nessuna domanda, nessuna scadenza.",
                      "Try it for 30 days. If you don't save at least $100, we'll refund the full amount. No questions, no hassle."
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* TESTIMONIAL */}
      {/* ================================================================ */}
      {data.recensioni && data.recensioni !== data.storia && (
        <section className="py-20 lg:py-24 bg-white px-6">
          <div className="max-w-[800px] mx-auto text-center">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "// 06 — Testimonianze", "// 06 — Testimonials")}
            </span>
            <div className="relative">
              <Quote className="w-10 h-10 text-[#FF6B00]/15 mx-auto mb-4" />
              <blockquote className="text-xl sm:text-2xl font-bold leading-relaxed tracking-tight">
                &ldquo;{data.recensioni}&rdquo;
              </blockquote>
            </div>
            <div className="mt-6 flex items-center justify-center gap-3">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-[#FF6B00] text-[#FF6B00]" />
                ))}
              </div>
            </div>
            <p className="mt-3 text-sm text-[#6B7280]">
              — {t(locale, "Marco R., primi lettori", "Marco R., early reader")}
            </p>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* FAQ */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
        <div className="max-w-[700px] mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "// 07 — FAQ", "// 07 — FAQ")}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
              {t(locale, "Domande Frequenti", "Frequently Asked Questions")}
            </h2>
          </div>

          <div className="space-y-2">
            {faqItems.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#EAEAEA] overflow-hidden transition-shadow hover:shadow-sm">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left"
                >
                  <span className="font-bold text-sm pr-4">{faq.q}</span>
                  <div className={`w-6 h-6 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`}>
                    <ChevronRight className="w-3.5 h-3.5 text-[#FF6B00]" />
                  </div>
                </button>
                <div className={`grid transition-all duration-300 ${openFaq === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <div className="px-6 pb-4 text-sm text-[#6B7280] leading-relaxed">{faq.a}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FINAL CTA */}
      {/* ================================================================ */}
      <section className="py-28 lg:py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#0B0B0C]" />
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: `radial-gradient(circle at 30% 20%, #FF6B00 0%, transparent 50%), radial-gradient(circle at 70% 80%, #FF6B00 0%, transparent 50%)` }}
        />

        <div className="relative z-10 max-w-[700px] mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full mb-8">
            <CalendarCheck className="w-4 h-4 text-[#FF6B00]" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {t(locale, "Offerta valida questa settimana", "Offer valid this week")}
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.1] mb-6">
            {t(locale,
              "Inizia oggi il tuo percorso verso la libertà finanziaria",
              "Start Your Journey to Financial Freedom Today"
            )}
          </h2>

          <p className="text-lg text-gray-400 mb-10 max-w-lg mx-auto">
            {t(locale,
              "Unisciti a centinaia di persone che hanno già trasformato il loro rapporto con il denaro.",
              "Join hundreds of people who have already transformed their relationship with money."
            )}
          </p>

          <TrackedCtaButton
            href={checkoutUrl}
            productSlug={productSlug ?? ""}
            productId={productId}
            locale={locale}
            className="inline-flex items-center gap-3 bg-[#FF6B00] hover:bg-[#E05E00] text-white px-12 py-5 rounded-2xl font-black text-lg tracking-wide transition-all shadow-[0_8px_32px_rgba(255,107,0,0.35)] hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(255,107,0,0.45)]"
          >
            {t(locale, "Sblocca Accesso —", "Unlock Access —")} {data.prezzo ?? ""}
          </TrackedCtaButton>

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
      <footer className="py-8 border-t border-[#EAEAEA] bg-white">
        <div className="max-w-[1120px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-[#6B7280] font-medium">
          <div>&copy; {new Date().getFullYear()} Courssy — {t(locale, "Tutti i diritti riservati.", "All rights reserved.")}</div>
          <div className="flex gap-6">
            <a href="/privacy" className="hover:text-[#1A1A1A] transition-colors">{t(locale, "Privacy", "Privacy")}</a>
            <a href="/terms" className="hover:text-[#1A1A1A] transition-colors">{t(locale, "Termini", "Terms")}</a>
          </div>
        </div>
      </footer>

      {/* Spacer for sticky mobile CTA */}
      <div className="h-20 md:h-0" />
    </div>
  );
}
