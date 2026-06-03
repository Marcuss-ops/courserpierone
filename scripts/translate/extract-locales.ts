/**
 * Extract & Build Locales — Estrae traduzioni esistenti dal DB
 * e dai dati hardcoded di save-all-translations, crea JSON completi
 * per ogni lingua.
 *
 * Uso:
 *   npx tsx scripts/translate/extract-locales.ts <product-slug>
 *   npx tsx scripts/translate/extract-locales.ts amish-secrets
 */

import { prisma } from "../../src/lib/db/prisma";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { resolve } from "path";
import type { LocaleContent } from "../../src/lib/i18n/locale-content";
import { createEmptyLocale } from "../../src/lib/i18n/locale-content";

const DATA_DIR = resolve(__dirname, "..", "..", "data");

// ─── Hardcoded fallback labels (da save-all-translations + book-claude) ───
const FALLBACK_LABELS: Record<string, Record<string, string>> = {
  it: {
    instant_access: "Accesso immediato",
    buy_now_arrow: "Acquista Ora →",
    readers: "1,247+ lettori",
    buy_now_dash: "Acquista Ora —",
    view_modules: "Scopri i Moduli",
    ssl_secure: "Pagamento sicuro SSL",
    instant_download: "Download Immediato",
    lifetime_access: "Accesso a Vita",
    guarantee_days: "30 Giorni Garanzia",
    section_who: "// 01 — Per Chi È",
    is_this_for_you: "Questo corso fa per te?",
    perfect_for: "Perfetto per te se:",
    not_for: "Non fa per te se:",
    section_learn: "// 02 — Cosa Imparerai",
    masters_secrets: "I Segreti dei Maestri Amish",
    modules_desc: "8 moduli pratici che trasformano la saggezza Amish in azioni concrete.",
    section_author: "// 03 — L'Autore",
    behind_course: "Chi c'è dietro questo corso",
    your_name: "Alessandro Rinaldi",
    researcher_author: "Ricercatore · Autore · Viaggiatore",
    author_bio: "Ho vissuto 3 mesi in Pennsylvania, intervistato 12 famiglie Amish e studiato il loro sistema economico.",
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
    guarantee_text: "Provalo per 30 giorni. Se non risparmi almeno €100, ti rimborsiamo l'intero importo.",
    section_testimonials: "// 06 — Testimonianze",
    testimonial_text: "Ho applicato il metodo del budget Amish e in due mesi ho ridotto le spese del 35%.",
    testimonial_name: "Marco R.",
    testimonial_role: "Roma — primi lettori",
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
    legal_note: "Questo è un prodotto digitale informativo. I risultati possono variare.",
    features: "Caratteristiche",
    pricing: "Prezzi",
    testimonials: "Testimonianze",
    contact: "Contatti",
    get_started: "Inizia Ora",
    learn_more: "Scopri di Più",
    member_area: "Area Membri",
    back_to_landing: "Torna alla Landing",
    buy_now: "Acquista Ora",
    currency_symbol: "€",
    new_badge: "Nuovo",
    the_problem: "Il Problema",
    our_story: "La Nostra Storia",
    what_learn: "Cosa Imparerai",
    course_lessons: "Lezioni del Corso",
    curriculum: "Programma",
    free_tier: "Gratis",
    pro_tier: "Professionale",
    per_month: "/mese",
    start_free: "Inizia Gratis",
    popular: "Popolare",
    free_title: "Per iniziare",
    pro_title: "Per crescere",
    trusted_by: "Consigliato da team in tutto il mondo",
    offer_badge: "Offerta di Lancio",
    price_special: "Prezzo speciale di lancio",
    buy_and_access: "Acquista e Accedi Istantaneamente",
    language_switch: "IT",
    language_switch_en: "EN",
  },
  en: {
    instant_access: "Instant access",
    buy_now_arrow: "Buy Now →",
    readers: "1,247+ readers",
    buy_now_dash: "Buy Now —",
    view_modules: "View Modules",
    ssl_secure: "Secure SSL payment",
    instant_download: "Instant Download",
    lifetime_access: "Lifetime Access",
    guarantee_days: "30-Day Guarantee",
    section_who: "// 01 — Who Is This For",
    is_this_for_you: "Is This Course For You?",
    perfect_for: "Perfect for you if:",
    not_for: "Not for you if:",
    section_learn: "// 02 — What You'll Learn",
    masters_secrets: "The Amish Masters' Secrets",
    modules_desc: "8 practical modules that turn Amish wisdom into concrete actions.",
    section_author: "// 03 — The Author",
    behind_course: "Behind This Course",
    your_name: "Your Name Here",
    researcher_author: "Researcher · Author · Traveler",
    author_bio: "I lived 3 months in Pennsylvania, interviewed 12 Amish families, studied their economic system.",
    section_content: "// 04 — Course Content",
    what_inside: "What You'll Find Inside",
    also_includes: "Also includes:",
    inc_full_ebook: "Full eBook (PDF, ePub, Kindle)",
    inc_checklist: "Printable 30-day checklist",
    inc_excel: "Amish budget Excel sheet",
    inc_shopping: "Weekly shopping list template",
    inc_lifetime: "Lifetime member area access",
    inc_updates: "Free future updates",
    section_offer: "// 05 — The Offer",
    invest_yourself: "Invest in Yourself",
    launch_offer: "Launch Offer",
    complete_package: "Complete Package",
    course_value: "Course: $97",
    bonus_value: "Bonus: $27",
    one_time: "One-time payment — no subscription",
    launch_price: "Launch price — then $37",
    inc_course_full: "Full course (value $97)",
    inc_ebook: "eBook PDF, ePub, Kindle",
    inc_checklist2: "Printable 30-day checklist",
    inc_excel2: "Amish budget Excel sheet",
    inc_access_updates: "Lifetime access + updates",
    inc_bonus_shopping: "BONUS: Weekly shopping list (value $27)",
    unlock_now: "Unlock Access Now",
    guarantee_title: "30-Day Money-Back Guarantee",
    guarantee_text: "Try it for 30 days. If you don't save at least $100, we'll refund the full amount.",
    section_testimonials: "// 06 — Testimonials",
    testimonial_text: "I applied the Amish budget method and in two months I cut my expenses by 35%. The 30-day checklist was the turning point. Finally a course that really works.",
    testimonial_name: "Marco R.",
    testimonial_role: "Rome — early readers",
    section_faq: "// 07 — FAQ",
    faq_title: "Frequently Asked Questions",
    offer_valid: "Offer valid this week",
    final_cta: "Start Your Journey to Financial Freedom Today",
    final_sub: "Join hundreds of people who have already transformed their relationship with money.",
    unlock_dash: "Unlock Access —",
    guarantee_badge: "30-Day Guarantee",
    instant_access_badge: "Instant Access",
    lifetime_badge: "Lifetime Updates",
    rights_reserved: "All rights reserved.",
    privacy: "Privacy",
    terms: "Terms",
    legal_note: "This is a digital informational product. Results may vary and depend on personal commitment.",
    features: "Features",
    pricing: "Pricing",
    testimonials: "Testimonials",
    contact: "Contact",
    get_started: "Get Started",
    learn_more: "Learn More",
    member_area: "Member Area",
    back_to_landing: "Back to Landing",
    buy_now: "Buy Now",
    currency_symbol: "$",
    new_badge: "New",
    the_problem: "The Problem",
    our_story: "Our Story",
    what_learn: "What You'll Learn",
    course_lessons: "Course Lessons",
    curriculum: "Curriculum",
    free_tier: "Free",
    pro_tier: "Pro",
    per_month: "/mo",
    start_free: "Start Free",
    popular: "Popular",
    free_title: "To get started",
    pro_title: "To grow",
    trusted_by: "Trusted by teams worldwide",
    offer_badge: "Launch Offer",
    price_special: "Special launch price",
    buy_and_access: "Buy & Access Instantly",
    language_switch: "EN",
    language_switch_en: "EN",
  },
};

