"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ImageUpload } from "@/components/admin/image-upload";
import { CurrencyPricesSection } from "@/components/admin/currency-prices";
import { LocaleTabs } from "@/components/admin/locale-tabs";
import { LessonBuilder } from "@/components/admin/lesson-builder";
import type { TemplateId } from "@/components/funnel/types";
import type { ProductApiDetail, TranslateApiResponse } from "@/lib/utils/api-types";
import { toFullLocale } from "@/lib/i18n/to-full-locale";
import {
  ArrowLeft,
  Save,
  Image as ImageIcon,
  FileJson,
  Loader2,
  CreditCard,
  Languages,
  CheckCircle2,
  ExternalLink,
  Eye,
  X,
} from "lucide-react";

const FUNNEL_SECTIONS = [
  { key: "titolo", label: "Titolo", rows: 1 },
  { key: "sottotitolo", label: "Sottotitolo", rows: 2 },
  { key: "problema", label: "Problema / Pain Point", rows: 3 },
  { key: "storia", label: "La Tua Storia", rows: 4 },
  { key: "recensioni", label: "Recensioni", rows: 3 },
  { key: "cta", label: "Call to Action", rows: 1 },
];

export default function EditProductPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [, setProduct] = useState<ProductApiDetail | null>(null);
  const [slug, setSlug] = useState("");
  const [price, setPrice] = useState("4900");
  const [status, setStatus] = useState("draft");
  const [templateId, setTemplateId] = useState<TemplateId>("lumio");
  const [lemonVariantId, setLemonVariantId] = useState("");
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [lessons, setLessons] = useState<
    {
      id?: string;
      translations: Record<string, { title: string; videoUrl: string; description?: string }>;
      assets: { id?: string; type: "pdf" | "audio" | "resource"; locale: string; fileUrl: string; fileName?: string | null }[];
    }[]
  >([]);
  const [locale, setLocale] = useState("it");
  const [showPreview, setShowPreview] = useState(false);
  const [toast, setToast] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedLocales, setTranslatedLocales] = useState<string[]>([]);
  const [translationsByLocale, setTranslationsByLocale] = useState<Record<string, Record<string, string>>>({});
  const [allProductTranslations, setAllProductTranslations] = useState<Record<string, Record<string, string>>>({});
  const [pricesByCurrency, setPricesByCurrency] = useState<Record<string, { price: number; lemonVariantId?: string | null }>>({});
  const [countryOverrides, setCountryOverrides] = useState<Record<string, { currency: string; price: number; symbol?: string; lemonVariantId?: string | null }>>({});

  async function fetchProduct() {
    setLoading(true);
    try {
      const res = await fetch(`/api/products/${id}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json() as ProductApiDetail;
      setProduct(data);
      setSlug(data.slug ?? "");
      setPrice(String(data.price ?? 4900));
      setStatus(data.status ?? "draft");
      setTemplateId((data.templateId ?? "lumio") as TemplateId);
      setLemonVariantId(data.lemonVariantId ?? "");
      setCoverPreview(data.coverUrl || null);

      // Prisma Json columns are returned as already-parsed objects.
      if (data.pricesByCurrency) setPricesByCurrency(data.pricesByCurrency);
      if (data.countryOverrides) setCountryOverrides(data.countryOverrides);

      // Build texts from translations
      const byLocale: Record<string, Record<string, string>> = {};
      if (data.translations) {
        for (const t of data.translations) {
          if (!byLocale[t.locale]) byLocale[t.locale] = {};
          byLocale[t.locale][t.section] = t.content;
        }
      }
      setAllProductTranslations(byLocale);
      setTexts(byLocale[locale] ?? byLocale.it ?? {});

      if (data.lessons) {
        const les = data.lessons.map((l) => {
          const translations: Record<string, { title: string; videoUrl: string; description?: string }> = {};
          l.translations?.forEach((t) => {
            translations[t.locale] = {
              title: t.title,
              videoUrl: t.videoUrl ?? "",
              description: t.description ?? undefined,
            };
          });

          return {
            id: l.id,
            translations,
            assets: (l.assets || []).map((a: { id: string; type: string; locale: string; fileUrl: string; fileName: string | null }) => ({
              id: a.id,
              type: a.type as "pdf" | "audio" | "resource",
              locale: a.locale,
              fileUrl: a.fileUrl,
              fileName: a.fileName,
            })),
          };
        });
        setLessons(les);
      }
    } catch {
      alert("Errore nel caricamento del prodotto");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchProduct(); // eslint-disable-line react-hooks/set-state-in-effect -- TODO: refactor (FASE 1.10)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function handleLocaleChange(next: string) {
    setAllProductTranslations((prev) => ({
      ...prev,
      [locale]: { ...(prev[locale] ?? {}), ...texts },
    }));
    setLocale(next);
  }

  useEffect(() => {
    setTexts(allProductTranslations[locale] ?? allProductTranslations.it ?? {}); // eslint-disable-line react-hooks/set-state-in-effect -- TODO: refactor (FASE 1.10)
  }, [locale, allProductTranslations]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          price: parseInt(price),
          coverUrl: coverPreview,
          status,
          templateId,
          lemonVariantId,
          translations: texts,
          // CRITICAL: merge all accumulated manual translations across all
          // locale tabs (they live in `allProductTranslations`). Without this,
          // any edits the user made on inactive tabs are silently dropped on
          // save. AI-produced translations stay live too; in-memory `texts`
          // for the active locale wins last.
          translationsByLocale: {
            ...translationsByLocale,
            ...allProductTranslations,
            [locale]: texts,
          },
          pricesByCurrency: Object.keys(pricesByCurrency).length > 0 ? pricesByCurrency : undefined,
          countryOverrides: Object.keys(countryOverrides).length > 0 ? countryOverrides : undefined,
          lessons,
          sourceLocale: locale,
        }),
      });
      if (res.ok) {
        setToast("Salvato!");
        setTimeout(() => setToast(""), 3000);
        await fetchProduct();
      } else {
        alert("Errore nel salvataggio");
      }
    } catch {
      alert("Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function handleTranslateAI() {
    setIsTranslating(true);
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceLocale: locale,
          targetLocales: ["en", "es", "fr", "de", "pt"].filter(l => l !== locale),
          sections: texts,
        }),
      });
      const data = await res.json() as TranslateApiResponse;
      if (data.translations) {
        setTranslationsByLocale(prev => ({ ...prev, ...data.translations }));
        const locales = Object.keys(data.translations).filter(l => l !== locale);
        setTranslatedLocales(prev => Array.from(new Set([...prev, ...locales])));
        setToast(`Tradotto in: ${locales.map(l => l.toUpperCase()).join(", ")}`);
        setTimeout(() => setToast(""), 4000);
      }
    } catch {
      alert("Errore nella traduzione");
    } finally {
      setIsTranslating(false);
    }
  }

  async function handleGenerateConfig() {
    setGenerating(true);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (res.ok) {
        setToast("config.json generato!");
        setTimeout(() => setToast(""), 3000);
      } else {
        alert("Errore nella generazione config.json");
      }
    } catch {
      alert("Errore nella generazione config.json");
    } finally {
      setGenerating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-dashboard-bg">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <div className="px-8 py-8 max-w-5xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-xl animate-in fade-in slide-in-from-right">{toast}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/admin/products")} className="p-2 text-zinc-400 hover:text-white transition">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-white">Edita Prodotto</h1>
            <p className="text-zinc-500 text-sm mt-1">{slug} — Template: <span className="text-accent-blue">{templateId}</span></p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowPreview((p) => !p)}
            className={`px-6 py-3 rounded-2xl text-sm font-bold border transition flex items-center gap-2 ${
              showPreview
                ? "bg-accent-primary text-white border-accent-primary"
                : "bg-zinc-800 text-white border-zinc-700 hover:bg-zinc-700"
            }`}
          >
            {showPreview ? <X className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showPreview ? "Chiudi" : "Anteprima"}
          </button>
          <a
            href={`/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="px-6 py-3 bg-zinc-800 text-white rounded-2xl text-sm font-bold border border-zinc-700 hover:bg-zinc-700 transition flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4" /> Apri
          </a>
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-3 bg-accent-primary text-white rounded-2xl text-sm font-bold flex items-center gap-2 hover:brightness-110 transition disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salva
          </button>
          <button onClick={handleGenerateConfig} disabled={generating}
            className="px-6 py-3 bg-zinc-800 text-white rounded-2xl text-sm font-bold border border-zinc-700 hover:bg-zinc-700 transition flex items-center gap-2 disabled:opacity-50">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileJson className="w-4 h-4" />}
            Genera config.json
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {/* Template Picker */}
        <section className="glass-card p-6 rounded-3xl border border-white/5">
          <div className="text-white font-semibold mb-4">Template Landing Page</div>
          <div className="flex gap-4">
            {(["lumio", "h612", "horizon"] as TemplateId[]).map((t) => (
              <button key={t} onClick={() => setTemplateId(t)}
                className={`flex-1 p-4 rounded-2xl border transition text-left ${
                  templateId === t
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-zinc-700 bg-zinc-900/50 hover:border-zinc-500"
                }`}>
                <div className="text-white font-bold capitalize">{t}</div>
                <div className="text-xs text-zinc-500 mt-1">
                  {t === "lumio" && "Minimal ivory, sunset, glassmorphism"}
                  {t === "h612" && "Dark monochrome, serif, liquid orbs"}
                  {t === "horizon" && "Airy, atmospheric, cursor glow"}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Copertina */}
        <section className="glass-card p-6 rounded-3xl border border-white/5">
          <div className="text-white font-semibold mb-4 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-accent-primary" /> Copertina
          </div>
          <div className="flex items-center gap-6">
            <ImageUpload
              value={coverPreview}
              onChange={(url) => setCoverPreview(url)}
            />
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-2">
                <input type="text" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Slug prodotto" className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-accent-primary w-full" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-500">#&#8364;</span>
                <input type="number" value={parseInt(price) / 100} onChange={(e) => setPrice(String(parseFloat(e.target.value) * 100))} className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-accent-primary w-32" />
              </div>
              <div className="flex items-center gap-2">
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-accent-primary">
                  <option value="draft">Bozza</option>
                  <option value="published">Pubblicato</option>
                  <option value="archived">Archiviato</option>
                </select>
              </div>
              {/* Lemon Squeezy Variant ID */}
              <div className="pt-4 border-t border-white/5 mt-4">
                <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                  <CreditCard className="w-3 h-3" /> Lemon Squeezy Variant ID
                </label>
                <p className="text-[9px] text-zinc-600 mb-2 font-medium">
                  Imposta questo campo per usare Lemon Squeezy come processore di pagamento.
                </p>
                <input
                  type="text"
                  value={lemonVariantId}
                  onChange={(e) => setLemonVariantId(e.target.value)}
                  placeholder="es. 123456"
                  className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-accent-primary w-full"
                />
              </div>

              {/* Prezzi per valuta */}
              <CurrencyPricesSection
                pricesByCurrency={pricesByCurrency}
                onChange={setPricesByCurrency}
                countryOverrides={countryOverrides}
                onCountryOverridesChange={setCountryOverrides}
              />
            </div>
          </div>
        </section>

        {/* Testi Funnel per locale */}
        <section className="glass-card p-6 rounded-3xl border border-white/5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-white font-semibold">Testi Landing</span>
            <div className="flex items-center gap-3">
              <button
                onClick={handleTranslateAI}
                disabled={isTranslating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-medium border border-zinc-700 hover:bg-zinc-700 transition disabled:opacity-50"
              >
                {isTranslating ? (
                  <><Loader2 className="w-3 h-3 animate-spin" /> Traducendo…</>
                ) : (
                  <><Languages className="w-3 h-3" /> AI Traduci</>
                )}
              </button>
              {translatedLocales.length > 0 && (
                <span className="text-[10px] text-green-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  {translatedLocales.map(l => l.toUpperCase()).join(", ")}
                </span>
              )}
              <LocaleTabs
                locales={["it", "en", "es", "fr", "de", "pt"]}
                active={locale}
                onChange={handleLocaleChange}
              />
            </div>
          </div>
          <div className="space-y-4">
            {FUNNEL_SECTIONS.map((s) => (
              <div key={s.key}>
                <label className="block text-xs text-zinc-500 mb-1 uppercase tracking-wider">{s.label}</label>
                <textarea
                  value={texts[s.key] || ""}
                  onChange={(e) => setTexts((prev) => ({ ...prev, [s.key]: e.target.value }))}
                  rows={s.rows}
                  className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-accent-primary transition-all resize-none"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Lezioni */}
        <section className="glass-card p-6 rounded-3xl border border-white/5">
          <LessonBuilder
            locales={["it", "en", "es", "fr", "de", "pt"]}
            lessons={lessons}
            onChange={setLessons}
          />
        </section>
      </div>

      {/* Live Preview Drawer */}
      {showPreview && (
        <div className="fixed inset-y-0 right-0 w-full md:w-[50vw] lg:w-[45vw] bg-zinc-950 border-l border-white/10 shadow-2xl z-50 flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-zinc-900/50">
            <div>
              <h3 className="text-sm font-bold text-white">Anteprima Live</h3>
              <p className="text-[10px] text-zinc-500">{locale}/{slug}</p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={`/${toFullLocale(locale)}/${slug}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-zinc-400 hover:text-white flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" /> Apri in scheda
              </a>
              <button
                onClick={() => setShowPreview(false)}
                className="p-2 text-zinc-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 relative">
            <iframe
              src={`/${toFullLocale(locale)}/${slug}`}
              title="Anteprima prodotto"
              className="absolute inset-0 w-full h-full bg-white"
            />
          </div>
        </div>
      )}
    </div>
  );
}


