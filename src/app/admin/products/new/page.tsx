"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import TemplateSelector from "@/components/admin/template-selector";
import { ImageUpload } from "@/components/admin/image-upload";
import type { TemplateId } from "@/components/funnel";
import type { TranslateApiResponse } from "@/lib/utils/api-types";
import { 
  ArrowLeft, 
  ArrowRight, 
  Sparkles, 
  Languages, 
  Save, 
  Image as ImageIcon,
  Plus,
  Trash2,
  CheckCircle2,
  Loader2
} from "lucide-react";
import { CurrencyPricesSection } from "@/components/admin/currency-prices";

const FUNNEL_SECTIONS = [
  { key: "titolo", label: "Titolo del Prodotto", placeholder: "Es: Corso Completo di Fotografia" },
  { key: "sottotitolo", label: "Sottotitolo", placeholder: "Es: Impara a scattare foto professionali in 30 giorni" },
  { key: "problema", label: "Problema (pain point)", placeholder: "Es: Sei stanco di scattare foto sfocate e scure?" },
  { key: "storia", label: "La Tua Storia", placeholder: "Es: Ho iniziato a scattare foto a 15 anni...\nDopo 20 anni di esperienza..." },
  { key: "recensioni", label: "Recensioni / Testimonianze", placeholder: "Es: Finalmente scatto foto che mi fanno orgoglio! — Marco, Roma" },
  { key: "cta", label: "Call to Action (vendita)", placeholder: "Es: Inizia Oggi — Accesso a Vita" },
];