const FALLBACK_BENEFITS: Record<string, { title: string; desc: string }[]> = {
  it: [
    { title: "Budget Amish", desc: "Come vivere con il 30% in meno senza sacrifici." },
    { title: "Dispensa Infinita", desc: "Il metodo di conservazione che elimina gli sprechi." },
    { title: "Debito Zero", desc: "Il framework per uscire dai debiti per sempre." },
    { title: "Ripara Tutto", desc: "12 strumenti essenziali per riparare da solo." },
    { title: "Scambio Senza Soldi", desc: "Come attivare una rete di baratto." },
    { title: "Dalla Terra alla Tavola", desc: "Guida all'orto domestico e cucina a spreco zero." },
    { title: "Energia Libera", desc: "Come ridurre le bollette del 50%." },
    { title: "Piano 30 Giorni", desc: "Checklist giorno per giorno per trasformare le finanze." },
  ],
  en: [
    { title: "Amish Budget", desc: "Live on 30% less without sacrifice." },
    { title: "Infinite Pantry", desc: "The food storage method that eliminates waste." },
    { title: "Zero Debt", desc: "The framework to get out of debt forever." },
    { title: "Fix Everything", desc: "12 essential tools to repair yourself." },
    { title: "Money-Free Exchange", desc: "How to activate a barter network." },
    { title: "Farm to Table", desc: "Guide to home gardening and zero-waste cooking." },
    { title: "Free Energy", desc: "How to cut utility bills by 50%." },
    { title: "30-Day Plan", desc: "Day-by-day checklist to transform your finances." },
  ],
};

