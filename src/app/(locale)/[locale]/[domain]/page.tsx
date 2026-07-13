import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";

export const dynamic = "force-dynamic";
import type { Metadata } from "next";
import nextDynamic from "next/dynamic";
import { Play, Zap } from "lucide-react";
import { getCourseConfig, type CourseConfig } from "@/lib/config/white-label-data";
import { getPriceString, getCurrentAmountAndSymbol } from "@/lib/utils/pricing";
import { loadLocaleContentSafe } from "@/lib/i18n/load-locale-content";
import type { LocaleContent } from "@/lib/i18n/locale-content";
import { AnalyticsTracker } from "@/components/course/analytics-tracker";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import LanguageAlert from "@/components/funnel/language-alert";
import SocialProof from "@/components/funnel/social-proof";

// ─── All supported locale codes ────────────────
const ALL_LOCALES = [
  "it-it", "en-us", "en-gb", "fr-fr", "de-de", "es-es", "pt-pt",
  "nl-nl", "pl-pl", "sv-se", "da-dk", "nb-no", "fi-fi", "ro-ro",
  "cs-cz", "hu-hu", "el-gr", "bg-bg", "hr-hr", "sk-sk", "sl-si",
  "lt-lt", "lv-lv", "et-ee", "de-at", "de-ch", "fr-ch", "it-ch",
  "nl-be", "fr-be", "en-ie", "en-ca", "fr-ca", "es-mx", "pt-br",
  "es-ar", "es-co", "es-cl", "es-pe", "en-au", "en-nz",
  "ja-jp", "ko-kr", "zh-cn", "zh-tw", "zh-hk", "hi-in", "en-in",
  "tr-tr", "th-th", "vi-vn", "id-id", "ms-my", "en-sg", "en-ph",
  "ur-pk", "bn-bd", "ar-ae", "ar-sa", "ar-eg", "he-il",
  "ta-in", "te-in", "mr-in", "en-za", "en-ng", "en-ke", "fr-ma",
  "ru-ru", "uk-ua", "ro-md",
];

// Backward compat: also accept 2-letter language codes
const LANG_CODES = [...new Set(ALL_LOCALES.map((l) => l.split("-")[0]))];

const DEFAULT_LOCALE = "en-us";

// ─── Extract language code from locale ──────────
function localeToLang(locale: string): string {
  return locale.split("-")[0]?.toLowerCase() ?? "en";
}

// ─── Country price override (delegata a shared helper) ────
// getCountryPriceOverride è importata da @/lib/utils/pricing

// ─── Generate full SEO metadata per locale ─────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; domain: string }>;
}): Promise<Metadata> {
  const { locale, domain } = await params;

  let host = "www.courssy.com";
  try {
    const h = await headers();
    host = h.get("host") ?? host;
  } catch {}

  const scheme = process.env.NODE_ENV === "development" ? "http" : "https";
  const baseUrl = `${scheme}://${host}`;
  const currentUrl = `${baseUrl}/${locale}/${domain}`;

  // Load product config to get SEO data for this locale
  const lang = localeToLang(locale);
  const data = await getCourseConfig(domain);

  // Resolve SEO metadata: try full locale → language code → default
  const langEntry =
    data?.languages?.[locale] ??
    data?.languages?.[lang] ??
    data?.languages?.[data?.defaultLanguage ?? "en"];

  const seo = langEntry?.seo;

  const title = seo?.title || langEntry?.title || domain;
  const description = seo?.description || langEntry?.description || "";
  
  // Dynamically generate Open Graph social preview cards in the current language
  const ogImage = `${baseUrl}/api/og?title=${encodeURIComponent(title)}&author=${encodeURIComponent(data?.author || "")}&accent=${encodeURIComponent(data?.accentColor || "#C9840D")}`;

  // Full hreflang for all 71 locales
  const languages: Record<string, string> = {};
  for (const loc of ALL_LOCALES) {
    languages[loc] = `${baseUrl}/${loc}/${domain}`;
  }
  languages["x-default"] = `${baseUrl}/${DEFAULT_LOCALE}/${domain}`;

  return {
    title,
    description,
    // Open Graph
    openGraph: {
      title,
      description,
      url: currentUrl,
      type: "website",
      siteName: "Courssy",
      locale: locale.replace("-", "_"), // og:locale usa underscore: "it_IT"
      ...(ogImage ? {
        images: [
          {
            url: ogImage.startsWith("http") ? ogImage : `${baseUrl}${ogImage}`,
            width: 1200,
            height: 630,
            alt: title,
          },
        ],
      } : {}),
    },
    // Twitter Card
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(ogImage ? {
        images: [ogImage.startsWith("http") ? ogImage : `${baseUrl}${ogImage}`],
      } : {}),
    },
    // Canonical + hreflang
    alternates: {
      canonical: currentUrl,
      languages,
    },
  };
}

