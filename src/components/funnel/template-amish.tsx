"use client";

import React, { useState } from "react";
import {
  ChevronDown, Check, Shield, Star, Clock, Lock,
  Leaf, Zap, ShoppingCart, CreditCard, BookOpen,
  Wrench, CalendarCheck, TrendingDown, Home, User,
} from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import LanguageSelector from "@/components/funnel/language-selector";

// ─── Brand Color: #C9840D (orange) used everywhere ──

// ─── Props ────────────────────────────────────────
interface AmishProps {
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
    author?: string;
    languages?: Record<string, { title: string }>;      testimonials?: { name: string; location: string; avatar: string; text: string }[];
      lezioni?: { titolo: string; descrizione: string }[];
      ui?: {
        labels: Record<string, string>;
        benefits: { title: string; desc: string }[];
        faq: { q: string; a: string }[];
        testimonials?: { name: string; location: string; avatar: string; text: string }[];
      };
      localeContent?: {
        ui?: { labels?: Record<string, string> };
        modules?: { items?: { title: string; desc: string }[] };
        faq?: { items?: { q: string; a: string }[] };
      };
    };
    locale?: string;
    productId?: string;
    productSlug?: string;
    checkoutUrl?: string;
}

// ─── Inline English fallback (last resort) ──────
// ─── Minimal inline English fallback (~2KB vs 188KB full file) ──────
const MODULE_ICONS = [ShoppingCart, Home, TrendingDown, Wrench, User, Leaf, Zap, CalendarCheck];


// ─── Animated Gradient Blob (reusable) ───────────
function GradientBlob({ className }: { className?: string }) {
  return <div className={`absolute rounded-full blur-[120px] pointer-events-none ${className}`} />;
}

