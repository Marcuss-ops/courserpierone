import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import dynamic from "next/dynamic";
import { 
  Play, 
  ShieldCheck, 
  Zap,
  Globe
} from "lucide-react";
import { getCourseConfig, type CourseConfig } from "@/lib/white-label-data";
import { AnalyticsTracker } from "@/components/course/analytics-tracker";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";

// Dynamic imports for template components
const TemplateLumio = dynamic(() => import("@/components/funnel/template-lumio"));
const TemplateH612 = dynamic(() => import("@/components/funnel/template-h612"));
const TemplateHorizon = dynamic(() => import("@/components/funnel/template-horizon"));
const TemplateBookClaude = dynamic(() => import("@/components/funnel/template-book-claude"));

function getPriceString(data: CourseConfig, locale: string): string {
  // Prezzo localizzato se disponibile
  const priceConfig = data.prices?.[locale] || data.prices?.default;
  if (priceConfig) {
    return `${priceConfig.symbol}${priceConfig.amount}`;
  }
  // Fallback: prezzo singolo
  return `€${data.price || 0}`;
}

function getDisplayPriceForCurrency(data: CourseConfig): string {
  // Mostra solo i prezzi effettivamente configurati
  const eur = data.prices?.EUR;
  const usd = data.prices?.USD;
  const prices: string[] = [];
  if (eur) prices.push(`${eur.symbol || '€'}${eur.amount}`);
  if (usd) prices.push(`${usd.symbol || '$'}${usd.amount}`);
  // Se nessuno configurato, mostra default
  if (prices.length === 0) prices.push(`€${data.price || 0}`);
  return prices.join(' / ');
}

function mapConfigToTemplateData(data: CourseConfig, locale: string) {
  const lang = locale || data.defaultLanguage || "it";
  const content = data.languages[lang] || data.languages[Object.keys(data.languages)[0]];
  if (!content) return null;

  return {
    titolo: content.title,
    sottotitolo: content.description,
    problema: content.problem,
    storia: content.story,
    recensioni: "",
    cta: content.cta,
    prezzo: getPriceString(data, lang),
    coverUrl: data.cover,
    lezioni: data.lessons.map((l) => ({
      titolo: l.titles[lang] || Object.values(l.titles)[0] || "",
      descrizione: l.descriptions[lang] || Object.values(l.descriptions)[0] || "",
    })),
  };
}

