/**
 * Seed UI translations into ProductTranslation table.
 * Stores ALL UI strings (labels + benefits + faq) as a single JSON blob
 * in section "ui_all" per locale.
 *
 * Run: npx tsx scripts/seed-ui-translations.ts
 */
import { prisma } from "../src/lib/prisma";

const SLUG = "amish-secrets";

// ─── Italian ────────────────────────────────────
const UI_IT = {
  labels: {
    // Sticky mobile
    instant_access: "Accesso immediato",
    buy_now_arrow: "Acquista Ora →",

    // Hero
    readers: "1,247 lettori",
    buy_now_dash: "Acquista Ora —",
    view_modules: "Scopri i Moduli",
    ssl_secure: "Pagamento sicuro SSL",
    instant_download: "Download Immediato",
    lifetime_access: "Accesso a Vita",
    guarantee_days: "30 Giorni Garanzia",

    // Per chi è
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

    // Cosa imparerai
    section_learn: "// 02 — Cosa Imparerai",
    masters_secrets: "I Segreti dei Maestri Amish",
    modules_desc:
      "8 moduli pratici che trasformano la saggezza Amish in azioni concrete per la tua vita quotidiana.",

    // Autore
    section_author: "// 03 — L'Autore",
    behind_course: "Chi c'è dietro questo corso",
    your_name: "Il Tuo Nome Qui",
    researcher_author: "Ricercatore · Autore",
    author_bio:
      "[Aggiungi qui la tua storia: ho vissuto 3 mesi in Pennsylvania, intervistato 12 famiglie Amish, studiato il loro sistema economico. Nessuna teoria, solo pratiche.]",

    // Contenuto
    section_content: "// 04 — Contenuto del Corso",
    what_inside: "Cosa Troverai Dentro",
    also_includes: "Include anche:",
    inc_full_ebook: "eBook completo (PDF, ePub, Kindle)",
    inc_checklist: "Checklist stampabile 30 giorni",
    inc_excel: "Foglio Excel budget Amish",
    inc_shopping: "Lista della spesa settimanale",
    inc_lifetime: "Accesso a vita all'area riservata",
    inc_updates: "Aggiornamenti gratuiti futuri",

    // Offerta
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
    guarantee_text:
      "Provalo per 30 giorni. Se non risparmi almeno €100, ti rimborsiamo l'intero importo. Nessuna domanda, nessuna scadenza.",

    // Testimonianze
    section_testimonials: "// 06 — Testimonianze",
    reviewer: "Marco R., primi lettori",

    // FAQ
    section_faq: "// 07 — FAQ",
    faq_title: "Domande Frequenti",

    // Final CTA
    offer_valid: "Offerta valida questa settimana",
    final_cta:
      "Inizia oggi il tuo percorso verso la libertà finanziaria",
    final_sub:
      "Unisciti a centinaia di persone che hanno già trasformato il loro rapporto con il denaro.",
    unlock_dash: "Sblocca Accesso —",
    guarantee_badge: "30 Giorni Soddisfatti",
    instant_access_badge: "Accesso Istantaneo",
    lifetime_badge: "Aggiornamenti a Vita",

    // Footer
    rights_reserved: "Tutti i diritti riservati.",
    privacy: "Privacy",
    terms: "Termini",
  },
  benefits: [
    { title: "Budget Amish", desc: "Come vivere con il 30% in meno senza sacrifici — il sistema di bilancio che funziona da 300 anni." },
    { title: "Dispensa Infinita", desc: "Il metodo di conservazione e gestione delle scorte che elimina gli sprechi e taglia la spesa del 40%." },
    { title: "Debito Zero", desc: "Il framework per uscire dai debiti e non tornarci mai più. Niente credito, niente rate, niente interessi." },
    { title: "Ripara Tutto", desc: "12 strumenti essenziali e come usarli per riparare casa, vestiti e oggetti da solo. Addio artigiani costosi." },
    { title: "Scambio Senza Soldi", desc: "Come attivare una rete di baratto nella tua comunità per ottenere servizi gratuitamente." },
    { title: "Dalla Terra alla Tavola", desc: "Guida pratica all'orto domestico e alla cucina a spreco zero. Anche in un balcone." },
    { title: "Energia Libera", desc: "Come ridurre le bollette del 50% con soluzioni a basso costo ispirate alla vita Amish." },
    { title: "Piano 30 Giorni", desc: "Checklist stampabile giorno per giorno per trasformare le tue finanze in un mese." },
  ],
  faq: [
    { q: "Cosa include esattamente?", a: "Ricevi l'eBook completo in PDF, ePub e Kindle. In più hai accesso a vita a tutti gli aggiornamenti futuri e all'area riservata." },
    { q: "È in italiano?", a: "Sì, il corso è completamente tradotto in italiano con contenuti aggiuntivi in inglese." },
    { q: "In che formato ricevo il corso?", a: "eBook in PDF (impaginato), ePub (reflowable) e formato Kindle. I video sono in MP4, accessibili dall'area riservata." },
    { q: "Quando ricevo l'accesso?", a: "Immediatamente dopo il pagamento. Ricevi una email con il link all'area riservata dove trovi tutto." },
    { q: "Se non sono soddisfatto?", a: "Nessun problema. Sei protetto dalla garanzia soddisfatti o rimborsati 30 giorni. Se non risparmi almeno €100, ti rimborsiamo. Nessuna domanda." },
    { q: "Quanto tempo ci vuole?", a: "Il percorso completo si segue in circa 3-4 ore. Ogni modulo è pensato per sessioni da 20 minuti." },
  ],
};