const FALLBACK_FAQ: Record<string, { q: string; a: string }[]> = {
  it: [
    { q: "Cosa include esattamente?", a: "Ricevi l'eBook completo in PDF, ePub e Kindle. In più hai accesso a vita a tutti gli aggiornamenti futuri." },
    { q: "È in italiano?", a: "Sì, il corso è completamente tradotto in italiano con contenuti aggiuntivi in inglese." },
    { q: "In che formato ricevo il corso?", a: "eBook in PDF, ePub e Kindle. I video sono in MP4, accessibili dall'area riservata." },
    { q: "Quando ricevo l'accesso?", a: "Immediatamente dopo il pagamento." },
    { q: "Se non sono soddisfatto?", a: "Sei protetto dalla garanzia soddisfatti o rimborsati 30 giorni." },
    { q: "Quanto tempo ci vuole?", a: "Il percorso completo si segue in circa 3-4 ore." },
  ],
  en: [
    { q: "What exactly is included?", a: "You get the complete eBook in PDF, ePub, and Kindle formats. Plus lifetime access to all future updates." },
    { q: "Is it in English?", a: "Yes, the course is fully available in English." },
    { q: "What format is the course in?", a: "eBook in PDF, ePub, and Kindle formats. Videos are in MP4 format." },
    { q: "When do I get access?", a: "Immediately after payment." },
    { q: "What if I'm not satisfied?", a: "You're protected by our 30-day money-back guarantee." },
    { q: "How long does it take?", a: "The complete program takes about 3-4 hours." },
  ],
};