export default function NewProductPage() {
  const router = useRouter();
  const [step, setStep] = useState<"template" | "content" | "ai">("template");
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [translationsByLocale, setTranslationsByLocale] = useState<Record<string, Record<string, string>>>({});
  const [translatedLocales, setTranslatedLocales] = useState<string[]>([]);
  const [pricesByCurrency, setPricesByCurrency] = useState<Record<string, { price: number; lemonVariantId?: string | null; stripePriceId?: string | null }>>({});
  const [countryOverrides, setCountryOverrides] = useState<Record<string, { currency: string; price: number; symbol?: string; lemonVariantId?: string | null; stripePriceId?: string | null }>>({});

  // Form state
  const [slug, setSlug] = useState("");
  const [price, setPrice] = useState("4900");
  const [texts, setTexts] = useState<Record<string, string>>(
    Object.fromEntries(FUNNEL_SECTIONS.map((s) => [s.key, ""]))
  );
  const [lessons, setLessons] = useState<{ title: string; videoUrl: string }[]>([
    { title: "", videoUrl: "" },
  ]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState<string | null>(null);

  // Step 1: Template selection
  const handleTemplateSelect = (templateId: TemplateId, domain: string) => {
    setSelectedTemplate(templateId);
    setSlug(domain);
    setStep("content");
  };

  // Step 3: AI modification
  const handleAiModify = async () => {
    if (!aiPrompt.trim()) return;
    setIsTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceLocale: "it",
          targetLocales: ["it"],
          sections: { custom: aiPrompt },
          mode: "rewrite",
          currentTexts: texts,
        }),
      });
      const data = await res.json() as TranslateApiResponse;
      setAiResult(JSON.stringify(data, null, 2));
    } catch {
      alert("Errore nella richiesta AI");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleTranslate = async () => {
    setIsTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceLocale: "it",
          targetLocales: ["en", "es", "fr", "de", "pt"],
          sections: texts,
        }),
      });
      const data = await res.json() as TranslateApiResponse;
      if (data.translations) {
        setTranslationsByLocale(data.translations);
        const locales = Object.keys(data.translations).filter(l => l !== "it");
        setTranslatedLocales(locales);
      }
    } catch {
      alert("Errore nella traduzione");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleSave = async () => {
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          price: parseInt(price),
          coverUrl: coverPreview,
          translations: texts,
          translationsByLocale,
          pricesByCurrency: Object.keys(pricesByCurrency).length > 0 ? pricesByCurrency : undefined,
          countryOverrides: Object.keys(countryOverrides).length > 0 ? countryOverrides : undefined,
          lessons,
          sourceLocale: "it",
          templateId: selectedTemplate,
        }),
      });
      if (res.ok) {
        alert("Prodotto salvato!");
        router.push("/admin/products");
      }
    } catch {
      alert("Errore nel salvataggio");
    }
  };

  return (
    <div className="px-8 py-8">
      {/* Step Indicator */}
      <div className="mx-auto max-w-4xl mb-12 flex items-center justify-center gap-4">
        {[
          { key: "template", label: "1. Template" },
          { key: "content", label: "2. Contenuti" },
          { key: "ai", label: "3. AI & Traduzioni" },
        ].map((s, idx) => (
          <div key={s.key} className="flex items-center">
            <div
              className={`flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                step === s.key
                  ? "bg-accent-blue text-white shadow-lg shadow-accent-blue/20"
                  : "bg-zinc-800/50 text-zinc-500 border border-zinc-700"
              }`}
            >
              {s.label}
            </div>
            {idx < 2 && <div className="w-8 h-px bg-zinc-800 mx-2" />}
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-4xl">
        {/* STEP 1: Template Selection */}
        {step === "template" && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-3xl font-bold text-white">Scegli il Template</h1>
              <p className="mt-2 text-zinc-500">
                Seleziona un design white-label per il tuo prodotto
              </p>
            </div>
            <TemplateSelector
              onSelect={handleTemplateSelect}
              onClose={() => router.push("/admin")}
            />
          </div>
        )}

        {/* STEP 2: Content */}
        {step === "content" && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white">Contenuti del Funnel</h1>
                <p className="mt-2 text-zinc-500">
                  Template: <span className="text-accent-blue font-medium">{selectedTemplate}</span> — Slug: <span className="text-zinc-300 font-mono">/{slug}</span>
                </p>
              </div>
              <button 
                onClick={() => setStep("template")}
                className="p-2 text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
            </div>

            {/* Copertina */}
            <section className="glass-card p-8 rounded-3xl space-y-6">
              <div className="flex items-center gap-3 text-white font-semibold">
                <ImageIcon className="w-5 h-5 text-accent-blue" />
                <h2>Immagine di Copertina</h2>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-8">
                <ImageUpload
                  value={coverPreview}
                  onChange={(url) => setCoverPreview(url)}
                />
                <div className="flex-1 space-y-4 text-center sm:text-left">
                  <p className="text-sm text-zinc-400">
                    L&apos;immagine verrà caricata su cloud (Supabase Storage) e mostrata nel funnel e nelle anteprime social.
                  </p>
                  <p className="text-[10px] text-zinc-600 font-medium">
                    PNG, JPEG, WebP o AVIF — max 5 MB
                  </p>
                </div>
              </div>
            </section>

            {/* Sezioni del Funnel */}
            <section className="glass-card p-8 rounded-3xl space-y-6">
              <div className="flex items-center gap-3 text-white font-semibold">
                <Plus className="w-5 h-5 text-accent-blue" />
                <h2>Testi della Landing Page</h2>
              </div>
              <div className="space-y-6">
                {FUNNEL_SECTIONS.map((section) => (
                  <div key={section.key} className="space-y-2">
                    <label className="block text-sm font-medium text-zinc-400 uppercase tracking-wider text-[10px]">{section.label}</label>
                    <textarea
                      value={texts[section.key] ?? ""}
                      onChange={(e) => setTexts((prev) => ({ ...prev, [section.key]: e.target.value }))}
                      rows={section.key === "storia" || section.key === "recensioni" ? 4 : 2}
                      className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent-blue/50 focus:border-accent-blue/50 transition-all placeholder:text-zinc-700"
                      placeholder={section.placeholder}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Lezioni */}
            <section className="glass-card p-8 rounded-3xl space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-white font-semibold">
                  <ArrowRight className="w-5 h-5 text-accent-blue" />
                  <h2>Lezioni Video</h2>
                </div>
                <button
                  onClick={() => setLessons((prev) => [...prev, { title: "", videoUrl: "" }])}
                  className="text-sm text-accent-blue hover:underline flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Aggiungi lezione
                </button>
              </div>
              <div className="space-y-4">
                {lessons.map((lesson, i) => (
                  <div key={i} className="flex gap-4 items-start bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800/50">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-sm font-bold text-zinc-400 border border-zinc-700">
                      {i + 1}
                    </span>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <input
                        type="text"
                        value={lesson.title}
                        onChange={(e) => { const n = [...lessons]; n[i].title = e.target.value; setLessons(n); }}
                        placeholder="Titolo lezione"
                        className="bg-transparent border-b border-zinc-800 px-1 py-2 text-sm text-white focus:outline-none focus:border-accent-blue transition-colors"
                      />
                      <input
                        type="text"
                        value={lesson.videoUrl}
                        onChange={(e) => { const n = [...lessons]; n[i].videoUrl = e.target.value; setLessons(n); }}
                        placeholder="URL YouTube"
                        className="bg-transparent border-b border-zinc-800 px-1 py-2 text-sm text-white focus:outline-none focus:border-accent-blue transition-colors"
                      />
                    </div>
                    <button 
                      onClick={() => setLessons(prev => prev.filter((_, idx) => idx !== i))}
                      className="p-2 text-zinc-600 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Prezzo */}
            <section className="glass-card p-8 rounded-3xl space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h2 className="text-white font-semibold">Prezzo del Prodotto</h2>
                  <p className="text-xs text-zinc-500">Inposta il costo finale in Euro (default)</p>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">€</span>
                  <input
                    type="number"
                    value={parseInt(price) / 100}
                    onChange={(e) => setPrice(String(parseFloat(e.target.value) * 100))}
                    className="bg-zinc-900/50 border border-zinc-800 rounded-xl pl-8 pr-4 py-3 text-white font-bold w-32 focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
                  />
                </div>
              </div>
              <CurrencyPricesSection
                pricesByCurrency={pricesByCurrency}
                onChange={setPricesByCurrency}
                countryOverrides={countryOverrides}
                onCountryOverridesChange={setCountryOverrides}
                showOptionalLabel
              />
            </section>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button
                onClick={() => setStep("ai")}
                className="flex-1 gradient-btn rounded-2xl py-4 text-sm font-bold text-white shadow-xl flex items-center justify-center gap-2"
              >
                Continua all&apos;AI <ArrowRight className="w-4 h-4" />
              </button>
              <div className="flex gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleTranslate}
                    disabled={isTranslating}
                    className="px-6 py-4 bg-zinc-800 text-zinc-300 rounded-2xl text-sm font-semibold border border-zinc-700 hover:bg-zinc-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isTranslating ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Traducendo…</>
                    ) : (
                      <><Languages className="w-4 h-4" /> Traduci (EN, ES, FR, DE, PT)</>
                    )}
                  </button>
                  {translatedLocales.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-xl">
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-green-400 font-medium">
                        {translatedLocales.map(l => l.toUpperCase()).join(", ")}
                      </span>
                    </div>
                  )}
                </div>
                <button
                  onClick={handleSave}
                  className="px-6 py-4 bg-zinc-800 text-zinc-300 rounded-2xl text-sm font-semibold border border-zinc-700 hover:bg-zinc-700 transition-colors flex items-center gap-2"
                >
                  <Save className="w-4 h-4" /> Salva Bozza
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: AI Modification */}
        {step === "ai" && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white">Modifica con AI</h1>
                <p className="mt-2 text-zinc-500">
                  L&apos;AI riscriverà i tuoi testi in base alle tue istruzioni
                </p>
              </div>
              <button 
                onClick={() => setStep("content")}
                className="p-2 text-zinc-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-6 h-6" />
              </button>
            </div>

            {/* AI Prompt */}
            <section className="glass-card p-8 rounded-3xl space-y-6">
              <div className="flex items-center gap-3 text-white font-semibold">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h2>Cosa vuoi migliorare?</h2>
              </div>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={5}
                className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl px-5 py-4 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all placeholder:text-zinc-700 shadow-inner"
                placeholder="Esempi:
- Rendi il testo più urgente e persuasivo
- Aggiungi un tono amichevole e informale
- Riscrivi la storia per renderla più emozionante..."
              />
              <button
                onClick={handleAiModify}
                disabled={isTranslating || !aiPrompt.trim()}
                className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl text-sm font-bold text-white shadow-lg shadow-purple-600/20 hover:brightness-110 transition-all disabled:opacity-50"
              >
                {isTranslating ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    L&apos;AI sta scrivendo...
                  </span>
                ) : "✨ Applica Magia AI"}
              </button>
            </section>

            {/* AI Result */}
            {aiResult && (
              <section className="glass-card p-8 rounded-3xl border-green-500/20 bg-green-500/5 space-y-6">
                <h2 className="text-white font-semibold flex items-center gap-2">
                  <Check className="w-5 h-5 text-green-500" /> Risultato Ottimizzato
                </h2>
                <div className="bg-zinc-900/80 p-6 rounded-2xl border border-zinc-800 max-h-64 overflow-y-auto">
                  <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono">{aiResult}</pre>
                </div>
                <button
                  onClick={() => {
                    try {
                      const parsed = JSON.parse(aiResult);
                      if (parsed.translations?.it) {
                        setTexts((prev) => ({ ...prev, ...parsed.translations.it }));
                      }
                      alert("Modifiche applicate con successo!");
                    } catch {
                      alert("Errore nell'applicazione delle modifiche");
                    }
                  }}
                  className="w-full py-3 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-500 transition-colors shadow-lg shadow-green-600/10"
                >
                  Conferma e Applica Testi
                </button>
              </section>
            )}

            <div className="flex gap-4 pt-4">
               <button
                onClick={() => setStep("content")}
                className="px-8 py-4 bg-zinc-800 text-zinc-300 rounded-2xl text-sm font-semibold border border-zinc-700 hover:bg-zinc-700 transition-colors"
              >
                Torna ai Contenuti
              </button>
              <button
                onClick={handleSave}
                className="flex-1 gradient-btn rounded-2xl py-4 text-sm font-bold text-white shadow-xl"
              >
                Pubblica Prodotto
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


function Check({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );
}