// ─── English ─────────────────────────────────────
const UI_EN = {
  labels: {
    instant_access: "Instant access",
    buy_now_arrow: "Buy Now →",

    readers: "1,247 readers",
    buy_now_dash: "Buy Now —",
    view_modules: "View Modules",
    ssl_secure: "Secure SSL payment",
    instant_download: "Instant Download",
    lifetime_access: "Lifetime Access",
    guarantee_days: "30-Day Guarantee",

    section_who: "// 01 — Who Is This For",
    is_this_for_you: "Is This Course For You?",
    perfect_for: "Perfect for you if:",
    p_struggle: "You struggle to make ends meet",
    p_cut_costs: "You want to cut costs without sacrificing quality of life",
    p_consumerism: "You're tired of the consumerism and debt culture",
    p_practical: "You want practical, time-tested methods",
    p_future: "You want to build a solid financial future for your family",
    not_for: "Not for you if:",
    n_quick: "You're looking for get-rich-quick schemes",
    n_habits: "You don't want to change your spending habits",
    n_quick_fix: "You prefer quick fixes over a solid foundation",
    n_implement: "You're not willing to implement what you learn",
    n_advice: "You're looking for personalized financial advice",

    section_learn: "// 02 — What You'll Learn",
    masters_secrets: "The Amish Masters' Secrets",
    modules_desc:
      "8 practical modules that turn Amish wisdom into concrete actions for your daily life.",

    section_author: "// 03 — The Author",
    behind_course: "Behind This Course",
    your_name: "Your Name Here",
    researcher_author: "Researcher · Author",
    author_bio:
      "[Add your story here: I lived 3 months in Pennsylvania, interviewed 12 Amish families, studied their economic system. No theory, only practice.]",

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
    guarantee_text:
      "Try it for 30 days. If you don't save at least $100, we'll refund the full amount. No questions, no hassle.",

    section_testimonials: "// 06 — Testimonials",
    reviewer: "Marco R., early reader",

    section_faq: "// 07 — FAQ",
    faq_title: "Frequently Asked Questions",

    offer_valid: "Offer valid this week",
    final_cta: "Start Your Journey to Financial Freedom Today",
    final_sub:
      "Join hundreds of people who have already transformed their relationship with money.",
    unlock_dash: "Unlock Access —",
    guarantee_badge: "30-Day Guarantee",
    instant_access_badge: "Instant Access",
    lifetime_badge: "Lifetime Updates",

    rights_reserved: "All rights reserved.",
    privacy: "Privacy",
    terms: "Terms",
  },
  benefits: [
    { title: "Amish Budget", desc: "Live on 30% less without sacrifice — the budgeting system that has worked for 300 years." },
    { title: "Infinite Pantry", desc: "The food storage and management method that eliminates waste and cuts grocery bills by 40%." },
    { title: "Zero Debt", desc: "The framework to get out of debt and stay out. No credit, no installments, no interest." },
    { title: "Fix Everything", desc: "12 essential tools and how to use them to repair your home, clothes, and belongings yourself." },
    { title: "Money-Free Exchange", desc: "How to activate a barter network in your community to get services for free." },
    { title: "Farm to Table", desc: "Practical guide to home gardening and zero-waste cooking. Even on a balcony." },
    { title: "Free Energy", desc: "How to cut your utility bills by 50% with low-cost solutions inspired by Amish living." },
    { title: "30-Day Plan", desc: "Printable day-by-day checklist to transform your finances in one month." },
  ],
  faq: [
    { q: "What exactly is included?", a: "You get the complete eBook in PDF, ePub, and Kindle formats. Plus lifetime access to all future updates and the private members area." },
    { q: "Is it in English?", a: "Yes, the course is fully available in English with Italian as a secondary language." },
    { q: "What format is the course in?", a: "eBook in PDF, ePub, and Kindle formats. Videos are in MP4 format, accessible from the members area." },
    { q: "When do I get access?", a: "Immediately after payment. You'll receive an email with the link to your personal members area." },
    { q: "What if I'm not satisfied?", a: "You're protected by our 30-day money-back guarantee. If you don't save at least $100, we'll refund you. No questions asked." },
    { q: "How long does it take?", a: "The complete program takes about 3-4 hours. Each module is designed for 20-minute sessions." },
  ],
};

async function main() {
  const product = await prisma.product.findUnique({ where: { slug: SLUG } });
  if (!product) {
    console.error(`Product "${SLUG}" not found`);
    process.exit(1);
  }

  const entries = [
    { locale: "it", data: UI_IT },
    { locale: "en", data: UI_EN },
  ];

  for (const { locale, data } of entries) {
    await prisma.productTranslation.upsert({
      where: {
        productId_locale_section: {
          productId: product.id,
          locale,
          section: "ui_all",
        },
      },
      update: { content: JSON.stringify(data) },
      create: {
        productId: product.id,
        locale,
        section: "ui_all",
        content: JSON.stringify(data),
      },
    });
    console.log(`✅ ui_all saved for ${locale}`);
  }

  console.log("\nDone! UI translations seeded successfully.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