// ─── Costruisci LocaleContent da DB e fallback ────────────────
function buildLocaleContent(
  locale: string,
  dbSections: Record<string, string>,
  slug: string,
  author: string,
  authorName: string,
  coverUrl: string,
): LocaleContent {
  const labels = FALLBACK_LABELS[locale] ?? FALLBACK_LABELS["en"]!;
  const benefits = FALLBACK_BENEFITS[locale] ?? FALLBACK_BENEFITS["en"]!;
  const faqItems = FALLBACK_FAQ[locale] ?? FALLBACK_FAQ["en"]!;

  // Leggi UI dal DB (ui_all JSON)
  let uiLabels: Record<string, string> = {};
  try {
    const uiRaw = dbSections["ui_all"];
    if (uiRaw) {
      const parsed = JSON.parse(uiRaw);
      uiLabels = parsed.labels ?? parsed.ui?.labels ?? {};
    }
  } catch {}

  // Fallback a labels hardcoded dove manca UI dal DB
  const mergedLabels = { ...labels, ...uiLabels };

  const content = createEmptyLocale(locale, {
    seo: {
      title: dbSections["seo_title"] || dbSections["titolo"] || slug,
      description: dbSections["seo_description"] || dbSections["sottotitolo"] || "",
      ogImage: dbSections["og_image"] || coverUrl || undefined,
    },
    nav: {
      brand: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, " "),
      features: mergedLabels["features"] || "Features",
      pricing: mergedLabels["pricing"] || "Pricing",
      testimonials: mergedLabels["testimonials"] || "Testimonials",
      faq: mergedLabels["faq"] || "FAQ",
      contact: mergedLabels["contact"] || "Contact",
      get_started: mergedLabels["get_started"] || "Get Started",
      learn_more: mergedLabels["learn_more"] || "Learn More",
      member_area: mergedLabels["member_area"] || "Member Area",
      back_to_landing: mergedLabels["back_to_landing"] || "Back to Landing",
    },
    hero: {
      badge: mergedLabels["new_badge"] || "New",
      title: dbSections["titolo"] || "",
      subtitle: dbSections["sottotitolo"] || "",
      cta: mergedLabels["get_started"] || "Get Started",
      secondary_cta: mergedLabels["learn_more"] || "Learn More",
      price_label: mergedLabels["price_special"] || "Special launch price",
      one_time_payment: mergedLabels["one_time"] || "One-time payment",
    },
    problem: {
      badge: mergedLabels["the_problem"] || "The Problem",
      title: dbSections["problema"] || "",
      text: "",
    },
    story: {
      badge: mergedLabels["our_story"] || "Our Story",
      title: "La mia esperienza tra gli Amish",
      image_captions: [
        "La vita quotidiana nella comunità Amish: semplicità, autosufficienza e saggezza finanziaria.",
        "Il sistema di baratto e scambio che elimina il bisogno di denaro contante.",
        "L'economia domestica Amish: come una famiglia riesce a vivere con il 60% in meno.",
      ],
      quote: dbSections["storia"] || "",
    },
    author: {
      badge: mergedLabels["section_author"] || "// 03 — The Author",
      title: mergedLabels["behind_course"] || "Behind This Course",
      name: authorName || mergedLabels["your_name"] || "Author",
      role: mergedLabels["researcher_author"] || "Researcher · Author",
      bio: mergedLabels["author_bio"] || "",
      tags: ["Saggezza Finanziaria", "Vita Sostenibile", "Educazione"],
    },
    modules: {
      badge: mergedLabels["section_learn"] || "// 02 — What You'll Learn",
      title: mergedLabels["masters_secrets"] || "The Masters' Secrets",
      description: mergedLabels["modules_desc"] || "",
      items: benefits,
    },
    includes: {
      title: mergedLabels["also_includes"] || "Also includes:",
      items: [
        mergedLabels["inc_full_ebook"] || "eBook PDF, ePub, Kindle",
        mergedLabels["inc_checklist"] || "Printable checklist",
        mergedLabels["inc_excel"] || "Excel sheet",
        mergedLabels["inc_shopping"] || "Shopping list",
        mergedLabels["inc_lifetime"] || "Lifetime access",
        mergedLabels["inc_updates"] || "Free updates",
      ],
    },
    testimonials: {
      badge: mergedLabels["section_testimonials"] || "// 06 — Testimonials",
      title: mergedLabels["testimonials"] || "Testimonials",
      items: [
        {
          text: mergedLabels["testimonial_text"] || "",
          name: mergedLabels["testimonial_name"] || "Client",
          role: mergedLabels["testimonial_role"] || "Customer",
        },
      ],
    },
    offer: {
      badge: mergedLabels["launch_offer"] || "Launch Offer",
      title: mergedLabels["invest_yourself"] || "Invest in Yourself",
      complete_package: mergedLabels["complete_package"] || "Complete Package",
      course_value: mergedLabels["course_value"] || "",
      bonus_value: mergedLabels["bonus_value"] || "",
      price_text: "",
      one_time: mergedLabels["one_time"] || "One-time payment",
      launch_price: mergedLabels["launch_price"] || "",
      cta: mergedLabels["unlock_now"] || "Unlock Now",
      guarantee_title: mergedLabels["guarantee_title"] || "Guarantee",
      guarantee_text: mergedLabels["guarantee_text"] || "",
      includes: [
        mergedLabels["inc_course_full"] || "Full course",
        mergedLabels["inc_ebook"] || "eBook",
        mergedLabels["inc_checklist2"] || "Checklist",
        mergedLabels["inc_excel2"] || "Excel sheet",
        mergedLabels["inc_access_updates"] || "Lifetime access",
        mergedLabels["inc_bonus_shopping"] || "Bonus",
      ],
    },
    faq: {
      badge: mergedLabels["section_faq"] || "// 07 — FAQ",
      title: mergedLabels["faq_title"] || "FAQ",
      offer_valid: mergedLabels["offer_valid"] || "Offer valid this week",
      items: faqItems,
    },
    final_cta: {
      title: mergedLabels["final_cta"] || "Start Today",
      subtitle: mergedLabels["final_sub"] || "",
      badge: mergedLabels["offer_valid"] || "Limited offer",
    },
    footer: {
      rights_reserved: mergedLabels["rights_reserved"] || "All rights reserved.",
      privacy: mergedLabels["privacy"] || "Privacy",
      terms: mergedLabels["terms"] || "Terms",
      legal_note: mergedLabels["legal_note"] || "",
      badges: {
        guarantee: mergedLabels["guarantee_badge"] || "Guarantee",
        instant_access: mergedLabels["instant_access_badge"] || "Instant Access",
        lifetime_updates: mergedLabels["lifetime_badge"] || "Lifetime Updates",
      },
    },
    trust: {
      title: mergedLabels["trusted_by"] || "Trusted by teams worldwide",
      readers_count: mergedLabels["readers"] || "1,000+",
      company_names: [],
    },
    ui: {
      labels: mergedLabels,
    },
    audience: {
      badge: mergedLabels["section_who"] || "// 01 — Who Is This For",
      title: mergedLabels["is_this_for_you"] || "Is This For You?",
      perfect_for: mergedLabels["perfect_for"] || "Perfect for you if:",
      perfect_items: [
        mergedLabels["p_struggle"] || "You struggle to make ends meet",
        mergedLabels["p_cut_costs"] || "You want to cut costs",
        mergedLabels["p_consumerism"] || "Tired of consumerism",
        mergedLabels["p_practical"] || "Want practical methods",
        mergedLabels["p_future"] || "Want solid future for family",
      ],
      not_for: mergedLabels["not_for"] || "Not for you if:",
      not_items: [
        mergedLabels["n_quick"] || "Looking for get-rich-quick",
        mergedLabels["n_habits"] || "Don't want to change habits",
        mergedLabels["n_quick_fix"] || "Prefer quick fixes",
        mergedLabels["n_implement"] || "Not willing to implement",
        mergedLabels["n_advice"] || "Looking for personal advice",
      ],
    },
    course: {
      back_to_course: mergedLabels["back_to_landing"] || "Back to Course",
      module_label: mergedLabels["curriculum"] || "Module",
      now_playing: mergedLabels["now_playing"] || "Now playing",
      page_label: "Page",
      reading_progress: mergedLabels["reading_progress"] || "Reading Progress",
      download_pdf: mergedLabels["download_pdf"] || "Download PDF",
      chapter: mergedLabels["chapter"] || "Chapter",
    },
    lessons: {
      badge: mergedLabels["section_content"] || "// 04 — Course Content",
      title: mergedLabels["what_inside"] || "What's Inside",
      items: [],
    },
  });

  return content;
}