export default async function LandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ lang?: string; verified_token?: string; token?: string }>;
}) {
  const { domain } = await params;
  const searchParamsResolved = await searchParams;
  const { lang, verified_token, token } = searchParamsResolved;
  const accessToken = verified_token || token;
  const data = await getCourseConfig(domain);

  if (!data) return notFound();

  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get("locale")?.value;

  const currentLang = (lang as "it" | "en") || (cookieLocale as "it" | "en") || (data?.defaultLanguage as "it" | "en") || "it";
  const content = data?.languages?.[currentLang] || data?.languages?.[data.defaultLanguage] || Object.values(data?.languages || {})[0];
  
  if (!data || !content) return notFound();

  const firstLessonId = data.lessons?.[0]?.id || "#";
  const checkoutUrl = data.checkoutUrl || "#";

  // ─── Multi-Template: Render the template from config ──────
  // Helper per prezzo localizzato
  const displayPrice = getPriceString(data, currentLang);

  if (data.template === "lumio" || data.template === "h612" || data.template === "horizon" || data.template === "book-claude" || data.template === "default") {
    const templateData = mapConfigToTemplateData(data, currentLang);
    if (templateData) {
      let TemplateComponent;
      switch(data.template) {
        case "lumio": TemplateComponent = TemplateLumio; break;
        case "h612": TemplateComponent = TemplateH612; break;
        case "horizon": TemplateComponent = TemplateHorizon; break;
        case "book-claude": TemplateComponent = TemplateBookClaude; break;
        default: TemplateComponent = TemplateLumio;
      }
      return (
        <>
          <AnalyticsTracker productSlug={domain} />
          <TemplateComponent data={templateData} locale={currentLang} />
        </>
      );
    }
  }

  // ─── DEFAULT TEMPLATE (Built-in Clean Theme) ────────────────
  return (
    <>
      <AnalyticsTracker productSlug={domain} />
      <div className="min-h-screen bg-white text-gray-900 font-hanken overflow-x-hidden">
        {/* Navbar Locale */}
        <nav className="fixed top-0 w-full z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center font-bold text-xl text-white">C</div>
               <span className="text-2xl font-black tracking-tighter text-gray-900 uppercase">{data.slug}.</span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">
               <Link href={`/${domain}?lang=it`} className={currentLang === 'it' ? 'text-accent-primary' : 'hover:text-gray-900 transition-colors'}>IT</Link>
               <Link href={`/${domain}?lang=en`} className={currentLang === 'en' ? 'text-accent-primary' : 'hover:text-gray-900 transition-colors'}>EN</Link>
            </div>
            <Link href={`/${domain}/curso/${firstLessonId}?lang=${currentLang}`} className="bg-gray-900 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-white hover:bg-gray-800 transition-all">
               {content.cta}
            </Link>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="relative pt-40 pb-20 px-6 overflow-hidden">
           <div className="max-w-5xl mx-auto text-center space-y-8 relative">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-full border border-gray-100 text-gray-600 text-[10px] font-black uppercase tracking-[0.3em]">
                 <Zap className="w-3 h-3 fill-current" />
                 New: {content.title}
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
                 <Link href={`/${domain}/curso/${firstLessonId}?lang=${currentLang}${accessToken ? `&token=${accessToken}` : ''}`} className="px-10 py-5 bg-white rounded-3xl text-sm font-black text-gray-900 border border-gray-200 hover:bg-gray-50 transition-all flex items-center gap-3">
                    <Play className="w-5 h-5 text-gray-400" /> Area Membri
                 </Link>
              </div>
           </div>
        </section>

        {/* Story & Problem */}
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

        {/* Purchase Section */}
        <section className="py-20 px-6">
           <div className="max-w-3xl mx-auto bg-gray-900 p-12 lg:p-20 rounded-[3rem] text-center space-y-8 relative overflow-hidden group">
              <img src={data.cover} alt="Bundle" className="w-32 h-32 mx-auto rounded-3xl object-cover shadow-2xl border border-white/10" />
              
              <div className="space-y-4">
                 <h2 className="text-3xl lg:text-4xl font-black text-white tracking-tight">
                    {content.title}
                 </h2>
                 <p className="text-gray-400 font-medium">
                    Ottieni l&apos;accesso immediato a tutte le lezioni video <br className="hidden md:block"/> e scarica il manuale in formato PDF.
                 </p>
              </div>

              <div className="pt-6">
                 <div className="text-5xl font-black text-white mb-8 tracking-tighter">
                    {data.prices?.EUR || data.prices?.USD ? getDisplayPriceForCurrency(data) : displayPrice}
                    <span className="text-sm text-gray-500 font-bold ml-2 uppercase tracking-widest">{currentLang === 'en' ? 'One-Time Payment' : 'Pagamento Unico'}</span>
                 </div>
                 <TrackedCtaButton 
                   href={checkoutUrl}
                   productSlug={domain}
                   productId={data.productId}
                   locale={currentLang}
                   className="block w-full py-5 rounded-3xl text-sm font-black text-gray-900 bg-white uppercase tracking-[0.2em] hover:bg-gray-100 transition-all"
                 >
                    Acquista e Accedi Istantaneamente
                 </TrackedCtaButton>
              </div>
           </div>
        </section>

        {/* Footer Mock */}
        <footer className="py-20 px-6 border-t border-gray-100 mt-20">
           <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10 opacity-60">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center font-bold text-sm text-white">C</div>
                 <span className="text-xl font-black tracking-tighter text-gray-900">{data.slug}.</span>
              </div>
              <p className="text-xs font-medium text-gray-500">&copy; 2026 {data.author}. All rights reserved.</p>
           </div>
        </footer>
      </div>
    </>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="premium-glass p-10 rounded-[2.5rem] border border-white/5 group hover:border-white/20 transition-all duration-500">
       <div className="w-12 h-12 premium-glass rounded-2xl flex items-center justify-center mb-6 border-white/10 group-hover:scale-110 transition-transform shadow-lg">
          {icon}
       </div>
       <h3 className="text-xl font-bold text-white mb-3 text-contrast">{title}</h3>
       <p className="text-zinc-500 text-sm font-medium leading-relaxed">{desc}</p>
    </div>
  );
}
