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

  if (data.template === "lumio" || data.template === "h612" || data.template === "horizon") {
    const templateData = mapConfigToTemplateData(data, currentLang);
    if (templateData) {
      const TemplateComponent = data.template === "lumio" ? TemplateLumio 
        : data.template === "h612" ? TemplateH612 
        : TemplateHorizon;
      return (
        <>
          <AnalyticsTracker productSlug={domain} />
          <TemplateComponent data={templateData} locale={currentLang} />
        </>
      );
    }
  }

  // ─── DEFAULT TEMPLATE (Built-in Dark Theme) ────────────────
  return (
    <>
      <AnalyticsTracker productSlug={domain} />
      <div className="min-h-screen bg-[#050505] text-[#e5e2e1] font-hanken overflow-x-hidden">
        {/* Navbar Locale */}
        <nav className="fixed top-0 w-full z-50 bg-black/40 backdrop-blur-md border-b border-white/5">
          <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 premium-glass rounded-xl flex items-center justify-center font-bold text-xl border border-white/10 text-white">C</div>
               <span className="text-2xl font-black tracking-tighter text-white uppercase">{data.slug}.</span>
            </div>
            <div className="hidden md:flex items-center gap-8 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
               <Link href={`/${domain}?lang=it`} className={currentLang === 'it' ? 'text-accent-primary' : 'hover:text-white transition-colors'}>IT</Link>
               <Link href={`/${domain}?lang=en`} className={currentLang === 'en' ? 'text-accent-primary' : 'hover:text-white transition-colors'}>EN</Link>
            </div>
            <Link href={`/${domain}/curso/${firstLessonId}?lang=${currentLang}`} className="glow-btn px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-white premium-glass">
               {content.cta}
            </Link>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="relative pt-40 pb-20 px-6 overflow-hidden">
           <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-accent-primary/10 rounded-full blur-[120px] -z-10" />
           <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-accent-secondary/10 rounded-full blur-[120px] -z-10" />

           <div className="max-w-5xl mx-auto text-center space-y-8 relative">
              <div className="inline-flex items-center gap-2 px-4 py-2 premium-glass rounded-full border border-white/10 text-accent-primary text-[10px] font-black uppercase tracking-[0.3em]">
                 <Zap className="w-3 h-3 fill-current" />
                 New: {content.title}
              </div>
              <h1 className="text-5xl lg:text-8xl font-black text-white text-contrast tracking-tighter leading-[0.9]">
                 {(() => {
                   const parts = content.title.split(":");
                   return parts.length > 1 ? (
                     <>
                       {parts[0]}
                       <br />
                       <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-primary via-accent-secondary to-accent-tertiary">
                         {parts.slice(1).join(":").trim()}
                       </span>
                     </>
                   ) : (
                     content.title
                   );
                 })()}
              </h1>
              <p className="max-w-2xl mx-auto text-zinc-400 text-lg lg:text-xl font-medium leading-relaxed">
                 {content.description}
              </p>
               <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-4">
                 <TrackedCtaButton 
                   href={checkoutUrl}
                   productSlug={domain}
                   productId={data.productId}
                   locale={currentLang}
                   className="glow-btn px-10 py-5 rounded-3xl text-sm font-black text-white flex items-center gap-3 group"
                 >
                   {content.cta}
                 </TrackedCtaButton>
                 <Link href={`/${domain}/curso/${firstLessonId}?lang=${currentLang}${accessToken ? `&token=${accessToken}` : ''}`} className="px-10 py-5 premium-glass rounded-3xl text-sm font-black text-white border border-white/10 hover:bg-white/5 transition-all flex items-center gap-3">
                    <Play className="w-5 h-5 text-accent-primary" /> Area Membri
                 </Link>
              </div>
           </div>
        </section>

        {/* Story & Problem */}
        <section className="py-20 px-6 max-w-4xl mx-auto space-y-16">
           <div className="text-center space-y-4">
              <h2 className="text-3xl lg:text-5xl font-black text-white tracking-tight">{content.problem}</h2>
              <div className="w-20 h-1 bg-accent-primary mx-auto rounded-full" />
           </div>
           <div className="premium-glass p-10 lg:p-16 rounded-[3rem] border border-white/5 relative">
              <div className="absolute top-8 left-8 text-6xl text-white/5 font-black font-serif">&quot;</div>
              <p className="text-xl lg:text-2xl text-zinc-300 leading-relaxed font-medium italic relative z-10">
                 {content.story}
              </p>
           </div>
        </section>

        {/* Product Preview Section */}
        <section className="py-20 px-6">
           <div className="max-w-6xl mx-auto premium-glass rounded-[3rem] border border-white/10 overflow-hidden shadow-2xl relative">
              <div className="aspect-video bg-zinc-900 flex items-center justify-center relative group cursor-pointer">
                 <img src={data.cover} className="w-full h-full object-cover opacity-40 group-hover:scale-105 transition-transform duration-1000" alt="Preview" />
                 <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
                 <a 
                   href={checkoutUrl}
                   className="w-20 h-20 premium-glass rounded-full flex items-center justify-center text-white border-white/20 shadow-2xl relative z-10 group-hover:scale-110 transition-transform"
                 >
                    <Play className="w-8 h-8 fill-current ml-1" />
                 </a>
              </div>
           </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-20 px-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
           <FeatureCard 
              icon={<Zap className="text-accent-primary" />}
              title="Velocità Estrema"
              desc="Ottimizzato per caricamenti istantanei su ogni dispositivo."
           />
           <FeatureCard 
              icon={<Globe className="text-accent-tertiary" />}
              title="Multi-lingua"
              desc="Raggiungi clienti in tutto il mondo con un solo click."
           />
           <FeatureCard 
              icon={<ShieldCheck className="text-accent-secondary" />}
              title="White Label"
              desc="La tua identità, i tuoi colori, il tuo brand. Senza compromessi."
           />
        </section>

        {/* Purchase Section */}
        <section className="py-20 px-6">
           <div className="max-w-3xl mx-auto premium-glass p-12 lg:p-20 rounded-[3rem] border border-white/10 text-center space-y-8 relative overflow-hidden group">
              <div className="absolute -right-20 -top-20 w-64 h-64 bg-accent-primary/10 rounded-full blur-[100px] group-hover:bg-accent-primary/20 transition-all duration-700" />
              
              <img src={data.cover} alt="Bundle" className="w-32 h-32 mx-auto rounded-3xl object-cover shadow-2xl border border-white/10 group-hover:scale-110 transition-transform duration-500" />
              
              <div className="space-y-4">
                 <h2 className="text-3xl lg:text-4xl font-black text-white text-contrast tracking-tight">
                    {content.title}
                 </h2>
                 <p className="text-zinc-500 font-medium">
                    Ottieni l&apos;accesso immediato a tutte le lezioni video <br className="hidden md:block"/> e scarica il manuale in formato PDF.
                 </p>
              </div>

              <div className="pt-6">
                 <div className="text-5xl font-black text-white mb-8 tracking-tighter">
                    {data.prices?.EUR || data.prices?.USD ? getDisplayPriceForCurrency(data) : displayPrice}
                    <span className="text-sm text-zinc-600 font-bold ml-2 uppercase tracking-widest">{currentLang === 'en' ? 'One-Time Payment' : 'Pagamento Unico'}</span>
                 </div>
                 <a 
                   href={checkoutUrl}
                   className="glow-btn block w-full py-5 rounded-3xl text-sm font-black text-white premium-glass uppercase tracking-[0.2em]"
                 >
                    Acquista e Accedi Istantaneamente
                 </a>
                 <p className="mt-6 text-[10px] text-zinc-600 font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                    <ShieldCheck className="w-3 h-3" /> {currentLang === 'en' ? 'Secure encrypted transaction' : 'Transazione sicura crittografata via Stripe'}
                 </p>
              </div>
           </div>
        </section>

        {/* Footer Mock */}
        <footer className="py-20 px-6 border-t border-white/5 mt-20">
           <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-10 opacity-40">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 premium-glass rounded-lg flex items-center justify-center font-bold text-sm border border-white/10 text-white">C</div>
                 <span className="text-xl font-black tracking-tighter text-white">{data.slug}.</span>
              </div>
              <p className="text-xs font-medium text-zinc-500">&copy; 2026 {data.author}. All rights reserved.</p>
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