// Dynamic imports for template components
const TemplateLumio = nextDynamic(() => import("@/components/funnel/template-lumio"));
const TemplateH612 = nextDynamic(() => import("@/components/funnel/template-h612"));
const TemplateHorizon = nextDynamic(() => import("@/components/funnel/template-horizon"));
const TemplateBookClaude = nextDynamic(() => import("@/components/funnel/template-book-claude"));
const TemplateAmish = nextDynamic(() => import("@/components/funnel/template-amish"));

// getPriceString è importata da @/lib/utils/pricing

// getDisplayPriceForCurrency rimossa — usare getPriceString dal shared helper

function mapConfigToTemplateData(data: CourseConfig, locale: string, lang: string, localeContent?: LocaleContent, country?: string) {
  const content = data.languages[lang] ?? data.languages[Object.keys(data.languages)[0]];
  if (!content) return null;

  const { price, currency } = getPriceString(data, locale, country);
  const { currentAmount, symbol, baseAmount } = getCurrentAmountAndSymbol(data, locale, country);

  return {
    titolo: content.title,
    sottotitolo: content.description,
    problema: content.problem,
    storia: content.story,
    recensioni: content.story ?? "",
    cta: content.cta,
    prezzo: price,
    currency,
    currentAmount,
    baseAmount,
    currencySymbol: symbol,
    coverUrl: data.cover || localeContent?.seo?.ogImage || "",
    authorImageUrl: data.authorImageUrl,
    storyImages: data.storyImages,
    accentColor: data.accentColor,
    author: data.author,
    languages: data.languages,
    ui: content.ui ?? undefined,
    testimonials: (content.ui as { testimonials?: Array<{ name: string; location: string; avatar: string; text: string }> } | undefined)?.testimonials ?? undefined,
    localeContent,
    lezioni: data.lessons.map((l) => ({
      titolo: l.titles[lang] ?? Object.values(l.titles)[0] ?? "",
      descrizione: l.descriptions[lang] ?? Object.values(l.descriptions)[0] ?? "",
    })),
  };
}

function flattenObject(obj: Record<string, unknown> | null | undefined, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  if (!obj || typeof obj !== "object") return result;

  for (const [key, val] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    if (typeof val === "string") {
      result[newKey] = val;
    } else if (typeof val === "object" && !Array.isArray(val)) {
      // val is narrowed to `object | null` by the typeof guard above; cast
      // is safe for the recursive call (the function only reads indexable
      // string keys via Object.entries).
      Object.assign(result, flattenObject(val as Record<string, unknown>, newKey));
    } else if (Array.isArray(val)) {
      val.forEach((item, index) => {
        if (typeof item === "string") {
          result[`${newKey}_${index + 1}`] = item;
        } else if (typeof item === "object") {
          // Same as the val cast above: item is narrowed to `object` after
          // the `typeof item === "object"` check, and the recursive call
          // only reads indexable string keys.
          Object.assign(result, flattenObject(item as Record<string, unknown>, `${newKey}_${index + 1}`));
        }
      });
    }
  }
  return result;
}