// ─── Component ────────────────────────────────────
export default function TemplateAmish({ data, locale = "en", productId, productSlug, checkoutUrl }: AmishProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ── Resolve language from locale ("it-it" → "it") ──
  const lang = (locale ?? "en").split("-")[0];
  // Cast to any to access all localeContent fields (prop type is narrow for RSC serialization)
  const lc = data.localeContent as any;

  // ── Merge ALL localeContent into flat labels map ──
  const uiLabels: Record<string, string> = {
    // Hero
    hero_badge: lc?.hero?.badge ?? "",
    hero_subtitle: lc?.hero?.subtitle ?? "",
    hero_cta_prefix: lc?.hero?.cta ?? "",
    hero_no_sub: lc?.hero?.one_time_payment ?? "",
    hero_secure: "Pagamento sicuro",
    hero_readers: lc?.trust?.readers_count ?? "",
    hero_verified: "recensioni verificate",
    hero_no_sub_desc: lc?.hero?.one_time_payment ?? "",
    hero_trust_ssl: "SSL Sicuro",
    hero_trust_stripe: "Stripe",
    hero_trust_paypal: "PayPal",
    hero_trust_guarantee: lc?.offer?.guarantee_title ?? "",
    top_bar: lc?.hero?.cta ?? "",
    // Problem
    problem_title: lc?.problem?.title ?? "",
    problem_1_title: lc?.problem?.title ?? "",
    problem_1_text: lc?.problem?.text ?? "",
    problem_2_title: "",
    problem_2_text: "",
    problem_3_title: "",
    problem_3_text: "",
    // Author
    author_role: lc?.author?.role ?? "",
    author_title: lc?.author?.title ?? "",
    author_bio_1: lc?.author?.bio ?? "",
    // Modules
    modules_title: lc?.modules?.title ?? "",
    modules_desc: lc?.modules?.description ?? "",
    // Testimonials
    testimonials_title: lc?.testimonials?.title ?? "",
    testimonials_subtitle: "",
    // Includes
    whats_included_title: lc?.includes?.title ?? "",
    // Offer
    offer_badge: lc?.offer?.badge ?? "",
    offer_title: lc?.offer?.title ?? "",
    offer_original_price: lc?.offer?.course_value ?? "",
    offer_one_time: lc?.offer?.one_time ?? "",
    offer_launch_note: lc?.offer?.launch_price ?? "",
    offer_cta: lc?.offer?.cta ?? "",
    offer_stripe_paypal: "Stripe / PayPal",
    offer_invoice: "Fattura inclusa",
    guarantee_title: lc?.offer?.guarantee_title ?? "",
    guarantee_text: lc?.offer?.guarantee_text ?? "",
    // FAQ
    faq_title: lc?.faq?.title ?? "",
    // Final CTA
    final_cta_text: lc?.final_cta?.badge ?? lc?.offer?.cta ?? "",
    // Footer
    footer_project: "",
    footer_rights: lc?.footer?.rights_reserved ?? "",
    footer_email: "info@courssy.com",
    footer_privacy: lc?.footer?.privacy ?? "",
    footer_terms: lc?.footer?.terms ?? "",
    footer_cookies: "Cookie",
    footer_withdrawal: "Ritiro",
    footer_legal_note: lc?.footer?.legal_note ?? "",
    // Transform
    transform_title: "",
    transform_before_label: "",
    transform_before_1: "",
    transform_before_2: "",
    transform_before_3: "",
    transform_after_label: "",
    transform_after_1: "",
    transform_after_2: "",
    transform_after_3: "",
    transform_disclaimer: "",
    // Fallback: merge ui.labels from locale files
    ...lc?.ui?.labels,
    // Override with data.ui.labels from DB config
    ...data.ui?.labels,
  };

  const t = (key: string): string => uiLabels[key] ?? "";

  // Use translated product title from config
  const LOCALE_TITLE_MAP: Record<string, string> = {};
  if (data.languages) {
    for (const [localeKey, localeData] of Object.entries(data.languages)) {
      if (localeData?.title) LOCALE_TITLE_MAP[localeKey] = localeData.title;
    }
  }
  const PRODUCT_TITLE = LOCALE_TITLE_MAP[lang] ?? LOCALE_TITLE_MAP["en"] ?? data.titolo ?? "Course Title";

  // Structured data from localeContent
  const modules = lc?.modules?.items?.length ? lc.modules.items : data.ui?.benefits ?? [];
  const faqItems = lc?.faq?.items?.length ? lc.faq.items : data.ui?.faq ?? [];
  const includesItems = lc?.includes?.items ?? [];
  const testimonials = lc?.testimonials?.items?.map(tst => ({ name: tst.name, location: tst.role, avatar: "", text: tst.text })) ?? data.ui?.testimonials ?? [];
  const authorBio = lc?.author?.bio ?? "";
  const hasModules = modules.length > 0;
  const hasFaq = faqItems.length > 0;

  return (
    <div className="min-h-screen bg-[#FFFBF5] text-[#3C2F2F] font-sans antialiased" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* ── Global grain ── */}
      <div className="pointer-events-none fixed inset-0 z-[1] opacity-[0.025]"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />

      {/* ── Language Selector ── */}
      <div className="fixed top-4 right-4 z-50"><LanguageSelector currentLocale={locale ?? "en"} productSlug={productSlug ?? ""} availableLangs={data.languages ? Object.keys(data.languages) : undefined} /></div>

      {/* ── Sticky Mobile CTA ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#FFFBF5] border-t border-[#E8DCC9] p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-black tracking-tight text-[#3C2F2F]">{data.prezzo}</div>
            <div className="text-[10px] text-[#8A7B6B] font-medium">{lc?.hero?.one_time_payment || t("hero_no_sub")}</div>
          </div>
          <TrackedCtaButton href={checkoutUrl} productSlug={productSlug ?? ""} productId={productId} locale={locale}
            className="bg-[#C9840D] text-white px-6 py-3.5 rounded-xl font-bold text-sm shadow-[0_4px_16px_rgba(201,132,13,0.3)] hover:bg-[#B6750B] transition-all shrink-0">
            {t("hero_cta_prefix")} {data.prezzo ?? ""}
          </TrackedCtaButton>
        </div>
      </div>

      {/* ================================================================ */}
      {/* TOP BAR */}
      {/* ================================================================ */}
      <div className="bg-[#C9840D] text-white text-center text-sm py-2.5 px-4 relative z-10">
        <p className="font-medium">{t("top_bar")}</p>
      </div>

      {/* ================================================================ */}
      {/* HERO */}
      {/* ================================================================ */}
      <header className="relative overflow-hidden z-10">
        <GradientBlob className="w-[500px] h-[500px] bg-[#C9840D]/8 -top-40 -right-40 animate-[pulse_8s_ease-in-out_infinite]" />
        <GradientBlob className="w-[400px] h-[400px] bg-[#C9840D]/5 bottom-0 -left-40 animate-[pulse_10s_ease-in-out_infinite_2s]" />
        <div className="max-w-6xl mx-auto px-6 lg:px-8 pt-12 lg:pt-20 pb-16 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-[#C9840D]/10 px-3 py-1.5 rounded-full text-xs font-medium mb-6 border border-[#C9840D]/20">
                <span className="w-2 h-2 bg-[#C9840D] rounded-full animate-pulse" />
                {lc?.hero?.badge || t("hero_badge")}
              </div>
              <h1 className="text-[38px] leading-[1.1] md:text-5xl lg:text-[56px] font-semibold text-[#3C2F2F]"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                {PRODUCT_TITLE}
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-[#5A4E42] max-w-xl">{lc?.hero?.subtitle || t("hero_subtitle")}</p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <TrackedCtaButton href={checkoutUrl} productSlug={productSlug ?? ""} productId={productId} locale={locale}
                  className="inline-flex justify-center items-center px-7 py-4 bg-[#C9840D] hover:bg-[#B6750B] text-white font-semibold rounded-xl shadow-lg shadow-[#C9840D]/20 transition transform hover:-translate-y-0.5">
                  {lc?.hero?.cta || t("hero_cta_prefix")} {data.prezzo ?? "$19"}
                </TrackedCtaButton>
                <div className="flex items-center justify-center sm:justify-start gap-2 text-sm text-[#8A7B6B]">
                  <Shield className="w-4 h-4 text-[#C9840D]" /> {t("hero_secure")}
                </div>
              </div>

              <div className="mt-6 flex items-center gap-3">
                <div className="flex text-[#C9840D]">{[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-current" />)}</div>
                <p className="text-sm text-[#5A4E42]"><strong>{lc?.trust?.readers_count || t("hero_readers")}</strong> <span className="text-xs text-[#8A7B6B]">{t("hero_verified")}</span></p>
              </div>
            </div>

            {/* Cover image */}
            <div className="relative">
              <div className="relative rounded-[28px] overflow-hidden shadow-lg shadow-[#C9840D]/10">
                {data.coverUrl
                  ? <img src={data.coverUrl} alt={PRODUCT_TITLE} className="w-full h-[480px] object-cover" />
                  : <div className="w-full h-[480px] bg-gradient-to-br from-[#FFF8F0] to-[#F5EFE6] flex items-center justify-center"><BookOpen className="w-16 h-16 text-[#C9840D]/30" /></div>}
                <div className="absolute inset-0 bg-gradient-to-t from-[#3C2F2F]/40 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#C9840D]/15 flex items-center justify-center"><Shield className="w-5 h-5 text-[#C9840D]" /></div>
                  <div className="text-sm">
                    <p className="font-semibold text-[#3C2F2F] leading-tight">{lc?.hero?.one_time_payment || t("hero_no_sub")}</p>
                    <p className="text-[#8A7B6B] text-xs">{t("hero_no_sub_desc")}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trust badges */}
          <div className="mt-12 flex flex-wrap items-center justify-center lg:justify-start gap-6 opacity-80">
            <div className="flex items-center gap-2 text-xs font-medium"><Lock className="w-4 h-4 text-[#C9840D]" /> {t("hero_trust_ssl")}</div>
            <div className="flex items-center gap-2 text-xs font-semibold"><CreditCard className="w-4 h-4 text-[#C9840D]" /> {t("hero_trust_stripe")}</div>
            <div className="flex items-center gap-2 text-xs font-semibold"><CreditCard className="w-4 h-4 text-[#C9840D]" /> {t("hero_trust_paypal")}</div>
            <div className="flex items-center gap-2 text-xs font-medium"><Check className="w-4 h-4 text-[#C9840D]" /> {t("hero_trust_guarantee")}</div>
          </div>
        </div>
      </header>

      {/* ================================================================ */}
      {/* PROBLEM */}
      {/* ================================================================ */}
      <section className="py-16 lg:py-24 bg-[#FFFBF5] border-y border-[#F0E6D7] relative z-10 overflow-hidden">
        <GradientBlob className="w-[600px] h-[600px] bg-[#C9840D]/5 -top-60 right-0 animate-[pulse_12s_ease-in-out_infinite]" />
        <div className="max-w-5xl mx-auto px-6 relative">
          <h2 className="text-3xl md:text-4xl text-center mb-12 text-[#3C2F2F]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            {lc?.problem?.title || t("problem_title")}
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: <TrendingDown className="w-6 h-6 text-[#C9840D]" />, bg: "bg-[#C9840D]/10", title: t("problem_1_title"), text: t("problem_1_text") },
              { icon: <Zap className="w-6 h-6 text-[#C9840D]" />, bg: "bg-[#C9840D]/10", title: t("problem_2_title"), text: t("problem_2_text") },
              { icon: <Clock className="w-6 h-6 text-[#C9840D]" />, bg: "bg-[#C9840D]/10", title: t("problem_3_title"), text: t("problem_3_text") },
            ].map((item, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-md shadow-[#C9840D]/5 border border-[#F0E6D7]">
                <div className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center mb-4`}>{item.icon}</div>
                <h3 className="font-semibold mb-2 text-[#3C2F2F]">{item.title}</h3>
                <p className="text-[#5A4E42] text-[15px] leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* AUTHOR STORY */}
      {/* ================================================================ */}
      <section className="py-16 lg:py-24 relative z-10 overflow-hidden">
        <GradientBlob className="w-[500px] h-[500px] bg-[#C9840D]/5 top-20 -left-40 animate-[pulse_14s_ease-in-out_infinite_1s]" />
        <div className="max-w-5xl mx-auto px-6 relative">
          <div className="bg-white rounded-[32px] shadow-md shadow-[#C9840D]/5 p-8 md:p-12 grid md:grid-cols-[220px_1fr] gap-8 items-start border border-[#F0E6D7]">
            <div className="text-center md:text-left">
              <div className="w-40 h-40 mx-auto md:mx-0 rounded-2xl overflow-hidden bg-[#FFFBF5] border-2 border-[#C9840D]/20">
                <img src="/images/author-alessandro.png" alt={data.author || "Author"} className="w-full h-full object-cover" />
              </div>
              <p className="mt-4 text-xl font-semibold text-[#3C2F2F]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                {data.author || "The Author"}
              </p>                <p className="text-sm text-[#8A7B6B]">{lc?.author?.role || t("author_role")}</p>
            </div>
            <div>
              <h2 className="text-3xl mb-4 text-[#3C2F2F]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                {lc?.author?.title || t("author_title")}
              </h2>
              <div className="space-y-4 text-[#4A4035] leading-relaxed">
                <p>{authorBio || t("author_bio_1")}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 mt-6">
                {["/images/amish-storia-1.png", "/images/amish-storia-2.png", "/images/amish-storia-3.png"].map((src, i) => (
                  <div key={i} className="rounded-xl overflow-hidden aspect-[4/3] border border-[#F0E6D7]">
                    <img src={src} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* TRANSFORMATION */}
      {/* ================================================================ */}
      <section className="py-12 relative z-10 overflow-hidden">
        <GradientBlob className="w-[500px] h-[500px] bg-[#C9840D]/5 top-0 right-0 animate-[pulse_10s_ease-in-out_infinite_3s]" />
        <div className="max-w-4xl mx-auto px-6 relative">
          <div className="bg-[#C9840D]/5 border border-[#C9840D]/15 rounded-[28px] p-8 md:p-10">
            <h3 className="text-2xl md:text-3xl text-center mb-8 text-[#3C2F2F]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              {t("transform_title")}
            </h3>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="md:pr-8">
                <p className="text-xs uppercase tracking-wider text-[#8A7B6B] mb-3 font-semibold">{t("transform_before_label")}</p>
                <ul className="space-y-3">
                  {[t("transform_before_1"), t("transform_before_2"), t("transform_before_3")].map((item, i) => (
                    <li key={i} className="flex gap-3"><span className="text-red-400 mt-0.5 font-bold">&times;</span><span>{item}</span></li>
                  ))}
                </ul>
              </div>
              <div className="md:pl-8 md:border-l border-[#C9840D]/20">
                <p className="text-xs uppercase tracking-wider text-[#C9840D] mb-3 font-semibold">{t("transform_after_label")}</p>
                <ul className="space-y-3">
                  {[t("transform_after_1"), t("transform_after_2"), t("transform_after_3")].map((item, i) => (
                    <li key={i} className="flex gap-3"><span className="text-[#C9840D] mt-0.5 font-bold">&check;</span><span>{item}</span></li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-center text-xs text-[#8A7B6B] mt-6">{t("transform_disclaimer")}</p>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* MODULES */}
      {/* ================================================================ */}
      {hasModules && (
        <section className="py-16 lg:py-24 relative z-10 overflow-hidden">
          <GradientBlob className="w-[600px] h-[600px] bg-[#C9840D]/5 -bottom-40 left-1/3 animate-[pulse_12s_ease-in-out_infinite_2s]" />
          <div className="max-w-6xl mx-auto px-6 relative">
            <div className="text-center max-w-2xl mx-auto">
              <h2 className="text-3xl md:text-4xl text-[#3C2F2F]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                {lc?.modules?.title || t("modules_title")}
              </h2>
              <p className="mt-4 text-[#5A4E42]">{lc?.modules?.description || t("modules_desc")}</p>
            </div>
            <div className="grid md:grid-cols-2 gap-5 mt-12">
              {modules.map((m, i) => {
                const Icon = MODULE_ICONS[i % MODULE_ICONS.length];
                return (
                  <div key={i} className="bg-white rounded-2xl p-6 border border-[#F0E6D7] hover:shadow-lg hover:shadow-[#C9840D]/5 hover:border-[#C9840D]/20 transition-all duration-300 group">
                    <div className="flex gap-4">
                      <div className="w-10 h-10 rounded-lg bg-[#C9840D]/10 flex items-center justify-center shrink-0 group-hover:bg-[#C9840D]/15 transition-colors">
                        <Icon className="w-5 h-5 text-[#C9840D]" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-lg text-[#3C2F2F]">{m.title}</h4>
                        <p className="text-[#5A4E42] text-[15px] mt-1">{m.desc}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="text-center mt-10">
              <TrackedCtaButton href={checkoutUrl} productSlug={productSlug ?? ""} productId={productId} locale={locale}
                className="inline-flex px-8 py-4 bg-[#C9840D] text-white rounded-xl font-semibold hover:bg-[#B6750B] shadow-lg shadow-[#C9840D]/20 transition-all">
                {t("hero_cta_prefix")} {data.prezzo ?? "$19"}
              </TrackedCtaButton>
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* TESTIMONIALS */}
      {/* ================================================================ */}
      <section className="py-16 bg-[#FFFBF5] relative z-10 overflow-hidden">
        <GradientBlob className="w-[500px] h-[500px] bg-[#C9840D]/5 top-0 -left-40 animate-[pulse_11s_ease-in-out_infinite_1s]" />
        <div className="max-w-6xl mx-auto px-6 relative">
          <h2 className="text-3xl text-center mb-2 text-[#3C2F2F]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            {lc?.testimonials?.title || t("testimonials_title")}
          </h2>
          <p className="text-center text-[#8A7B6B] mb-10 text-sm">{t("testimonials_subtitle")}</p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(data.testimonials && data.testimonials.length > 0 ? data.testimonials : testimonials).map((tst, i) => (
              <div key={i} className="bg-white rounded-2xl p-6 shadow-md shadow-[#C9840D]/5 border border-[#F0E6D7]">
                <div className="flex items-center gap-3 mb-4">
                  <img src={tst.avatar} alt="" className="w-11 h-11 rounded-full object-cover ring-2 ring-[#C9840D]/20" />
                  <div>
                    <p className="font-semibold text-sm text-[#3C2F2F]">{tst.name}</p>
                    <p className="text-xs text-[#C9840D]">{tst.location}</p>
                  </div>
                </div>
                <p className="text-[15px] leading-relaxed text-[#4A4035]">&ldquo;{tst.text}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* WHAT YOU RECEIVE */}
      {/* ================================================================ */}
      <section className="py-16 relative z-10 overflow-hidden">
        <GradientBlob className="w-[500px] h-[500px] bg-[#C9840D]/5 -top-40 right-0 animate-[pulse_13s_ease-in-out_infinite_4s]" />
        <div className="max-w-5xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center relative">
          <div>
            <h2 className="text-3xl md:text-4xl mb-6 text-[#3C2F2F]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              {lc?.includes?.title || t("whats_included_title")}
            </h2>
            <ul className="space-y-4">
              {includesItems.map((item, i) => (
                <li key={i} className="flex gap-3">
                  <Check className="w-5 h-5 text-[#C9840D] shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-[#4A4035]">{item}</span>
                </li>
              ))}
              {includesItems.length === 0 && [1, 2, 3, 4, 5, 6].map((n) => (
                <li key={n} className="flex gap-3">
                  <Check className="w-5 h-5 text-[#C9840D] shrink-0 mt-0.5" strokeWidth={2.5} />
                  <span className="text-[#4A4035]">{t(`whats_included_${n}`)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative">
            <div className="absolute -inset-4 bg-[#C9840D]/5 rounded-[32px] blur-xl" />
            <img src="/images/amish-storia-1.png" alt="Course materials" className="relative rounded-[28px] shadow-lg shadow-[#C9840D]/10 w-full h-[420px] object-cover border border-[#F0E6D7]" />
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* OFFER */}
      {/* ================================================================ */}
      <section className="py-16 lg:py-24 relative overflow-hidden z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-[#3C2F2F] to-[#2A2118]" />
        <GradientBlob className="w-[600px] h-[600px] bg-[#C9840D]/10 -top-40 -right-40 animate-[pulse_8s_ease-in-out_infinite]" />
        <GradientBlob className="w-[400px] h-[400px] bg-[#C9840D]/8 bottom-0 -left-40 animate-[pulse_10s_ease-in-out_infinite_3s]" />
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />
        <div className="max-w-3xl mx-auto px-6 relative">
          <div className="bg-[#4A3D32]/80 backdrop-blur-sm border border-[#C9840D]/20 rounded-[32px] p-8 md:p-12 shadow-2xl text-center">
            <p className="inline-block bg-[#C9840D]/20 text-[#C9840D] px-3 py-1 rounded-full text-xs font-semibold tracking-wide mb-4">{lc?.offer?.badge || t("offer_badge")}</p>
            <h2 className="text-3xl md:text-4xl text-white" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              {PRODUCT_TITLE.split(":")[0] || "Course"} &mdash; {lc?.offer?.title || t("offer_title")}
            </h2>
            <div className="mt-6 flex items-center justify-center gap-4">
              <span className="text-2xl line-through opacity-40">{lc?.offer?.course_value || t("offer_original_price")}</span>
              <span className="text-5xl font-semibold text-white" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>{data.prezzo ?? "$19"}</span>
            </div>
            <p className="mt-2 text-white/60">{lc?.offer?.one_time || t("offer_one_time")}</p>
            <p className="mt-1 text-sm text-[#C9840D] font-medium">{lc?.offer?.launch_price || t("offer_launch_note")}</p>

            <TrackedCtaButton href={checkoutUrl} productSlug={productSlug ?? ""} productId={productId} locale={locale}
              className="mt-8 inline-flex w-full justify-center px-8 py-5 bg-[#C9840D] hover:bg-[#B6750B] text-white font-semibold rounded-xl text-lg shadow-lg shadow-[#C9840D]/30 transition transform hover:-translate-y-0.5">
              {lc?.offer?.cta || t("offer_cta")} {data.prezzo ?? "$19"}
            </TrackedCtaButton>

            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-white/40">
              <span className="flex items-center gap-1"><Lock className="w-3.5 h-3.5" /> {t("offer_stripe_paypal")}</span>
              <span>&bull;</span>
              <span>{t("offer_invoice")}</span>
            </div>

            <div className="mt-10 text-left bg-[#3C2F2F]/80 rounded-2xl p-6 border border-[#C9840D]/10">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#C9840D]/15 flex items-center justify-center shrink-0"><Shield className="w-5 h-5 text-[#C9840D]" /></div>
                <div>
                  <p className="font-semibold text-white">{lc?.offer?.guarantee_title || t("guarantee_title")}</p>
                  <p className="text-sm text-white/60 mt-1 leading-relaxed">{lc?.offer?.guarantee_text || t("guarantee_text")}</p>
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
        <section className="py-16 lg:py-24 bg-[#FFFBF5] relative z-10 overflow-hidden">
          <GradientBlob className="w-[500px] h-[500px] bg-[#C9840D]/5 -bottom-40 right-0 animate-[pulse_12s_ease-in-out_infinite_2s]" />
          <div className="max-w-3xl mx-auto px-6 relative">
            <h2 className="text-3xl text-center mb-10 text-[#3C2F2F]" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              {lc?.faq?.title || t("faq_title")}
            </h2>
            <div className="space-y-4">
              {faqItems.map((faq, i) => (
                <div key={i} className="bg-white rounded-2xl border border-[#F0E6D7] overflow-hidden hover:border-[#C9840D]/20 transition-colors">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full text-left font-semibold flex justify-between items-center px-5 py-4">
                    <span className="pr-4 text-[#3C2F2F]">{faq.q}</span>
                    <ChevronDown className={`w-5 h-5 text-[#C9840D] shrink-0 transition-transform duration-300 ${openFaq === i ? "rotate-180" : ""}`} />
                  </button>
                  <div className={`grid transition-all duration-300 ${openFaq === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="overflow-hidden">
                      <div className="px-5 pb-4 text-[#5A4E42] text-[15px] leading-relaxed">{faq.a}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-10">
              <TrackedCtaButton href={checkoutUrl} productSlug={productSlug ?? ""} productId={productId} locale={locale}
                className="inline-flex px-7 py-3.5 bg-[#C9840D] text-white rounded-xl font-medium hover:bg-[#B6750B] shadow-lg shadow-[#C9840D]/20 transition-all">
                {lc?.final_cta?.badge || lc?.offer?.cta || t("final_cta_text")}
              </TrackedCtaButton>
            </div>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* FOOTER */}
      {/* ================================================================ */}
      <footer className="bg-[#FFFBF5] border-t border-[#F0E6D7] py-10 text-sm text-[#8A7B6B] relative z-10">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between gap-6">
            <div>
              <p className="font-semibold text-[#3C2F2F]">{PRODUCT_TITLE}</p>
              <p className="mt-1">{lc?.footer?.rights_reserved || t("footer_rights")}</p>
            </div>
            <div className="text-xs leading-relaxed">
              <p>Courssy &mdash; {lc?.footer?.rights_reserved || t("footer_rights")}</p>
              <p>Email: <a href={`mailto:${t("footer_email")}`} className="underline text-[#C9840D]">{t("footer_email")}</a></p>
              <p className="mt-2">
                <a href="/privacy" className="hover:text-[#C9840D] transition-colors">{lc?.footer?.privacy || t("footer_privacy")}</a> &middot;{" "}
                <a href="/terms" className="hover:text-[#C9840D] transition-colors">{lc?.footer?.terms || t("footer_terms")}</a> &middot;{" "}
                <a href="#" className="hover:text-[#C9840D] transition-colors">{t("footer_cookies")}</a> &middot;{" "}
                <a href="#" className="hover:text-[#C9840D] transition-colors">{t("footer_withdrawal")}</a>
              </p>
            </div>
          </div>
          <p className="mt-8 text-[11px] text-[#B0A89A] max-w-3xl">{lc?.footer?.legal_note || t("footer_legal_note")}</p>
        </div>
      </footer>

      <div className="h-20 md:h-0" />
    </div>
  );
}
