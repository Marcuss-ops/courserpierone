"use client";

import React, { useState } from "react";
import {
  ChevronRight, Check, BookOpen,
  DollarSign, Leaf, Shield, Star, Clock,
  Users, TrendingUp, PiggyBank, Home, Heart,
  Zap, Award, Quote, ThumbsUp, X, Wrench,
  CalendarCheck, Smartphone, CreditCard, Lock,
  Camera, ArrowRight
} from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import LanguageSelector from "@/components/funnel/language-selector";

interface BookClaudeProps {
  data: {
    titolo?: string;
    sottotitolo?: string;
    problema?: string;
    storia?: string;
    recensioni?: string;
    cta?: string;
    prezzo?: string;
    currency?: string;
    coverUrl?: string;
    lezioni?: { titolo: string; descrizione: string }[];
    /** UI translations from DB (labels + benefits + faq) */
    ui?: {
      labels: Record<string, string>;
      benefits: { title: string; desc: string }[];
      faq: { q: string; a: string }[];
    };
  };
  locale?: string;
  productId?: string;
  productSlug?: string;
  checkoutUrl?: string;
}

// ─── Last-resort English fallback labels ────────────
const FALLBACK_LABELS = {
  instant_access: "Instant access",
  buy_now_arrow: "Buy Now →",
  readers: "1,247+ lettori",
  buy_now_dash: "Buy Now —",
  view_modules: "View Modules",
  ssl_secure: "Pagamento sicuro SSL",
  instant_download: "Download Immediato",
  lifetime_access: "Accesso a Vita",
  guarantee_days: "30 Giorni Garanzia",
  section_who: "// 01 — Per Chi È",
  is_this_for_you: "Questo corso fa per te?",
  perfect_for: "Perfetto per te se:",
  p_struggle: "Fai fatica ad arrivare a fine mese",
  p_cut_costs: "Vuoi tagliare le spese senza sacrificare la qualità della vita",
  p_consumerism: "Sei stanco di vivere con la cultura del consumo e del debito",
  p_practical: "Cerchi metodi pratici, testati da secoli",
  p_future: "Vuoi costruire un futuro finanziario solido per la tua famiglia",
  not_for: "Non fa per te se:",
  n_quick: "Cerchi schemi per diventare milionario in una settimana",
  n_habits: "Non vuoi cambiare le tue abitudini di spesa",
  n_quick_fix: "Preferisci soluzioni rapide invece di un percorso solido",
  n_implement: "Non sei disposto a mettere in pratica ciò che impari",
  n_advice: "Cerchi consulenza finanziaria personalizzata",
  section_learn: "// 02 — Cosa Imparerai",
  masters_secrets: "I Segreti dei Maestri Amish",
  modules_desc: "8 moduli pratici che trasformano la saggezza Amish in azioni concrete per la tua vita quotidiana.",
  section_author: "// 03 — L'Autore",
  behind_course: "Chi c'è dietro questo corso",
  your_name: "Alessandro Rinaldi",
  researcher_author: "Ricercatore · Autore · Viaggiatore",
  author_bio: "Ho vissuto 3 mesi in Pennsylvania, intervistato 12 famiglie Amish e studiato il loro sistema economico. Nessuna teoria — solo pratiche testate sul campo che ho applicato per trasformare la mia vita finanziaria.",
  section_content: "// 04 — Contenuto del Corso",
  what_inside: "Cosa Troverai Dentro",
  also_includes: "Include anche:",
  inc_full_ebook: "eBook completo (PDF, ePub, Kindle)",
  inc_checklist: "Checklist stampabile 30 giorni",
  inc_excel: "Foglio Excel budget Amish",
  inc_shopping: "Lista della spesa settimanale",
  inc_lifetime: "Accesso a vita all'area riservata",
  inc_updates: "Aggiornamenti gratuiti futuri",
  section_offer: "// 05 — Offerta",
  invest_yourself: "Investi in Te Stesso",
  launch_offer: "Offerta di Lancio",
  complete_package: "Pacchetto Completo",
  course_value: "Corso: €97",
  bonus_value: "Bonus: €27",
  one_time: "Pagamento unico — nessun abbonamento",
  launch_price: "Prezzo lancio — poi €37",
  inc_course_full: "Corso completo (valore €97)",
  inc_ebook: "eBook PDF, ePub, Kindle",
  inc_checklist2: "Checklist 30 giorni stampabile",
  inc_excel2: "Foglio Excel budget Amish",
  inc_access_updates: "Accesso a vita + aggiornamenti",
  inc_bonus_shopping: "BONUS: Lista spesa settimanale (valore €27)",
  unlock_now: "Sblocca Accesso Ora",
  guarantee_title: "Garanzia Soddisfatti o Rimborsati",
  guarantee_text: "Provalo per 30 giorni. Se non risparmi almeno €100, ti rimborsiamo l'intero importo. Nessuna domanda, nessuna scadenza.",
  section_testimonials: "// 06 — Testimonianze",
  reviewer: "Marco R., primi lettori",
  testimonial_text: "I applied the Amish budget method and in two months I cut my expenses by 35%. The 30-day checklist was the turning point. Finally a course that really works.",
  testimonial_name: "Marco R.",
  testimonial_role: "Rome — early readers",
  section_faq: "// 07 — FAQ",
  faq_title: "Domande Frequenti",
  offer_valid: "Offerta valida questa settimana",
  final_cta: "Inizia oggi il tuo percorso verso la libertà finanziaria",
  final_sub: "Unisciti a centinaia di persone che hanno già trasformato il loro rapporto con il denaro.",
  unlock_dash: "Sblocca Accesso —",
  guarantee_badge: "30 Giorni Soddisfatti",
  instant_access_badge: "Accesso Istantaneo",
  lifetime_badge: "Aggiornamenti a Vita",
  rights_reserved: "Tutti i diritti riservati.",
  privacy: "Privacy",
  terms: "Termini",
  legal_note: "This is a digital informational product. Results may vary and depend on personal commitment. The Amish prices and techniques described are based on ethnographic research and may not accurately reflect the contemporary practices of all Amish communities.",
} as const;