export default async function LocaleLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; domain: string }>;
  searchParams: Promise<{ verified_token?: string; token?: string; country?: string }>;
}) {
  const { locale, domain } = await params;
  const searchParamsResolved = await searchParams;
  const { verified_token, token, country: countryOverride } = searchParamsResolved;
  const accessToken = verified_token || token;

  // Validate locale
  const safeLocale = ALL_LOCALES.includes(locale) || LANG_CODES.includes(locale)
    ? locale
    : DEFAULT_LOCALE;
  const safeLang = localeToLang(safeLocale);

  const data = await getCourseConfig(domain);
  if (!data) return notFound();

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("locale")?.value;

  const currentLang = safeLang ?? localeToLang(cookieLocale ?? "") ?? data?.defaultLanguage ?? "en";
  const currentLocale = safeLocale;

  // Try: full locale code → language code → data default → first
  const content =
    data?.languages?.[currentLocale] ??
    data?.languages?.[currentLang] ??
    data?.languages?.[data.defaultLanguage] ??
    Object.values(data?.languages ?? {})[0];

  if (!data || !content) return notFound();

  const firstLessonId = data.lessons?.[0]?.id ?? "#";
  const checkoutUrl = data.checkoutUrl ?? "#";

  // ─── Rileva paese visitatore (per badge e prezzi) ──
  const headersList = await headers();
  const countryCode = countryOverride || headersList.get("x-vercel-ip-country") || headersList.get("cf-ipcountry") || "IT";

  // ─── Prezzo dinamico per paese ────────────────────
  const { price: displayPrice } = getPriceString(data, currentLocale, countryCode);

  // ─── Carica LocaleContent per la lingua corrente ──
  const localeContent = loadLocaleContentSafe(domain, currentLocale);

  // Flatten root-level fields and merge into ui.labels so flat-key lookups work correctly
  const flatFields = flattenObject({
    nav: localeContent.nav,
    hero: localeContent.hero,
    problem: localeContent.problem,
    story: localeContent.story,
    author: localeContent.author,
    modules: localeContent.modules,
    includes: localeContent.includes,
    testimonials: localeContent.testimonials,
    offer: localeContent.offer,
    faq: localeContent.faq,
    final_cta: localeContent.final_cta,
    footer: localeContent.footer,
    trust: localeContent.trust,
    audience: localeContent.audience,
  });

  if (!localeContent.ui) localeContent.ui = { labels: {} };
  if (!localeContent.ui.labels) localeContent.ui.labels = {};
  
  const getLocalizedCountryName = (code: string, langCode: string): string => {
    try {
      const displayNames = new Intl.DisplayNames([langCode], { type: "region" });
      return displayNames.of(code.toUpperCase()) || code;
    } catch {
      return code;
    }
  };

  const currentBadgeTemplate = localeContent.ui.labels.hero_badge || "Method tested in Italy • 2026";
  const visitorCountryName = getLocalizedCountryName(countryCode, currentLang);
  
  // Replace the default reference country (Italy/Italia/Italien/Италии) in the template badge
  const italyNames = [
    "Italia", "Italy", "Italien", "Italie", "Itália", "Италии", "Италия", "Włoszech", "Włochy", "İtalya"
  ];
  let resolvedBadge = currentBadgeTemplate;
  for (const name of italyNames) {
    if (resolvedBadge.includes(name)) {
      resolvedBadge = resolvedBadge.replace(name, visitorCountryName);
      break;
    }
  }

  localeContent.ui.labels = {
    ...flatFields,
    ...localeContent.ui.labels,
    hero_badge: resolvedBadge,
  };

  const lc = localeContent; // shorthand

  // ─── Multi-Template ────────────────────────────
  if (data.template === "lumio" || data.template === "h612" || data.template === "horizon" || data.template === "book-claude" || data.template === "amish" || data.template === "default") {
    const templateData = mapConfigToTemplateData(data, currentLocale, currentLang, localeContent, countryCode);
    if (templateData) {
      let TemplateComponent;
      switch (data.template) {
        case "lumio": TemplateComponent = TemplateLumio; break;
        case "h612": TemplateComponent = TemplateH612; break;
        case "horizon": TemplateComponent = TemplateHorizon; break;
        case "book-claude": TemplateComponent = TemplateBookClaude; break;
        case "amish": TemplateComponent = TemplateAmish; break;
        default: TemplateComponent = TemplateLumio;
      }
      return (
        <>
          <LanguageAlert
            currentLocale={currentLocale}
            productSlug={domain}
            availableLangs={Object.keys(data.languages)}
            accentColor={data.accentColor ?? undefined}
          />
          <AnalyticsTracker productSlug={domain} />
          <TemplateComponent
            data={templateData}
            locale={currentLocale}
            productId={data.productId}
            productSlug={domain}
            checkoutUrl={checkoutUrl}
          />
          <SocialProof productSlug={domain} locale={currentLocale} />
        </>
      );
    }
  }

  // ─── DEFAULT TEMPLATE ──────────────────────────
  return (
    <>
      <LanguageAlert
        currentLocale={currentLocale}
        productSlug={domain}
        availableLangs={Object.keys(data.languages)}
        accentColor={data.accentColor ?? undefined}
      />
      <AnalyticsTracker productSlug={domain} />
      <SocialProof productSlug={domain} locale={currentLocale} />
      <div className="min-h-screen bg-white text-gray-900 font-hanken overflow-x-hidden">
        <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center font-bold text-xl text-white">C</div>
               <span className="text-2xl font-black tracking-tighter text-gray-900 uppercase">{data.slug}.</span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
               <a href={`/${currentLocale === "it-it" ? "en-us" : "it-it"}/${domain}`} className="hover:text-gray-900 transition-colors">
                 {currentLocale === "it-it" ? lc?.nav?.get_started || "EN" : lc?.nav?.get_started || "IT"}
               </a>
            </div>
            <Link href={`/${currentLocale}/${domain}/curso/${firstLessonId}${accessToken ? `?token=${accessToken}` : ""}`} className="bg-gray-900 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-white hover:bg-gray-800 transition-all">
               {content.cta}
            </Link>
          </div>
        </nav>

        <section className="relative pt-40 pb-20 px-6 overflow-hidden">
           <div className="max-w-5xl mx-auto text-center space-y-8 relative">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full border border-gray-100 text-gray-600 text-[10px] font-black uppercase tracking-[0.3em]">
                 <Zap className="w-3 h-3 fill-current" />
                 {lc?.hero?.badge || "New"}: {content.title}
              </div>
              <h1 className="text-5xl lg:text-8xl font-black text-gray-900 tracking-tighter leading-[0.9]">
                 {content.title}
              </h1>
              <p className="max-w-2xl mx-auto text-gray-500 text-lg lg:text-xl font-medium leading-relaxed">
                 {content.description}
              </p>
               <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4">
                 <TrackedCtaButton
                   href={checkoutUrl}
                   productSlug={domain}
                   productId={data.productId}
                   locale={currentLang}
                   className="bg-gray-900 px-10 py-5 rounded-3xl text-sm font-black text-white flex items-center gap-3 group hover:bg-gray-800 transition-all shadow-xl"
                 >
                   {content.cta}
                 </TrackedCtaButton>
                 <Link href={`/${currentLocale}/${domain}/curso/${firstLessonId}${accessToken ? `?token=${accessToken}` : ""}`} className="px-10 py-5 bg-white rounded-3xl text-sm font-black text-gray-900 border border-gray-200 hover:bg-gray-50 transition-all flex items-center gap-3">
                    <Play className="w-5 h-5 text-gray-400" /> {lc?.nav?.member_area || "Member Area"}
                 </Link>
              </div>
           </div>
        </section>

        <section className="py-20 px-6 max-w-4xl mx-auto space-y-16">
           <div className="text-center space-y-4">
              <h2 className="text-3xl lg:text-5xl font-black text-gray-900 tracking-tight">{content.problem}</h2>
              <div className="w-20 h-1 bg-gray-900 mx-auto rounded-full" />
           </div>
           <div className="bg-gray-50 p-10 lg:p-16 rounded-[3rem] border border-gray-100 relative">
              <div className="absolute top-8 left-8 text-6xl text-gray-200 font-black font-serif">&quot;</div>
              <p className="text-xl lg:text-2xl text-gray-600 leading-relaxed font-medium italic relative z-10">
                 {content.story}
              </p>
           </div>
        </section>

        <section className="py-20 px-6">
           <div className="max-w-3xl mx-auto bg-gray-900 p-12 lg:p-20 rounded-[3rem] text-center space-y-8 relative overflow-hidden group">
              <img src={data.cover} alt="Bundle" className="w-32 h-32 mx-auto rounded-3xl object-cover shadow-2xl border border-white/10" />
              <div className="space-y-4">
                 <h2 className="text-3xl lg:text-4xl font-black text-white tracking-tight">{content.title}</h2>
                 <p className="text-gray-400 font-medium">
                    {lc?.offer?.guarantee_text || "Get instant access to all video lessons."}
                 </p>
              </div>
              <div className="pt-6">
                 <div className="text-5xl font-black text-white mb-8 tracking-tighter">
                    {displayPrice}
                    <span className="text-sm text-gray-500 font-bold ml-2 uppercase tracking-widest">{lc?.offer?.one_time || "One-Time Payment"}</span>
                 </div>
                 <TrackedCtaButton
                   href={checkoutUrl}
                   productSlug={domain}
                   productId={data.productId}
                   locale={currentLang}
                   className="block w-full py-5 rounded-3xl text-sm font-black text-gray-900 bg-white uppercase tracking-[0.2em] hover:bg-gray-100 transition-all"
                 >
                    {lc?.offer?.cta || "Buy & Access Instantly"}
                 </TrackedCtaButton>
              </div>
           </div>
        </section>

        <footer className="py-20 px-6 border-t border-gray-100 mt-20">
           <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10 opacity-60">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center font-bold text-sm text-white">C</div>
                 <span className="text-xl font-black tracking-tighter text-gray-900">{data.slug}.</span>
              </div>
              <p className="text-xs font-medium text-gray-500">&copy; 2026 {data.author}. {lc?.footer?.rights_reserved || "All rights reserved."}</p>
           </div>
        </footer>
      </div>
    </>
  );
}