// ════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error(`
Uso: npx tsx scripts/translate/extract-locales.ts <product-slug>

Esempi:
  npx tsx scripts/translate/extract-locales.ts amish-secrets
`);
    process.exit(1);
  }

  console.log(`\n📦 Estrazione traduzioni per: ${slug}\n`);

  const product = await prisma.product.findUnique({
    where: { slug },
    include: { translations: true },
  });

  if (!product) {
    console.error(`❌ Prodotto \"${slug}\" non trovato`);
    process.exit(1);
  }

  // Raggruppa traduzioni per locale
  const byLocale: Record<string, Record<string, string>> = {};
  for (const t of product.translations) {
    if (!byLocale[t.locale]) byLocale[t.locale] = {};
    byLocale[t.locale][t.section] = t.content;
  }

  const locales = Object.keys(byLocale);
  console.log(`   Locales trovati: ${locales.length}`);
  console.log(`   Lingue: ${locales.join(", ")}`);

  // Crea directory output
  const outDir = resolve(DATA_DIR, slug);
  mkdirSync(outDir, { recursive: true });

  const authorName = "Alessandro Rinaldi";
  const author = "Brand";
  const coverUrl = product.coverUrl || "";

  let total = 0;
  for (const locale of locales) {
    const content = buildLocaleContent(
      locale,
      byLocale[locale],
      slug,
      author,
      authorName,
      coverUrl,
    );

    const outPath = resolve(outDir, `${locale}.json`);
    writeFileSync(outPath, JSON.stringify(content, null, 2), "utf-8");
    total++;
    console.log(`   ✅ ${locale}.json creato`);
  }

  console.log(`\n✅ Completato! ${total} file JSON creati in data/${slug}/`);
  console.log(`\n👉 Per tradurre con Argos nelle lingue mancanti:`);
  console.log(`   npx tsx scripts/translate/argos-bridge.ts ${locales[0]} en fr de es pt ja ko zh ar hi`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("❌ Errore:", err);
  process.exit(1);
});
