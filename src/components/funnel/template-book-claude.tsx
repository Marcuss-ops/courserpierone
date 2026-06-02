"use client";

import React, { useState, useMemo } from "react";
import { ChevronRight, Check, BookOpen, Sparkles, Heart, DollarSign, Leaf, Users, Home, GraduationCap } from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";

interface BookClaudeProps {
  data: {
    titolo?: string;
    sottotitolo?: string;
    storia?: string;
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

const FALLBACK_ICONS = [Leaf, Heart, Home, Users, GraduationCap, DollarSign, BookOpen, Sparkles];

function getSectionLabel(locale: string, num: number, it: string, en: string): string {
  return `// ${String(num).padStart(2, "0")} — ${locale === "en" ? en : it}`;
}

export default function TemplateBookClaude({ data, locale = "it", productId, productSlug, checkoutUrl }: BookClaudeProps) {
  const [activeTab, setActiveTab] = useState(0);

  // Split storia into paragraphs for tab content
  const storyParagraphs = useMemo(() => {
    return (data.storia ?? "")
      .split("\n")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }, [data.storia]);

  // Build tab content from story paragraphs, or fallback to lessons
  const tabLabels = useMemo(() => {
    if (storyParagraphs.length >= 3) {
      return storyParagraphs.slice(0, 3).map((_, i) => 
        locale === "en" ? `Chapter ${i + 1}` : `Capitolo ${i + 1}`
      );
    }
    if (data.lezioni && data.lezioni.length >= 3) {
      return data.lezioni.slice(0, 3).map((l) => l.titolo);
    }
    return [];
  }, [storyParagraphs, data.lezioni, locale]);

  const tabContents = useMemo(() => {
    if (storyParagraphs.length >= 3) {
      return storyParagraphs.slice(0, 3).map((p) => p);
    }
    if (data.lezioni && data.lezioni.length >= 3) {
      return data.lezioni.slice(0, 3).map((l) => l.descrizione);
    }
    return [];
  }, [storyParagraphs, data.lezioni]);

  const hasTabs = tabLabels.length >= 3;

  // Build feature cards from lessons if available
  const featureCards = useMemo(() => {
    if (data.lezioni && data.lezioni.length > 0) {
      return data.lezioni.map((l, i) => ({
        title: l.titolo,
        desc: l.descrizione,
        icon: FALLBACK_ICONS[i % FALLBACK_ICONS.length],
      }));
    }
    // Fallback: use story paragraphs as features
    return storyParagraphs.slice(0, 3).map((p, i) => ({
      title: locale === "en"
        ? ["Key Insight", "Core Principle", "Actionable Step"][i] ?? `Insight ${i + 1}`
        : ["Punto Chiave", "Principio Fondamentale", "Passo Pratico"][i] ?? `Insight ${i + 1}`,
      desc: p,
      icon: [Leaf, Heart, Home][i] ?? BookOpen,
    }));
  }, [data.lezioni, storyParagraphs, locale]);

  const sectionLabels = {
    features: getSectionLabel(locale, 1, "Perché leggerlo", "Why Read This"),
    extract: getSectionLabel(locale, 2, "Estratto", "Preview"),
    pricing: getSectionLabel(locale, 3, "Prezzo", "Price"),
  };

  const featuresTitle = locale === "en"
    ? "What You'll Learn"
    : "Cosa Imparerai";

  const extractTitle = locale === "en"
    ? "Preview the Content"
    : "Sfoglia l'Anteprima";

  const pricingTitle = locale === "en"
    ? "Get Instant Access"
    : "Scegli il tuo formato";

  const pricingDesc = locale === "en"
    ? "Start learning today with instant digital access."
    : "Ottieni l'accesso immediato alla versione digitale.";

  const buyText = locale === "en" ? "Buy Now" : "Acquista Ora";

  return (
    <div className="min-h-screen bg-white text-[#1A1A1A] font-sans selection:bg-[#FF6B00]/20">
      {/* Subtle Grid Background */}
      <div 
        className="fixed inset-0 pointer-events-none z-0 opacity-[0.15]" 
        style={{
          backgroundImage: `linear-gradient(to right, #E0E0E0 1px, transparent 1px), linear-gradient(to bottom, #E0E0E0 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 70%)'
        }}
      />

      <main className="relative z-10">
        {/* HERO */}
        <section className="pt-24 pb-20 px-6 max-w-[1120px] mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Visual */}
            <div className="order-2 lg:order-1 flex justify-center">
              <div className="relative w-full max-w-[380px] group">
                <div className="relative aspect-[3/4.2] transform lg:rotate-y-[-12deg] lg:rotate-x-[4deg] transition-transform duration-700 group-hover:rotate-y-[-8deg] group-hover:rotate-x-[2deg] group-hover:-translate-y-2">
                  {/* Spine */}
                  <div className="absolute -left-4 top-[3%] bottom-[3%] w-8 bg-gradient-to-r from-[#e8e8e8] to-[#fafafa] rounded-l-lg transform rotate-y-85 -translate-z-1 border border-black/5" />
                  {/* Cover */}
                  <div className="w-full h-full bg-gradient-to-br from-white to-[#FFF3EB] rounded-2xl border border-black/10 shadow-[0_24px_48px_rgba(255,107,0,0.12)] overflow-hidden relative">
                    {data.coverUrl ? (
                      <img src={data.coverUrl} alt="Cover" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                        <div className="text-[10px] font-mono text-[#FF6B00] bg-[#FFF3EB] px-2 py-1 rounded border border-[#FF6B00]/20 mb-4 uppercase">
                          {locale === "en" ? "Cover" : "Copertina"}
                        </div>
                        <h3 className="text-2xl font-bold leading-tight">{data.titolo}</h3>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="order-1 lg:order-2 space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FFF3EB] text-[#E05E00] border border-[#FF6B00]/18 rounded-full text-xs font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 bg-[#FF6B00] rounded-full animate-pulse" />
                {locale === "en" ? "New Release" : "Nuovo Lancio"}
              </div>
              <h1 className="text-4xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
                {data.titolo}
              </h1>
              <p className="text-xl text-[#4A4A4A] font-medium italic">
                {data.sottotitolo}
              </p>
              <p className="text-[#6B7280] leading-relaxed text-lg">
                {data.storia?.split('\n')[0] || data.storia}
              </p>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <TrackedCtaButton
                  href={checkoutUrl}
                  productSlug={productSlug ?? ""}
                  productId={productId}
                  locale={locale}
                  className="bg-[#FF6B00] text-white px-8 py-4 rounded-xl font-bold text-lg shadow-[0_8px_24px_rgba(255,107,0,0.2)] hover:bg-[#E05E00] hover:-translate-y-1 transition-all flex items-center justify-center gap-2"
                >
                  {buyText} — {data.prezzo ?? ""}
                  <ChevronRight className="w-5 h-5" />
                </TrackedCtaButton>
                {hasTabs && (
                  <a href="#estratto" className="bg-white text-[#1A1A1A] border border-[#EAEAEA] px-8 py-4 rounded-xl font-bold hover:bg-[#FAFAFA] transition-all inline-flex items-center justify-center">
                    {locale === "en" ? "Preview" : "Leggi Estratto"}
                  </a>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 text-xs font-bold text-[#6B7280] uppercase tracking-widest">
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#FF6B00]" /> {locale === "en" ? "Instant eBook" : "eBook Immediato"}</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#FF6B00]" /> {locale === "en" ? "Lifetime Access" : "Accesso a Vita"}</div>
                <div className="flex items-center gap-2"><Check className="w-4 h-4 text-[#FF6B00]" /> {locale === "en" ? "30-Day Guarantee" : "30 Giorni Soddisfatti"}</div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES — dynamically from lessons */}
        {featureCards.length > 0 && (
          <section className="py-20 bg-[#FAFAFA] border-y border-[#EAEAEA]">
            <div className="container max-w-[1120px] mx-auto px-6">
              <div className="max-w-3xl mb-16">
                <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">{sectionLabels.features}</span>
                <h2 className="text-3xl lg:text-5xl font-bold tracking-tight">{featuresTitle}</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {featureCards.slice(0, 6).map((f, i) => {
                  const Icon = f.icon;
                  return (
                    <div key={i} className="bg-white p-8 rounded-2xl border border-[#EAEAEA] shadow-sm hover:shadow-md transition-shadow">
                      <div className="w-12 h-12 bg-[#FFF3EB] text-[#FF6B00] rounded-xl flex items-center justify-center mb-6">
                        <Icon className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-bold mb-3">{f.title}</h3>
                      <p className="text-[#6B7280] text-sm leading-relaxed">{f.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ESTRATTO (Tabs) — dynamically from storia */}
        {hasTabs && (
          <section id="estratto" className="py-20 px-6 max-w-[1120px] mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">{sectionLabels.extract}</span>
              <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">{extractTitle}</h2>
            </div>

            <div className="border border-[#EAEAEA] rounded-3xl overflow-hidden shadow-xl bg-white">
              <div className="flex border-b border-[#EAEAEA] bg-[#FAFAFA] overflow-x-auto">
                {tabLabels.map((tab, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveTab(i)}
                    className={`px-8 py-5 text-sm font-bold border-r border-[#EAEAEA] transition-colors whitespace-nowrap ${activeTab === i ? 'bg-white text-[#FF6B00]' : 'text-[#6B7280] hover:text-[#1A1A1A]'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              <div className="p-8 lg:p-16 min-h-[300px]">
                <div className="font-mono text-[10px] text-[#6B7280] uppercase tracking-widest mb-6">
                  {locale === "en" ? "Reading time" : "Tempo di lettura"} · ~{Math.max(3, Math.ceil((tabContents[activeTab]?.length ?? 100) / 500))} min
                </div>
                <div className="prose prose-zinc max-w-none text-[#4A4A4A] text-lg leading-relaxed">
                  <p>{tabContents[activeTab]}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* PRICING */}
        <section className="py-24 bg-[#0B0B0C] text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 50% -20%, #FF6B00 0%, transparent 50%)' }} />
          <div className="container max-w-[800px] mx-auto px-6 text-center relative z-10">
            <span className="font-mono text-xs text-[#FF6B00] uppercase tracking-widest block mb-4">{sectionLabels.pricing}</span>
            <h2 className="text-3xl lg:text-5xl font-black mb-6 tracking-tight">{pricingTitle}</h2>
            <p className="text-[#A1A1AA] text-lg mb-12">{pricingDesc}</p>
            
            <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-12 backdrop-blur-md">
              <div className="text-[#FF6B00] font-mono text-xs uppercase tracking-widest mb-4">
                {locale === "en" ? "Complete Edition" : "Versione Completa"}
              </div>
              <div className="text-6xl font-black mb-8 tracking-tighter">{data.prezzo}</div>
              <ul className="space-y-4 mb-10 text-left max-w-md mx-auto">
                <li className="flex gap-3 text-zinc-300"><Check className="text-[#FF6B00] w-5 h-5 shrink-0" /> {locale === "en" ? "eBook in PDF, ePub & Kindle" : "eBook in PDF, ePub e Kindle"}</li>
                <li className="flex gap-3 text-zinc-300"><Check className="text-[#FF6B00] w-5 h-5 shrink-0" /> {locale === "en" ? "Instant download after payment" : "Download immediato dopo il pagamento"}</li>
                <li className="flex gap-3 text-zinc-300"><Check className="text-[#FF6B00] w-5 h-5 shrink-0" /> {locale === "en" ? "Lifetime access to member area" : "Accesso a vita all'area riservata"}</li>
              </ul>
              <TrackedCtaButton
                href={checkoutUrl}
                productSlug={productSlug ?? ""}
                productId={productId}
                locale={locale}
                className="w-full bg-[#FF6B00] hover:bg-[#E05E00] text-white py-5 rounded-2xl font-black uppercase tracking-widest transition-all shadow-[0_8px_32px_rgba(255,107,0,0.3)]"
              >
                {buyText}
              </TrackedCtaButton>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 border-t border-[#EAEAEA]">
        <div className="container max-w-[1120px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6 text-[#6B7280] text-xs font-medium">
          <div>© {new Date().getFullYear()} Courssy — {locale === "en" ? "All rights reserved." : "Tutti i diritti riservati."}</div>
          <div className="flex gap-8">
            <a href="/privacy" className="hover:text-[#1A1A1A] transition-colors">{locale === "en" ? "Privacy" : "Privacy"}</a>
            <a href="/terms" className="hover:text-[#1A1A1A] transition-colors">{locale === "en" ? "Terms" : "Termini"}</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
