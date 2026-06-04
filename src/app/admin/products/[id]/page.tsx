"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ImageUpload } from "@/components/admin/image-upload";
import { CurrencyPricesSection } from "@/components/admin/currency-prices";
import type { TemplateId } from "@/components/funnel";
import type { ProductApiDetail, TranslateApiResponse } from "@/lib/utils/api-types";
import {
  ArrowLeft,
  Save,
  Image as ImageIcon,
  Plus,
  Trash2,
  Globe,
  FileJson,
  Loader2,
  CreditCard,
  Languages,
  CheckCircle2
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
  const [lessons, setLessons] = useState<{ id?: string; title: string; videoUrl: string }[]>([]);
  const [locale, setLocale] = useState("it");
  const [toast, setToast] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translatedLocales, setTranslatedLocales] = useState<string[]>([]);
  const [translationsByLocale, setTranslationsByLocale] = useState<Record<string, Record<string, string>>>({});
  const [pricesByCurrency, setPricesByCurrency] = useState<Record<string, { price: number; lemonVariantId?: string | null; stripePriceId?: string | null }>>({});
  const [countryOverrides, setCountryOverrides] = useState<Record<string, { currency: string; price: number; symbol?: string; lemonVariantId?: string | null; stripePriceId?: string | null }>>({});

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

      // Parse pricesByCurrency
      if (data.pricesByCurrency) {
        try {
          setPricesByCurrency(JSON.parse(data.pricesByCurrency));
        } catch {}
      }

      // Parse countryOverrides
      if (data.countryOverrides) {
        try {
          setCountryOverrides(JSON.parse(data.countryOverrides));
        } catch {}
      }

      // Build texts from translations
      const txts: Record<string, string> = {};
      if (data.translations) {
        for (const t of data.translations) {
          if (t.locale === locale || (!txts[t.section] && t.locale === "it")) {
            txts[t.section] = t.content;
          }
        }
      }
      setTexts(txts);

      if (data.lessons) {
        const les = data.lessons.map((l) => ({
          id: l.id,
          title: l.translations?.[0]?.title ?? "",
          videoUrl: l.translations?.[0]?.videoUrl ?? "",
        }));
        setLessons(les);
      }
    } catch {
      alert("Errore nel caricamento del prodotto");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchProduct();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
          translationsByLocale,
          pricesByCurrency: Object.keys(pricesByCurrency).length > 0 ? pricesByCurrency : undefined,
          countryOverrides: Object.keys(countryOverrides).length > 0 ? countryOverrides : undefined,
          lessons,
          sourceLocale: locale,
        }),
      });
      if (res.ok) {
        setToast("Salvato!");
        setTimeout(() => setToast(""), 3000);
      }      } catch {
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
            {(["lumio", "h612", "horizon", "book-claude", "amish"] as TemplateId[]).map((t) => (
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
                  {t === "book-claude" && "Modern white, editorial, minimal"}
                  {t === "amish" && "Warm orange, Playfair serif, storytelling"}
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
                  Imposta questo campo per usare Lemon Squeezy come processore di pagamento invece di Stripe.
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
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-zinc-500" />
                <select value={locale} onChange={(e) => { setLocale(e.target.value); }} className="bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white">
                  <option value="it">IT</option>
                  <option value="en">EN</option>
                  <option value="es">ES</option>
                  <option value="fr">FR</option>
                  <option value="de">DE</option>
                </select>
              </div>
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
          <div className="flex items-center justify-between mb-4">
            <span className="text-white font-semibold">Lezioni Video</span>
            <button onClick={() => setLessons((p) => [...p, { title: "", videoUrl: "" }])} className="text-sm text-accent-primary flex items-center gap-1"><Plus className="w-4 h-4" /> Aggiungi</button>
          </div>
          <div className="space-y-3">
            {lessons.map((l, i) => (
              <div key={i} className="flex items-start gap-3 bg-zinc-900/30 p-4 rounded-2xl">
                <span className="w-8 h-8 rounded-xl bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">{i + 1}</span>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input type="text" value={l.title} onChange={(e) => { const n = [...lessons]; n[i].title = e.target.value; setLessons(n); }} placeholder="Titolo lezione" className="bg-transparent border-b border-zinc-800 px-1 py-2 text-sm text-white focus:outline-none focus:border-accent-primary" />
                  <input type="text" value={l.videoUrl} onChange={(e) => { const n = [...lessons]; n[i].videoUrl = e.target.value; setLessons(n); }} placeholder="URL YouTube" className="bg-transparent border-b border-zinc-800 px-1 py-2 text-sm text-white focus:outline-none focus:border-accent-primary" />
                </div>
                <button onClick={() => setLessons((p) => p.filter((_, idx) => idx !== i))} className="p-2 text-zinc-600 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