type LabelKey = keyof typeof FALLBACK_LABELS;

// ─── Benefits icons ──
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

// ─── Story Images ──
const STORY_IMAGES = [
  "/images/amish-storia-1.png",
  "/images/amish-storia-2.png",
  "/images/amish-storia-3.png",
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

  const labels = data.ui?.labels ?? {};
  const benefits = data.ui?.benefits ?? [];
  const faqItems = data.ui?.faq ?? [];

  const hasBenefits = benefits.length > 0;
  const hasFaq = faqItems.length > 0;

  const t = (key: LabelKey): string => labels[key] ?? FALLBACK_LABELS[key] ?? key;

  return (
    <div className="min-h-screen bg-white text-[#1A1A1A] font-sans selection:bg-[#FF6B00]/20 antialiased">
      {/* ================================================================ */}
      {/* STICKY MOBILE CTA BAR */}
      {/* ================================================================ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#EAEAEA] p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-black tracking-tight">{data.prezzo}</div>
            <div className="text-[10px] text-[#6B7280] font-medium">{t("instant_access")}</div>
          </div>
          <TrackedCtaButton
            href={checkoutUrl}
            productSlug={productSlug ?? ""}
            productId={productId}
            locale={locale}
            className="bg-[#FF6B00] text-white px-6 py-3.5 rounded-xl font-bold text-sm shadow-[0_4px_16px_rgba(255,107,0,0.3)] hover:bg-[#E05E00] transition-all flex items-center gap-2 shrink-0"
          >
            {t("buy_now_arrow")}
          </TrackedCtaButton>
        </div>
      </div>

      {/* ── Language Selector ── */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSelector currentLocale={locale ?? "en"} productSlug={productSlug ?? ""} />
      </div>

      {/* ================================================================ */}
      {/* HERO — Più chiaro, diretto, con prezzo visibile */}
      {/* ================================================================ */}
      <section className="relative min-h-[85vh] flex items-center overflow-hidden pb-16 md:pb-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#FFF8F0] via-white to-[#FFF3EB] opacity-70" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#FF6B00]/[0.03] to-transparent" />
        <div className="absolute top-20 right-20 w-80 h-80 rounded-full bg-[#FF6B00]/[0.04] blur-3xl" />
        <div className="absolute bottom-20 left-20 w-[500px] h-[500px] rounded-full bg-[#FF6B00]/[0.03] blur-3xl" />

        <div className="relative w-full max-w-[1200px] mx-auto px-6 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* ── Left: Content (order 2 on mobile) ── */}
            <div className="order-2 lg:order-1 space-y-6 max-w-xl">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#FF6B00]/10 border border-[#FF6B00]/20 rounded-full">
                <Award className="w-3.5 h-3.5 text-[#FF6B00]" />
                <span className="text-[11px] font-bold text-[#E05E00] uppercase tracking-wider">
                  {t("readers")}
                </span>
              </div>

              {/* Title */}
              <h1 className="text-4xl sm:text-5xl lg:text-[56px] font-black tracking-tight leading-[1.05]">
                {data.titolo}
              </h1>

              {/* Subtitle */}
              <p className="text-lg sm:text-xl text-[#4A4A4A] font-medium leading-relaxed">
                {data.sottotitolo}
              </p>

              {/* Price block */}
              <div className="flex items-baseline gap-3">
                <span className="text-5xl font-black tracking-tighter">{data.prezzo}</span>
                <span className="text-sm text-[#6B7280] font-medium">{t("one_time")}</span>
              </div>

              {/* CTA + Secondary */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <TrackedCtaButton
                  href={checkoutUrl}
                  productSlug={productSlug ?? ""}
                  productId={productId}
                  locale={locale}
                  className="bg-[#FF6B00] text-white px-10 py-5 rounded-xl font-bold text-base shadow-[0_8px_28px_rgba(255,107,0,0.25)] hover:bg-[#E05E00] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group"
                >
                  {t("buy_now_dash")} {data.prezzo ?? ""}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </TrackedCtaButton>
                <a href="#benefits" className="bg-white text-[#1A1A1A] border-2 border-[#EAEAEA] px-8 py-5 rounded-xl font-bold hover:bg-[#FAFAFA] transition-all flex items-center justify-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  {t("view_modules")}
                </a>
              </div>

              {/* Trust badges */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#EAEAEA]">
                {[
                  { icon: Check, label: t("instant_download") },
                  { icon: Shield, label: t("lifetime_access") },
                  { icon: Star, label: t("guarantee_days") },
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

            {/* ── Right: Cover image ── */}
            <div className="order-1 lg:order-2">
              <div className="relative w-full max-w-[380px] mx-auto group perspective-[1500px]">
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
                {/* Badge flottante */}
                <div className="absolute -top-3 -right-3 bg-[#FF6B00] text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg animate-pulse flex items-center gap-1.5">
                  <Award className="w-3 h-3" />
                  Best Seller
                </div>
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
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">{t("section_who")}</span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">{t("is_this_for_you")}</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-3xl p-8 lg:p-10 border border-[#EAEAEA] shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#059669]/10 flex items-center justify-center">
                  <ThumbsUp className="w-5 h-5 text-[#059669]" />
                </div>
                <h3 className="text-lg font-black">{t("perfect_for")}</h3>
              </div>
              <ul className="space-y-4">
                {[t("p_struggle"), t("p_cut_costs"), t("p_consumerism"), t("p_practical"), t("p_future")].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-[#059669] shrink-0 mt-0.5" strokeWidth={3} />
                    <span className="text-sm font-medium text-[#4A4A4A]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-3xl p-8 lg:p-10 border border-[#EAEAEA] shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#DC2626]/10 flex items-center justify-center">
                  <X className="w-5 h-5 text-[#DC2626]" />
                </div>
                <h3 className="text-lg font-black">{t("not_for")}</h3>
              </div>
              <ul className="space-y-4">
                {[t("n_quick"), t("n_habits"), t("n_quick_fix"), t("n_implement"), t("n_advice")].map((item, i) => (
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
      {/* LA STORIA — Con 3 immagini Gemini */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">// La Storia Vera</span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-4">
              La mia esperienza tra gli Amish
            </h2>
            <p className="text-lg text-[#6B7280] max-w-2xl mx-auto">
              Tre mesi in Pennsylvania, dodici famiglie intervistate, un sistema economico che funziona da 300 anni.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {STORY_IMAGES.map((src, i) => (
              <div key={i} className="group relative overflow-hidden rounded-3xl border border-[#EAEAEA] shadow-sm hover:shadow-lg transition-all duration-500">
                <div className="aspect-[4/3] overflow-hidden">
                  <img
                    src={src}
                    alt={`Vita Amish ${i + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                <div className="p-4 bg-white">
                  <p className="text-sm text-[#6B7280] leading-relaxed">
                    {[
                      "La vita quotidiana nella comunità Amish: semplicità, autosufficienza e saggezza finanziaria tramandata da generazioni.",
                      "Il sistema di baratto e scambio che elimina il bisogno di denaro contante e costruisce relazioni di fiducia durature.",
                      "L'economia domestica Amish: come una famiglia riesce a vivere con il 60% in meno rispetto alla media nazionale."
                    ][i]}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-[#FAFAFA] rounded-3xl p-8 lg:p-10 border border-[#EAEAEA]">
            <blockquote className="text-base sm:text-lg text-[#4A4A4A] leading-relaxed italic border-l-4 border-[#FF6B00] pl-6">
              &ldquo;{data.storia || t("author_bio")}&rdquo;
            </blockquote>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* AUTHOR — Sezione Autore Credibile */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">{t("section_author")}</span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">{t("behind_course")}</h2>
          </div>
          <div className="bg-white rounded-3xl p-8 lg:p-12 border border-[#EAEAEA] shadow-sm">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 text-center sm:text-left">
              <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-[#FF6B00] to-[#E05E00] flex items-center justify-center shrink-0 border-2 border-[#FF6B00]/20 shadow-lg">
                <Camera className="w-10 h-10 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-black mb-1">{t("your_name")}</h3>
                <p className="text-sm text-[#FF6B00] font-bold uppercase tracking-wider mb-4">{t("researcher_author")}</p>
                <p className="text-sm text-[#6B7280] leading-relaxed">{t("author_bio")}</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {["Antropologia Economica", "Studi Amish", "Consulenza Finanziaria"].map((tag, i) => (
                    <span key={i} className="text-[10px] font-bold text-[#FF6B00] bg-[#FFF3EB] px-3 py-1.5 rounded-full uppercase tracking-wider">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* BENEFITS / MODULES */}
      {/* ================================================================ */}
      {hasBenefits && (
      <section id="benefits" className="py-20 lg:py-24 px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">{t("section_learn")}</span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">{t("masters_secrets")}</h2>
            <p className="mt-4 text-lg text-[#6B7280] max-w-2xl mx-auto">{t("modules_desc")}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {benefits.map((b, i) => {
              const iconConfig = FEATURE_ICONS[i % FEATURE_ICONS.length];
              const Icon = iconConfig.icon;
              return (
                <div key={i} className="group bg-white rounded-2xl p-6 border border-[#EAEAEA] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: `${iconConfig.color}12` }}>
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
      )}

      {/* ================================================================ */}
      {/* TESTIMONIAL — Credibile */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
        <div className="max-w-[800px] mx-auto text-center">
          <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">{t("section_testimonials")}</span>
          <div className="relative">
            <Quote className="w-12 h-12 text-[#FF6B00]/15 mx-auto mb-4" />
            <blockquote className="text-xl sm:text-2xl font-bold leading-relaxed tracking-tight text-[#1A1A1A]">
              &ldquo;{t("testimonial_text")}&rdquo;
            </blockquote>
          </div>
          <div className="mt-6 flex items-center justify-center gap-1">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5 fill-[#FF6B00] text-[#FF6B00]" />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FF6B00] to-[#E05E00] flex items-center justify-center">
              <span className="text-white font-bold text-sm">M</span>
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-[#1A1A1A]">{t("testimonial_name")}</p>
              <p className="text-xs text-[#6B7280]">{t("testimonial_role")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* OFFERTA — €19 con Garanzia */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#FFF8F0] via-white to-[#FFF3EB]" />
        <div className="relative z-10 max-w-[900px] mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">{t("section_offer")}</span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">{t("invest_yourself")}</h2>
          </div>

          <div className="max-w-[520px] mx-auto">
            <div className="relative bg-white rounded-3xl border-2 border-[#FF6B00]/20 shadow-[0_8px_40px_rgba(255,107,0,0.08)] p-8 lg:p-10">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-5 py-1.5 bg-[#FF6B00] text-white rounded-full text-xs font-bold uppercase tracking-wider shadow-lg whitespace-nowrap">
                <Zap className="w-3.5 h-3.5" />
                {t("launch_offer")}
              </div>

              <div className="mt-6 text-center">
                <p className="text-sm font-bold text-[#6B7280] uppercase tracking-widest mb-4">{t("complete_package")}</p>

                <div className="space-y-1 mb-3">
                  <div className="text-sm text-[#6B7280] line-through">{t("course_value")}</div>
                  <div className="text-sm text-[#6B7280] line-through">{t("bonus_value")}</div>
                  <div className="w-16 h-0.5 bg-[#FF6B00]/30 mx-auto my-3" />
                </div>

                {/* Prezzo €19 */}
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-6xl font-black tracking-tighter">{data.prezzo}</span>
                </div>
                <p className="mt-1 text-sm text-[#6B7280] font-medium">{t("one_time")}</p>

                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-[#FFF3EB] rounded-full border border-[#FF6B00]/10">
                  <Clock className="w-3.5 h-3.5 text-[#FF6B00]" />
                  <span className="text-[11px] font-bold text-[#E05E00] uppercase tracking-wider">{t("launch_price")}</span>
                </div>

                <ul className="mt-6 space-y-3 text-left max-w-sm mx-auto">
                  {[t("inc_course_full"), t("inc_ebook"), t("inc_checklist2"), t("inc_excel2"), t("inc_access_updates"), t("inc_bonus_shopping")].map((item, i) => (
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
                    {t("unlock_now")} — {data.prezzo ?? ""}
                  </TrackedCtaButton>
                </div>

                {/* Garanzia 30 Giorni */}
                <div className="mt-6 bg-[#FFF3EB] rounded-2xl p-5 border border-[#FF6B00]/15">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Shield className="w-5 h-5 text-[#059669]" />
                    <span className="font-black text-sm uppercase tracking-wider">{t("guarantee_title")}</span>
                  </div>
                  <p className="text-xs text-[#6B7280] leading-relaxed">{t("guarantee_text")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FAQ */}
      {/* ================================================================ */}
      {hasFaq && (
      <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
        <div className="max-w-[700px] mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">{t("section_faq")}</span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">{t("faq_title")}</h2>
          </div>
          <div className="space-y-2">
            {faqItems.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#EAEAEA] overflow-hidden transition-shadow hover:shadow-sm">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left">
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
      )}

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
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{t("offer_valid")}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.1] mb-6">{t("final_cta")}</h2>
          <p className="text-lg text-gray-400 mb-10 max-w-lg mx-auto">{t("final_sub")}</p>
          <TrackedCtaButton
            href={checkoutUrl}
            productSlug={productSlug ?? ""}
            productId={productId}
            locale={locale}
            className="inline-flex items-center gap-3 bg-[#FF6B00] hover:bg-[#E05E00] text-white px-12 py-5 rounded-2xl font-black text-lg tracking-wide transition-all shadow-[0_8px_32px_rgba(255,107,0,0.35)] hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(255,107,0,0.45)]"
          >
            {t("unlock_dash")} {data.prezzo ?? ""}
          </TrackedCtaButton>
          <div className="mt-10 flex flex-wrap justify-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-2"><Shield className="w-4 h-4 text-[#059669]" />{t("guarantee_badge")}</span>
            <span className="flex items-center gap-2"><Zap className="w-4 h-4 text-[#FF6B00]" />{t("instant_access_badge")}</span>
            <span className="flex items-center gap-2"><Award className="w-4 h-4 text-[#FF6B00]" />{t("lifetime_badge")}</span>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FOOTER + NOTE LEGALI */}
      {/* ================================================================ */}
      <footer className="py-8 border-t border-[#EAEAEA] bg-white">
        <div className="max-w-[1120px] mx-auto px-6">
          {/* Note Legali */}
          <div className="mb-8 p-4 bg-[#FAFAFA] rounded-2xl border border-[#EAEAEA]">
            <div className="flex items-start gap-3">
              <Shield className="w-4 h-4 text-[#6B7280] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#6B7280] leading-relaxed">{t("legal_note")}</p>
            </div>
          </div>
          {/* Footer links */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-[#6B7280] font-medium">
            <div>&copy; {new Date().getFullYear()} Courssy &mdash; {t("rights_reserved")}</div>
            <div className="flex items-center gap-6">
              <div className="relative">
                <LanguageSelector currentLocale={locale ?? "en"} productSlug={productSlug ?? ""} />
              </div>
              <a href="/privacy" className="hover:text-[#1A1A1A] transition-colors">{t("privacy")}</a>
              <a href="/terms" className="hover:text-[#1A1A1A] transition-colors">{t("terms")}</a>
            </div>
          </div>
        </div>
      </footer>

      {/* Spacer for sticky mobile CTA */}
      <div className="h-20 md:h-0" />
    </div>
  );
}
