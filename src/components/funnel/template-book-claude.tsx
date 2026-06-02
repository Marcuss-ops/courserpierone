"use client";

import React, { useState } from "react";
import {
  ChevronRight, Check, BookOpen,
  DollarSign, Leaf, Shield, Star, Clock,
  Users, TrendingUp, PiggyBank, Home, Heart,
  Zap, Award, Quote, ThumbsUp, X, Wrench,
  CalendarCheck, Smartphone, CreditCard, Lock
} from "lucide-react";
import { TrackedCtaButton } from "@/components/course/tracked-cta-button";
import LanguageSelector from "@/components/funnel/language-selector";

interface BookClaudeProps {
  data: {
    titolo?: string;
    sottotitolo?: string;
    problema?: string;
    storia?: string;
    recensioni?: string;
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

// ─── Translation dictionary ────────────────────
type Locale = "it" | "en" | "fr" | "de" | "es";
type TKey = keyof typeof UI;

const UI = {
  // Sticky mobile
  instant_access: { it: "Accesso immediato", en: "Instant access", fr: "Accès immédiat", de: "Sofortzugriff", es: "Acceso inmediato" },
  buy_now_arrow: { it: "Acquista Ora →", en: "Buy Now →", fr: "Acheter →", de: "Jetzt Kaufen →", es: "Comprar →" },

  // Hero
  readers: { it: "1,247 lettori", en: "1,247 readers", fr: "1 247 lecteurs", de: "1.247 Leser", es: "1.247 lectores" },
  buy_now_dash: { it: "Acquista Ora —", en: "Buy Now —", fr: "Acheter —", de: "Jetzt Kaufen —", es: "Comprar —" },
  view_modules: { it: "Scopri i Moduli", en: "View Modules", fr: "Voir les Modules", de: "Module Ansehen", es: "Ver Módulos" },
  ssl_secure: { it: "Pagamento sicuro SSL", en: "Secure SSL payment", fr: "Paiement sécurisé SSL", de: "Sichere SSL-Zahlung", es: "Pago seguro SSL" },
  instant_download: { it: "Download Immediato", en: "Instant Download", fr: "Téléchargement Immédiat", de: "Sofort-Download", es: "Descarga Inmediata" },
  lifetime_access: { it: "Accesso a Vita", en: "Lifetime Access", fr: "Accès à Vie", de: "Lebenslanger Zugriff", es: "Acceso Vitalicio" },
  guarantee_days: { it: "30 Giorni Garanzia", en: "30-Day Guarantee", fr: "Garantie 30 Jours", de: "30-Tage-Garantie", es: "Garantía 30 Días" },

  // Per chi è
  section_who: { it: "// 01 — Per Chi È", en: "// 01 — Who Is This For", fr: "// 01 — Pour Qui", de: "// 01 — Für Wen", es: "// 01 — Para Quién" },
  is_this_for_you: { it: "Questo corso fa per te?", en: "Is This Course For You?", fr: "Ce cours est-il pour vous ?", de: "Ist dieser Kurs für Sie?", es: "¿Este curso es para ti?" },
  perfect_for: { it: "Perfetto per te se:", en: "Perfect for you if:", fr: "Parfait pour vous si :", de: "Perfekt für Sie, wenn:", es: "Perfecto para ti si:" },
  p_struggle: { it: "Fai fatica ad arrivare a fine mese", en: "You struggle to make ends meet", fr: "Vous avez du mal à joindre les deux bouts", de: "Sie kommen kaum über die Runden", es: "Te cuesta llegar a fin de mes" },
  p_cut_costs: { it: "Vuoi tagliare le spese senza sacrificare la qualità della vita", en: "You want to cut costs without sacrificing quality of life", fr: "Vous voulez réduire vos dépenses sans sacrifier votre qualité de vie", de: "Sie wollen Ausgaben senken ohne Lebensqualität zu opfern", es: "Quieres reducir gastos sin sacrificar calidad de vida" },
  p_consumerism: { it: "Sei stanco di vivere con la cultura del consumo e del debito", en: "You're tired of the consumerism and debt culture", fr: "Vous en avez assez de la culture de consommation et d'endettement", de: "Sie haben die Konsum- und Schuldenkultur satt", es: "Estás cansado de la cultura del consumo y la deuda" },
  p_practical: { it: "Cerchi metodi pratici, testati da secoli", en: "You want practical, time-tested methods", fr: "Vous cherchez des méthodes pratiques, éprouvées par les siècles", de: "Sie suchen praktische, jahrhundertealte Methoden", es: "Buscas métodos prácticos, probados por siglos" },
  p_future: { it: "Vuoi costruire un futuro finanziario solido per la tua famiglia", en: "You want to build a solid financial future for your family", fr: "Vous voulez construire un avenir financier solide pour votre famille", de: "Sie wollen eine solide finanzielle Zukunft für Ihre Familie aufbauen", es: "Quieres construir un futuro financiero sólido para tu familia" },
  not_for: { it: "Non fa per te se:", en: "Not for you if:", fr: "Pas pour vous si :", de: "Nichts für Sie, wenn:", es: "No es para ti si:" },
  n_quick: { it: "Cerchi schemi per diventare milionario in una settimana", en: "You're looking for get-rich-quick schemes", fr: "Vous cherchez des plans pour devenir millionnaire en une semaine", de: "Sie suchen Schnell-reich-werden-Schemata", es: "Buscas esquemas para hacerte millonario en una semana" },
  n_habits: { it: "Non vuoi cambiare le tue abitudini di spesa", en: "You don't want to change your spending habits", fr: "Vous ne voulez pas changer vos habitudes de dépense", de: "Sie wollen Ihre Ausgabegewohnheiten nicht ändern", es: "No quieres cambiar tus hábitos de gasto" },
  n_quick_fix: { it: "Preferisci soluzioni rapide invece di un percorso solido", en: "You prefer quick fixes over a solid foundation", fr: "Vous préférez les solutions rapides à une base solide", de: "Sie bevorzugen schnelle Lösungen statt einer soliden Grundlage", es: "Prefieres soluciones rápidas en lugar de una base sólida" },
  n_implement: { it: "Non sei disposto a mettere in pratica ciò che impari", en: "You're not willing to implement what you learn", fr: "Vous n'êtes pas prêt à mettre en pratique ce que vous apprenez", de: "Sie sind nicht bereit, das Gelernte umzusetzen", es: "No estás dispuesto a poner en práctica lo que aprendes" },
  n_advice: { it: "Cerchi consulenza finanziaria personalizzata", en: "You're looking for personalized financial advice", fr: "Vous cherchez des conseils financiers personnalisés", de: "Sie suchen persönliche Finanzberatung", es: "Buscas asesoramiento financiero personalizado" },

  // Benefits section
  section_learn: { it: "// 02 — Cosa Imparerai", en: "// 02 — What You'll Learn", fr: "// 02 — Ce Que Vous Apprendrez", de: "// 02 — Was Sie Lernen", es: "// 02 — Lo Que Aprenderás" },
  masters_secrets: { it: "I Segreti dei Maestri Amish", en: "The Amish Masters' Secrets", fr: "Les Secrets des Maîtres Amish", de: "Die Geheimnisse der Amish-Meister", es: "Los Secretos de los Maestros Amish" },
  modules_desc: {
    it: "8 moduli pratici che trasformano la saggezza Amish in azioni concrete per la tua vita quotidiana.",
    en: "8 practical modules that turn Amish wisdom into concrete actions for your daily life.",
    fr: "8 modules pratiques qui transforment la sagesse Amish en actions concrètes pour votre vie quotidienne.",
    de: "8 praktische Module, die Amish-Weisheit in konkrete Maßnahmen für Ihren Alltag verwandeln.",
    es: "8 módulos prácticos que convierten la sabiduría Amish en acciones concretas para tu vida diaria.",
  },

  // Author section
  section_author: { it: "// 03 — L'Autore", en: "// 03 — The Author", fr: "// 03 — L'Auteur", de: "// 03 — Der Autor", es: "// 03 — El Autor" },
  behind_course: { it: "Chi c'è dietro questo corso", en: "Behind This Course", fr: "Qui est derrière ce cours", de: "Wer steckt hinter diesem Kurs", es: "Quién está detrás de este curso" },
  your_name: { it: "Il Tuo Nome Qui", en: "Your Name Here", fr: "Votre Nom Ici", de: "Ihr Name Hier", es: "Tu Nombre Aquí" },
  researcher_author: { it: "Ricercatore · Autore", en: "Researcher · Author", fr: "Chercheur · Auteur", de: "Forscher · Autor", es: "Investigador · Autor" },
  author_bio: {
    it: "[Aggiungi qui la tua storia: ho vissuto 3 mesi in Pennsylvania, intervistato 12 famiglie Amish, studiato il loro sistema economico. Nessuna teoria, solo pratiche.]",
    en: "[Add your story here: I lived 3 months in Pennsylvania, interviewed 12 Amish families, studied their economic system. No theory, only practice.]",
    fr: "[Ajoutez votre histoire ici : j'ai vécu 3 mois en Pennsylvanie, interviewé 12 familles Amish, étudié leur système économique. Pas de théorie, que de la pratique.]",
    de: "[Fügen Sie hier Ihre Geschichte hinzu: Ich lebte 3 Monate in Pennsylvania, interviewte 12 Amish-Familien, studierte ihr Wirtschaftssystem. Keine Theorie, nur Praxis.]",
    es: "[Añade aquí tu historia: viví 3 meses en Pensilvania, entrevisté a 12 familias Amish, estudié su sistema económico. Sin teoría, solo práctica.]",
  },

  // Course content
  section_content: { it: "// 04 — Contenuto del Corso", en: "// 04 — Course Content", fr: "// 04 — Contenu du Cours", de: "// 04 — Kursinhalt", es: "// 04 — Contenido del Curso" },
  what_inside: { it: "Cosa Troverai Dentro", en: "What You'll Find Inside", fr: "Ce Que Vous Trouverez à l'Intérieur", de: "Was Sie Darin Finden", es: "Lo Que Encontrarás Dentro" },
  also_includes: { it: "Include anche:", en: "Also includes:", fr: "Inclut également :", de: "Enthält auch:", es: "Incluye también:" },
  inc_full_ebook: { it: "eBook completo (PDF, ePub, Kindle)", en: "Full eBook (PDF, ePub, Kindle)", fr: "eBook complet (PDF, ePub, Kindle)", de: "Vollständiges eBook (PDF, ePub, Kindle)", es: "eBook completo (PDF, ePub, Kindle)" },
  inc_checklist: { it: "Checklist stampabile 30 giorni", en: "Printable 30-day checklist", fr: "Checklist imprimable 30 jours", de: "Druckbare 30-Tage-Checkliste", es: "Lista de verificación imprimible 30 días" },
  inc_excel: { it: "Foglio Excel budget Amish", en: "Amish budget Excel sheet", fr: "Tableur Excel budget Amish", de: "Amish-Budget-Excel-Tabelle", es: "Hoja de Excel presupuesto Amish" },
  inc_shopping: { it: "Lista della spesa settimanale", en: "Weekly shopping list template", fr: "Liste de courses hebdomadaire", de: "Wöchentliche Einkaufsliste", es: "Lista de compras semanal" },
  inc_lifetime: { it: "Accesso a vita all'area riservata", en: "Lifetime member area access", fr: "Accès à vie à l'espace membre", de: "Lebenslanger Zugang zum Mitgliederbereich", es: "Acceso vitalicio al área de miembros" },
  inc_updates: { it: "Aggiornamenti gratuiti futuri", en: "Free future updates", fr: "Mises à jour gratuites futures", de: "Kostenlose zukünftige Updates", es: "Actualizaciones gratuitas futuras" },

  // Pricing
  section_offer: { it: "// 05 — Offerta", en: "// 05 — The Offer", fr: "// 05 — L'Offre", de: "// 05 — Das Angebot", es: "// 05 — La Oferta" },
  invest_yourself: { it: "Investi in Te Stesso", en: "Invest in Yourself", fr: "Investissez en Vous", de: "Investieren Sie in Sich", es: "Invierte en Ti Mismo" },
  launch_offer: { it: "Offerta di Lancio", en: "Launch Offer", fr: "Offre de Lancement", de: "Einführungsangebot", es: "Oferta de Lanzamiento" },
  complete_package: { it: "Pacchetto Completo", en: "Complete Package", fr: "Pack Complet", de: "Komplettpaket", es: "Paquete Completo" },
  course_value: { it: "Corso: €97", en: "Course: $97", fr: "Cours : 97 €", de: "Kurs: 97 €", es: "Curso: 97 €" },
  bonus_value: { it: "Bonus: €27", en: "Bonus: $27", fr: "Bonus : 27 €", de: "Bonus: 27 €", es: "Bono: 27 €" },
  one_time: { it: "Pagamento unico — nessun abbonamento", en: "One-time payment — no subscription", fr: "Paiement unique — sans abonnement", de: "Einmalzahlung — kein Abo", es: "Pago único — sin suscripción" },
  launch_price: { it: "Prezzo lancio — poi €37", en: "Launch price — then $37", fr: "Prix de lancement — puis 37 €", de: "Einführungspreis — dann 37 €", es: "Precio de lanzamiento — luego 37 €" },
  inc_course_full: { it: "Corso completo (valore €97)", en: "Full course (value $97)", fr: "Cours complet (valeur 97 €)", de: "Vollständiger Kurs (Wert 97 €)", es: "Curso completo (valor 97 €)" },
  inc_ebook: { it: "eBook PDF, ePub, Kindle", en: "eBook PDF, ePub, Kindle", fr: "eBook PDF, ePub, Kindle", de: "eBook PDF, ePub, Kindle", es: "eBook PDF, ePub, Kindle" },
  inc_checklist2: { it: "Checklist 30 giorni stampabile", en: "Printable 30-day checklist", fr: "Checklist 30 jours imprimable", de: "Druckbare 30-Tage-Checkliste", es: "Lista 30 días imprimible" },
  inc_excel2: { it: "Foglio Excel budget Amish", en: "Amish budget Excel sheet", fr: "Tableur Excel budget Amish", de: "Amish-Budget-Excel-Tabelle", es: "Hoja Excel presupuesto Amish" },
  inc_access_updates: { it: "Accesso a vita + aggiornamenti", en: "Lifetime access + updates", fr: "Accès à vie + mises à jour", de: "Lebenslanger Zugang + Updates", es: "Acceso vitalicio + actualizaciones" },
  inc_bonus_shopping: { it: "BONUS: Lista spesa settimanale (valore €27)", en: "BONUS: Weekly shopping list (value $27)", fr: "BONUS : Liste de courses (valeur 27 €)", de: "BONUS: Wöchentliche Einkaufsliste (Wert 27 €)", es: "BONUS: Lista de compras semanal (valor 27 €)" },
  unlock_now: { it: "Sblocca Accesso Ora", en: "Unlock Access Now", fr: "Débloquez l'Accès", de: "Zugriff Freischalten", es: "Desbloquear Acceso" },
  guarantee_title: { it: "Garanzia Soddisfatti o Rimborsati", en: "30-Day Money-Back Guarantee", fr: "Garantie Satisfait ou Remboursé", de: "30-Tage-Geld-zurück-Garantie", es: "Garantía de Devolución" },
  guarantee_text: {
    it: "Provalo per 30 giorni. Se non risparmi almeno €100, ti rimborsiamo l'intero importo. Nessuna domanda, nessuna scadenza.",
    en: "Try it for 30 days. If you don't save at least $100, we'll refund the full amount. No questions, no hassle.",
    fr: "Essayez-le pendant 30 jours. Si vous n'économisez pas au moins 100 €, nous vous remboursons intégralement. Sans question, sans tracas.",
    de: "Testen Sie es 30 Tage. Wenn Sie nicht mindestens 100 € sparen, erstatten wir den vollen Betrag. Keine Fragen, kein Ärger.",
    es: "Pruébalo durante 30 días. Si no ahorras al menos 100 €, te reembolsamos el importe completo. Sin preguntas, sin molestias.",
  },

  // Testimonial
  section_testimonials: { it: "// 06 — Testimonianze", en: "// 06 — Testimonials", fr: "// 06 — Témoignages", de: "// 06 — Erfahrungsberichte", es: "// 06 — Testimonios" },
  reviewer: { it: "Marco R., primi lettori", en: "Marco R., early reader", fr: "Marco R., premier lecteur", de: "Marco R., Erstleser", es: "Marco R., primer lector" },

  // FAQ
  section_faq: { it: "// 07 — FAQ", en: "// 07 — FAQ", fr: "// 07 — FAQ", de: "// 07 — FAQ", es: "// 07 — FAQ" },
  faq_title: { it: "Domande Frequenti", en: "Frequently Asked Questions", fr: "Questions Fréquentes", de: "Häufig Gestellte Fragen", es: "Preguntas Frecuentes" },

  // Final CTA
  offer_valid: { it: "Offerta valida questa settimana", en: "Offer valid this week", fr: "Offre valable cette semaine", de: "Angebot gültig diese Woche", es: "Oferta válida esta semana" },
  final_cta: { it: "Inizia oggi il tuo percorso verso la libertà finanziaria", en: "Start Your Journey to Financial Freedom Today", fr: "Commencez votre voyage vers la liberté financière dès aujourd'hui", de: "Starten Sie Ihre Reise zur finanziellen Freiheit noch heute", es: "Comienza hoy tu viaje hacia la libertad financiera" },
  final_sub: { it: "Unisciti a centinaia di persone che hanno già trasformato il loro rapporto con il denaro.", en: "Join hundreds of people who have already transformed their relationship with money.", fr: "Rejoignez des centaines de personnes qui ont déjà transformé leur relation avec l'argent.", de: "Schließen Sie sich Hunderten von Menschen an, die ihre Beziehung zum Geld bereits verändert haben.", es: "Únete a cientos de personas que ya han transformado su relación con el dinero." },
  unlock_dash: { it: "Sblocca Accesso —", en: "Unlock Access —", fr: "Débloquez l'Accès —", de: "Zugriff Freischalten —", es: "Desbloquear Acceso —" },
  guarantee_badge: { it: "30 Giorni Soddisfatti", en: "30-Day Guarantee", fr: "Garantie 30 Jours", de: "30-Tage-Garantie", es: "Garantía 30 Días" },
  instant_access_badge: { it: "Accesso Istantaneo", en: "Instant Access", fr: "Accès Instantané", de: "Sofortzugriff", es: "Acceso Instantáneo" },
  lifetime_badge: { it: "Aggiornamenti a Vita", en: "Lifetime Updates", fr: "Mises à Jour à Vie", de: "Lebenslange Updates", es: "Actualizaciones Vitalicias" },

  // Footer
  rights_reserved: { it: "Tutti i diritti riservati.", en: "All rights reserved.", fr: "Tous droits réservés.", de: "Alle Rechte vorbehalten.", es: "Todos los derechos reservados." },
  privacy: { it: "Privacy", en: "Privacy", fr: "Confidentialité", de: "Datenschutz", es: "Privacidad" },
  terms: { it: "Termini", en: "Terms", fr: "Conditions", de: "AGB", es: "Términos" },
} as const;

function t(locale: string, key: TKey): string {
  const lang = (locale?.toLowerCase() === "it" ? "it"
    : locale?.toLowerCase() === "fr" ? "fr"
    : locale?.toLowerCase() === "de" ? "de"
    : locale?.toLowerCase() === "es" ? "es"
    : "en") as Locale;
  return UI[key][lang] ?? UI[key]["en"] ?? key;
}

// ─── Constants ─────────────────────────────────
const FEATURE_ICONS = [
  { icon: PiggyBank, color: "#FF6B00" },
  { icon: TrendingUp, color: "#2563EB" },
  { icon: Home, color: "#059669" },
  { icon: Heart, color: "#DC2626" },
  { icon: Leaf, color: "#65A30D" },
  { icon: DollarSign, color: "#D97706" },
  { icon: Users, color: "#7C3AED" },
  { icon: Wrench, color: "#0891B2" },
];

type FaqItem = { q: string; a: string };

const FAQ_IT: FaqItem[] = [
  { q: "Cosa include esattamente?", a: "Ricevi l'eBook completo in PDF, ePub e Kindle. In più hai accesso a vita a tutti gli aggiornamenti futuri e all'area riservata." },
  { q: "È in italiano?", a: "Sì, il corso è completamente tradotto in italiano con contenuti aggiuntivi in inglese." },
  { q: "In che formato ricevo il corso?", a: "eBook in PDF (impaginato), ePub (reflowable) e formato Kindle. I video sono in MP4, accessibili dall'area riservata." },
  { q: "Quando ricevo l'accesso?", a: "Immediatamente dopo il pagamento. Ricevi una email con il link all'area riservata dove trovi tutto." },
  { q: "Se non sono soddisfatto?", a: "Nessun problema. Sei protetto dalla garanzia soddisfatti o rimborsati 30 giorni. Se non risparmi almeno €100, ti rimborsiamo. Nessuna domanda." },
  { q: "Quanto tempo ci vuole?", a: "Il percorso completo si segue in circa 3-4 ore. Ogni modulo è pensato per sessioni da 20 minuti." },
];

const FAQ_EN: FaqItem[] = [
  { q: "What exactly is included?", a: "You get the complete eBook in PDF, ePub, and Kindle formats. Plus lifetime access to all future updates and the private members area." },
  { q: "Is it in English?", a: "Yes, the course is fully available in English with Italian as a secondary language." },
  { q: "What format is the course in?", a: "eBook in PDF, ePub, and Kindle formats. Videos are in MP4 format, accessible from the members area." },
  { q: "When do I get access?", a: "Immediately after payment. You'll receive an email with the link to your personal members area." },
  { q: "What if I'm not satisfied?", a: "You're protected by our 30-day money-back guarantee. If you don't save at least $100, we'll refund you. No questions asked." },
  { q: "How long does it take?", a: "The complete program takes about 3-4 hours. Each module is designed for 20-minute sessions." },
];

const FAQ_FR: FaqItem[] = [
  { q: "Qu'est-ce qui est inclus exactement ?", a: "Vous recevez l'eBook complet en PDF, ePub et Kindle. Plus un accès à vie à toutes les mises à jour futures et à l'espace membre privé." },
  { q: "Est-ce en français ?", a: "Oui, le cours est entièrement disponible en français avec l'anglais comme langue secondaire." },
  { q: "Quel est le format du cours ?", a: "eBook en PDF, ePub et Kindle. Les vidéos sont au format MP4, accessibles depuis l'espace membre." },
  { q: "Quand recevrai-je l'accès ?", a: "Immédiatement après le paiement. Vous recevrez un email avec le lien vers votre espace membre personnel." },
  { q: "Si je ne suis pas satisfait ?", a: "Vous êtes protégé par notre garantie satisfait ou remboursé de 30 jours. Si vous n'économisez pas au moins 100 €, nous vous remboursons. Aucune question posée." },
  { q: "Combien de temps cela prend-il ?", a: "Le programme complet se suit en environ 3-4 heures. Chaque module est conçu pour des sessions de 20 minutes." },
];

const FAQ_DE: FaqItem[] = [
  { q: "Was ist genau enthalten?", a: "Sie erhalten das vollständige eBook als PDF, ePub und Kindle. Plus lebenslangen Zugriff auf alle zukünftigen Updates und den privaten Mitgliederbereich." },
  { q: "Ist es auf Deutsch?", a: "Ja, der Kurs ist vollständig auf Deutsch verfügbar, mit Englisch als Zweitsprache." },
  { q: "In welchem Format erhalte ich den Kurs?", a: "eBook als PDF, ePub und Kindle. Die Videos sind im MP4-Format und über den Mitgliederbereich zugänglich." },
  { q: "Wann erhalte ich Zugriff?", a: "Sofort nach der Zahlung. Sie erhalten eine E-Mail mit dem Link zu Ihrem persönlichen Mitgliederbereich." },
  { q: "Was ist, wenn ich nicht zufrieden bin?", a: "Sie sind durch unsere 30-tägige Geld-zurück-Garantie geschützt. Wenn Sie nicht mindestens 100 € sparen, erstatten wir den vollen Betrag. Keine Fragen." },
  { q: "Wie lange dauert es?", a: "Das gesamte Programm dauert etwa 3-4 Stunden. Jedes Modul ist für 20-minütige Sitzungen konzipiert." },
];

const FAQ_ES: FaqItem[] = [
  { q: "¿Qué incluye exactamente?", a: "Recibes el eBook completo en PDF, ePub y Kindle. Además, acceso vitalicio a todas las actualizaciones futuras y al área de miembros privada." },
  { q: "¿Está en español?", a: "Sí, el curso está completamente disponible en español con inglés como idioma secundario." },
  { q: "¿En qué formato recibo el curso?", a: "eBook en PDF, ePub y Kindle. Los videos están en formato MP4, accesibles desde el área de miembros." },
  { q: "¿Cuándo recibo el acceso?", a: "Inmediatamente después del pago. Recibirás un correo electrónico con el enlace a tu área de miembros personal." },
  { q: "¿Si no estoy satisfecho?", a: "Estás protegido por nuestra garantía de devolución de 30 días. Si no ahorras al menos 100 €, te reembolsamos. Sin preguntas." },
  { q: "¿Cuánto tiempo se necesita?", a: "El programa completo se completa en aproximadamente 3-4 horas. Cada módulo está diseñado para sesiones de 20 minutos." },
];

// ─── Benefit data ──────────────────────────────
type Benefit = { title: string; desc: string };

const BENEFITS_IT: Benefit[] = [
  { title: "Budget Amish", desc: "Come vivere con il 30% in meno senza sacrifici — il sistema di bilancio che funziona da 300 anni." },
  { title: "Dispensa Infinita", desc: "Il metodo di conservazione e gestione delle scorte che elimina gli sprechi e taglia la spesa del 40%." },
  { title: "Debito Zero", desc: "Il framework per uscire dai debiti e non tornarci mai più. Niente credito, niente rate, niente interessi." },
  { title: "Ripara Tutto", desc: "12 strumenti essenziali e come usarli per riparare casa, vestiti e oggetti da solo. Addio artigiani costosi." },
  { title: "Scambio Senza Soldi", desc: "Come attivare una rete di baratto nella tua comunità per ottenere servizi gratuitamente." },
  { title: "Dalla Terra alla Tavola", desc: "Guida pratica all'orto domestico e alla cucina a spreco zero. Anche in un balcone." },
  { title: "Energia Libera", desc: "Come ridurre le bollette del 50% con soluzioni a basso costo ispirate alla vita Amish." },
  { title: "Piano 30 Giorni", desc: "Checklist stampabile giorno per giorno per trasformare le tue finanze in un mese." },
];

const BENEFITS_EN: Benefit[] = [
  { title: "Amish Budget", desc: "Live on 30% less without sacrifice — the budgeting system that has worked for 300 years." },
  { title: "Infinite Pantry", desc: "The food storage and management method that eliminates waste and cuts grocery bills by 40%." },
  { title: "Zero Debt", desc: "The framework to get out of debt and stay out. No credit, no installments, no interest." },
  { title: "Fix Everything", desc: "12 essential tools and how to use them to repair your home, clothes, and belongings yourself." },
  { title: "Money-Free Exchange", desc: "How to activate a barter network in your community to get services for free." },
  { title: "Farm to Table", desc: "Practical guide to home gardening and zero-waste cooking. Even on a balcony." },
  { title: "Free Energy", desc: "How to cut your utility bills by 50% with low-cost solutions inspired by Amish living." },
  { title: "30-Day Plan", desc: "Printable day-by-day checklist to transform your finances in one month." },
];

const BENEFITS_FR: Benefit[] = [
  { title: "Budget Amish", desc: "Vivez avec 30 % de moins sans sacrifice — le système budgétaire qui fonctionne depuis 300 ans." },
  { title: "Garde-Manger Infini", desc: "La méthode de conservation et de gestion des stocks qui élimine le gaspillage et réduit les courses de 40 %." },
  { title: "Zéro Dette", desc: "Le cadre pour sortir de l'endettement et ne jamais y retourner. Pas de crédit, pas d'intérêts." },
  { title: "Tout Réparer", desc: "12 outils essentiels et comment les utiliser pour réparer maison, vêtements et objets vous-même." },
  { title: "Échange Sans Argent", desc: "Comment activer un réseau de troc dans votre communauté pour obtenir des services gratuitement." },
  { title: "De la Terre à l'Assiette", desc: "Guide pratique du potager domestique et de la cuisine zéro déchet. Même sur un balcon." },
  { title: "Énergie Gratuite", desc: "Comment réduire vos factures de 50 % avec des solutions low-cost inspirées de la vie Amish." },
  { title: "Plan 30 Jours", desc: "Checklist imprimable jour par jour pour transformer vos finances en un mois." },
];

const BENEFITS_DE: Benefit[] = [
  { title: "Amish-Budget", desc: "Leben Sie mit 30 % weniger ohne Verzicht — das Haushaltssystem, das seit 300 Jahren funktioniert." },
  { title: "Unendliche Vorratskammer", desc: "Die Methode zur Lagerung und Verwaltung von Vorräten, die Verschwendung eliminiert und Lebensmittelkosten um 40 % senkt." },
  { title: "Schuldenfrei", desc: "Der Rahmen, um aus den Schulden herauszukommen und nie wieder hineinzugeraten. Kein Kredit, keine Raten." },
  { title: "Alles Reparieren", desc: "12 essentielle Werkzeuge und wie Sie damit Haushalt, Kleidung und Gegenstände selbst reparieren." },
  { title: "Tausch Ohne Geld", desc: "Wie Sie ein Tauschnetzwerk in Ihrer Gemeinschaft aktivieren, um Dienstleistungen kostenlos zu erhalten." },
  { title: "Vom Feld auf den Tisch", desc: "Praktischer Leitfaden für den Hausgarten und die Zero-Waste-Küche. Auch auf dem Balkon." },
  { title: "Kostenlose Energie", desc: "Wie Sie Ihre Stromrechnung um 50 % senken mit kostengünstigen Lösungen inspiriert vom Amish-Leben." },
  { title: "30-Tage-Plan", desc: "Druckbare Tag-für-Tag-Checkliste, um Ihre Finanzen in einem Monat zu verwandeln." },
];

const BENEFITS_ES: Benefit[] = [
  { title: "Presupuesto Amish", desc: "Vive con un 30 % menos sin sacrificios — el sistema de presupuesto que ha funcionado durante 300 años." },
  { title: "Despensa Infinita", desc: "El método de almacenamiento y gestión de alimentos que elimina el desperdicio y reduce la compra en un 40 %." },
  { title: "Deuda Cero", desc: "El marco para salir de las deudas y no volver nunca más. Sin crédito, sin cuotas, sin intereses." },
  { title: "Reparar Todo", desc: "12 herramientas esenciales y cómo usarlas para reparar tu hogar, ropa y objetos tú mismo." },
  { title: "Intercambio Sin Dinero", desc: "Cómo activar una red de trueque en tu comunidad para obtener servicios gratuitos." },
  { title: "De la Tierra a la Mesa", desc: "Guía práctica para el huerto doméstico y la cocina de desperdicio cero. Incluso en un balcón." },
  { title: "Energía Libre", desc: "Cómo reducir tus facturas en un 50 % con soluciones de bajo costo inspiradas en la vida Amish." },
  { title: "Plan 30 Días", desc: "Lista de verificación imprimible día a día para transformar tus finanzas en un mes." },
];

const FAQ_MAP: Record<string, FaqItem[]> = { it: FAQ_IT, en: FAQ_EN, fr: FAQ_FR, de: FAQ_DE, es: FAQ_ES };
const BENEFITS_MAP: Record<string, Benefit[]> = { it: BENEFITS_IT, en: BENEFITS_EN, fr: BENEFITS_FR, de: BENEFITS_DE, es: BENEFITS_ES };

// ─── Component ─────────────────────────────────
export default function TemplateBookClaude({
  data,
  locale = "it",
  productId,
  productSlug,
  checkoutUrl,
}: BookClaudeProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const lang = locale?.toLowerCase() === "it" ? "it"
    : locale?.toLowerCase() === "fr" ? "fr"
    : locale?.toLowerCase() === "de" ? "de"
    : locale?.toLowerCase() === "es" ? "es"
    : "en";
  const faqItems = FAQ_MAP[lang] ?? FAQ_EN;
  const benefits = BENEFITS_MAP[lang] ?? BENEFITS_EN;

  // ─── RENDER ────────────────────────────────────
  return (
    <div className="min-h-screen bg-white text-[#1A1A1A] font-sans selection:bg-[#FF6B00]/20 antialiased">
      {/* ================================================================ */}
      {/* STICKY MOBILE CTA BAR */}
      {/* ================================================================ */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-[#EAEAEA] p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-black tracking-tight">{data.prezzo}</div>
            <div className="text-[10px] text-[#6B7280] font-medium">
              {t(locale, "instant_access")}
            </div>
          </div>
          <TrackedCtaButton
            href={checkoutUrl}
            productSlug={productSlug ?? ""}
            productId={productId}
            locale={locale}
            className="bg-[#FF6B00] text-white px-6 py-3.5 rounded-xl font-bold text-sm shadow-[0_4px_16px_rgba(255,107,0,0.3)] hover:bg-[#E05E00] transition-all flex items-center gap-2 shrink-0"
          >
            {t(locale, "buy_now_arrow")}
          </TrackedCtaButton>
        </div>
      </div>

      {/* ── Language Selector (floating top-right) ── */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSelector
          currentLocale={locale ?? "en"}
          productSlug={productSlug ?? ""}
        />
      </div>

      {/* ================================================================ */}
      {/* HERO */}
      {/* ================================================================ */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden pb-16 md:pb-0">
        <div className="absolute inset-0 bg-gradient-to-br from-[#FFF8F0] via-white to-[#FFF3EB] opacity-60" />
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#FF6B00]/[0.03] to-transparent" />
        <div className="absolute top-20 right-20 w-64 h-64 rounded-full bg-[#FF6B00]/[0.04] blur-3xl" />
        <div className="absolute bottom-20 left-20 w-96 h-96 rounded-full bg-[#FF6B00]/[0.03] blur-3xl" />

        <div className="relative w-full max-w-[1200px] mx-auto px-6 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* ── Left: Mockup ── */}
            <div className="order-2 lg:order-1">
              <div className="relative w-full max-w-[320px] sm:max-w-[380px] mx-auto group perspective-[1500px]">
                {/* 3D Book Cover */}
                <div className="relative aspect-[3/4.2] transition-all duration-700 group-hover:-translate-y-2"
                     style={{ transform: "rotateY(-8deg) rotateX(4deg)", transformStyle: "preserve-3d" }}>
                  <div className="absolute -left-4 top-[3%] bottom-[3%] w-8 bg-gradient-to-r from-[#e8e8e8] to-[#fafafa] rounded-l-lg border border-black/5"
                       style={{ transform: "rotateY(85deg) translateZ(-1px)" }} />
                  <div className="w-full h-full rounded-2xl overflow-hidden border border-black/10 shadow-[0_20px_60px_rgba(255,107,0,0.15)]">
                    {data.coverUrl ? (
                      <img src={data.coverUrl} alt={data.titolo ?? ""} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#FFF3EB] to-white flex items-center justify-center p-8">
                        <BookOpen className="w-12 h-12 text-[#FF6B00]/40 mx-auto" />
                      </div>
                    )}
                  </div>
                  <div className="absolute -bottom-6 left-[10%] right-[10%] h-6 bg-black/5 blur-xl rounded-full" />
                </div>
                {/* Badge flottante "Best Seller" */}
                <div className="absolute -top-3 -right-3 bg-[#FF6B00] text-white text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg animate-pulse flex items-center gap-1.5">
                  <Award className="w-3 h-3" />
                  Best Seller
                </div>
              </div>
            </div>

            {/* ── Right: Content ── */}
            <div className="order-1 lg:order-2 space-y-6 max-w-xl">
              {/* Social proof */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-[#FF6B00] text-[#FF6B00]" />
                  ))}
                </div>
                <span className="text-sm font-bold text-[#1A1A1A]">4.8/5</span>
                <span className="text-sm text-[#6B7280]">— {t(locale, "readers")}</span>
              </div>

              {/* Title */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-[1.05]">
                {data.titolo}
              </h1>

              {/* Subtitle */}
              <p className="text-lg sm:text-xl text-[#4A4A4A] font-medium leading-relaxed">
                {data.sottotitolo}
              </p>

              {/* Story / Hook */}
              {data.storia && (
                <p className="text-base text-[#6B7280] leading-relaxed border-l-4 border-[#FF6B00]/30 pl-5 italic">
                  &ldquo;{data.storia.split("\n")[0] || data.storia}&rdquo;
                </p>
              )}

              {/* CTA + Secondary */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <TrackedCtaButton
                  href={checkoutUrl}
                  productSlug={productSlug ?? ""}
                  productId={productId}
                  locale={locale}
                  className="bg-[#FF6B00] text-white px-10 py-5 rounded-xl font-bold text-lg shadow-[0_8px_28px_rgba(255,107,0,0.25)] hover:bg-[#E05E00] hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 group"
                >
                  {t(locale, "buy_now_dash")} {data.prezzo ?? ""}
                </TrackedCtaButton>
                <a href="#benefits" className="bg-white text-[#1A1A1A] border-2 border-[#EAEAEA] px-8 py-5 rounded-xl font-bold hover:bg-[#FAFAFA] transition-all flex items-center justify-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  {t(locale, "view_modules")}
                </a>
              </div>

              {/* Payment Icons + Secure */}
              <div className="flex items-center gap-4 flex-wrap pt-2">
                <div className="flex items-center gap-2 text-[#6B7280]">
                  {[CreditCard, Smartphone, DollarSign].map((Icon, i) => (
                    <div key={i} className="w-8 h-8 rounded-lg border border-[#EAEAEA] flex items-center justify-center bg-white">
                      <Icon className="w-4 h-4" />
                    </div>
                  ))}
                </div>
                <span className="text-xs text-[#6B7280] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#059669]" />
                  {t(locale, "ssl_secure")}
                </span>
              </div>

              {/* Trust badges */}
              <div className="grid grid-cols-3 gap-3 pt-3 border-t border-[#EAEAEA]">
                {[
                  { icon: Check, label: t(locale, "instant_download") },
                  { icon: Shield, label: t(locale, "lifetime_access") },
                  { icon: Star, label: t(locale, "guarantee_days") },
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0">
                      <b.icon className="w-3.5 h-3.5 text-[#FF6B00]" />
                    </div>
                    <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-[0.03em] leading-tight">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* PER CHI È / NON PER CHI È */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
        <div className="max-w-[1000px] mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "section_who")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t(locale, "is_this_for_you")}
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Per chi è */}
            <div className="bg-white rounded-3xl p-8 lg:p-10 border border-[#EAEAEA] shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#059669]/10 flex items-center justify-center">
                  <ThumbsUp className="w-5 h-5 text-[#059669]" />
                </div>
                <h3 className="text-lg font-black">
                  {t(locale, "perfect_for")}
                </h3>
              </div>
              <ul className="space-y-4">
                {[
                  t(locale, "p_struggle"),
                  t(locale, "p_cut_costs"),
                  t(locale, "p_consumerism"),
                  t(locale, "p_practical"),
                  t(locale, "p_future"),
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="w-5 h-5 text-[#059669] shrink-0 mt-0.5" strokeWidth={3} />
                    <span className="text-sm font-medium text-[#4A4A4A]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Non per chi è */}
            <div className="bg-white rounded-3xl p-8 lg:p-10 border border-[#EAEAEA] shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-[#DC2626]/10 flex items-center justify-center">
                  <X className="w-5 h-5 text-[#DC2626]" />
                </div>
                <h3 className="text-lg font-black">
                  {t(locale, "not_for")}
                </h3>
              </div>
              <ul className="space-y-4">
                {[
                  t(locale, "n_quick"),
                  t(locale, "n_habits"),
                  t(locale, "n_quick_fix"),
                  t(locale, "n_implement"),
                  t(locale, "n_advice"),
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <X className="w-5 h-5 text-[#DC2626] shrink-0 mt-0.5" strokeWidth={3} />
                    <span className="text-sm font-medium text-[#6B7280]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* WHAT YOU'LL LEARN — 8 Benefits */}
      {/* ================================================================ */}
      <section id="benefits" className="py-20 lg:py-24 px-6">
        <div className="max-w-[1120px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "section_learn")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t(locale, "masters_secrets")}
            </h2>
            <p className="mt-4 text-lg text-[#6B7280] max-w-2xl mx-auto">
              {t(locale, "modules_desc")}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {benefits.map((b, i) => {
              const iconConfig = FEATURE_ICONS[i % FEATURE_ICONS.length];
              const Icon = iconConfig.icon;
              return (
                <div
                  key={i}
                  className="group bg-white rounded-2xl p-6 border border-[#EAEAEA] shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col"
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: `${iconConfig.color}12` }}
                  >
                    <Icon className="w-5 h-5" style={{ color: iconConfig.color }} />
                  </div>
                  <h3 className="text-base font-bold mb-2">{b.title}</h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed flex-1">{b.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* AUTHOR / CREDIBILITÀ (placeholder) */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "section_author")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t(locale, "behind_course")}
            </h2>
          </div>

          <div className="bg-white rounded-3xl p-8 lg:p-12 border border-[#EAEAEA] shadow-sm">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-8 text-center sm:text-left">
              {/* Foto placeholder */}
              <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-[#FFF3EB] to-[#FF6B00]/10 flex items-center justify-center shrink-0 border-2 border-[#FF6B00]/20">
                <Users className="w-10 h-10 text-[#FF6B00]/40" />
              </div>
              <div className="flex-1">
                <h3 className="text-2xl font-black mb-2">
                  {t(locale, "your_name")}
                </h3>
                <p className="text-sm text-[#FF6B00] font-bold uppercase tracking-wider mb-4">
                  {t(locale, "researcher_author")}
                </p>
                <p className="text-sm text-[#6B7280] leading-relaxed">
                  {t(locale, "author_bio")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* WHAT'S INSIDE (Chapter Previews) */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "section_content")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t(locale, "what_inside")}
            </h2>
          </div>

          <div className="space-y-3">
            {benefits.slice(0, 8).map((b, i) => (
              <div key={i} className="flex items-start gap-5 p-5 rounded-2xl border border-[#EAEAEA] hover:bg-[#FAFAFA] transition-colors group">
                <div className="w-10 h-10 rounded-xl bg-[#FFF3EB] flex items-center justify-center shrink-0 font-bold text-[#FF6B00] group-hover:scale-110 transition-transform">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-sm mb-0.5">{b.title}</h3>
                  <p className="text-sm text-[#6B7280]">{b.desc}</p>
                </div>
                <div className="hidden sm:flex w-7 h-7 rounded-full bg-[#FFF3EB] items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="w-3.5 h-3.5 text-[#FF6B00]" />
                </div>
              </div>
            ))}
          </div>

          {/* What you get */}
          <div className="mt-10 bg-[#FAFAFA] rounded-3xl p-8 border border-[#EAEAEA]">
            <h3 className="font-bold text-lg mb-5">
              {t(locale, "also_includes")}
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                t(locale, "inc_full_ebook"),
                t(locale, "inc_checklist"),
                t(locale, "inc_excel"),
                t(locale, "inc_shopping"),
                t(locale, "inc_lifetime"),
                t(locale, "inc_updates"),
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-[#FF6B00]" strokeWidth={3} />
                  </div>
                  <span className="text-sm text-[#4A4A4A]">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* PRICING — Value Stack */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6 bg-[#FFF8F0] border-y border-[#EAEAEA]">
        <div className="max-w-[900px] mx-auto">
          <div className="text-center mb-14">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "section_offer")}
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight">
              {t(locale, "invest_yourself")}
            </h2>
          </div>

          <div className="max-w-[520px] mx-auto">
            <div className="relative bg-white rounded-3xl border-2 border-[#FF6B00]/20 shadow-[0_8px_40px_rgba(255,107,0,0.08)] p-8 lg:p-10">
              {/* Badge */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-5 py-1.5 bg-[#FF6B00] text-white rounded-full text-xs font-bold uppercase tracking-wider shadow-lg whitespace-nowrap">
                <Zap className="w-3.5 h-3.5" />
                {t(locale, "launch_offer")}
              </div>

              <div className="mt-6 text-center">
                <p className="text-sm font-bold text-[#6B7280] uppercase tracking-widest mb-4">
                  {t(locale, "complete_package")}
                </p>

                {/* Value Stack */}
                <div className="space-y-1 mb-5">
                  <div className="text-sm text-[#6B7280] line-through">
                    {t(locale, "course_value")}
                  </div>
                  <div className="text-sm text-[#6B7280] line-through">
                    {t(locale, "bonus_value")}
                  </div>
                  <div className="w-16 h-0.5 bg-[#FF6B00]/30 mx-auto my-3" />
                </div>

                {/* Price */}
                <div className="flex items-baseline justify-center gap-1">
                  <span className="text-6xl font-black tracking-tighter">{data.prezzo}</span>
                </div>
                <p className="mt-1 text-sm text-[#6B7280] font-medium">
                  {t(locale, "one_time")}
                </p>

                {/* Urgency */}
                <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-[#FFF3EB] rounded-full border border-[#FF6B00]/10">
                  <Clock className="w-3.5 h-3.5 text-[#FF6B00]" />
                  <span className="text-[11px] font-bold text-[#E05E00] uppercase tracking-wider">
                    {t(locale, "launch_price")}
                  </span>
                </div>

                {/* What's included */}
                <ul className="mt-6 space-y-3 text-left max-w-sm mx-auto">
                  {[
                    t(locale, "inc_course_full"),
                    t(locale, "inc_ebook"),
                    t(locale, "inc_checklist2"),
                    t(locale, "inc_excel2"),
                    t(locale, "inc_access_updates"),
                    t(locale, "inc_bonus_shopping"),
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3 h-3 text-[#FF6B00]" strokeWidth={3} />
                      </div>
                      <span className="text-sm text-[#4A4A4A]">{item}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="mt-7">
                  <TrackedCtaButton
                    href={checkoutUrl}
                    productSlug={productSlug ?? ""}
                    productId={productId}
                    locale={locale}
                    className="w-full bg-[#FF6B00] hover:bg-[#E05E00] text-white py-5 rounded-2xl font-black text-base uppercase tracking-widest transition-all shadow-[0_8px_32px_rgba(255,107,0,0.3)] hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    {t(locale, "unlock_now")}
                  </TrackedCtaButton>
                </div>

                {/* Guarantee */}
                <div className="mt-6 bg-[#FFF3EB] rounded-2xl p-5 border border-[#FF6B00]/15">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Shield className="w-5 h-5 text-[#059669]" />
                    <span className="font-black text-sm uppercase tracking-wider">
                      {t(locale, "guarantee_title")}
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280] leading-relaxed">
                    {t(locale, "guarantee_text")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* TESTIMONIAL */}
      {/* ================================================================ */}
      {data.recensioni && data.recensioni !== data.storia && (
        <section className="py-20 lg:py-24 bg-white px-6">
          <div className="max-w-[800px] mx-auto text-center">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "section_testimonials")}
            </span>
            <div className="relative">
              <Quote className="w-10 h-10 text-[#FF6B00]/15 mx-auto mb-4" />
              <blockquote className="text-xl sm:text-2xl font-bold leading-relaxed tracking-tight">
                &ldquo;{data.recensioni}&rdquo;
              </blockquote>
            </div>
            <div className="mt-6 flex items-center justify-center gap-3">
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-5 h-5 fill-[#FF6B00] text-[#FF6B00]" />
                ))}
              </div>
            </div>
            <p className="mt-3 text-sm text-[#6B7280]">
              — {t(locale, "reviewer")}
            </p>
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* FAQ */}
      {/* ================================================================ */}
      <section className="py-20 lg:py-24 px-6 bg-[#FAFAFA] border-y border-[#EAEAEA]">
        <div className="max-w-[700px] mx-auto">
          <div className="text-center mb-12">
            <span className="font-mono text-xs text-[#6B7280] uppercase tracking-widest block mb-4">
              {t(locale, "section_faq")}
            </span>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
              {t(locale, "faq_title")}
            </h2>
          </div>

          <div className="space-y-2">
            {faqItems.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl border border-[#EAEAEA] overflow-hidden transition-shadow hover:shadow-sm">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left"
                >
                  <span className="font-bold text-sm pr-4">{faq.q}</span>
                  <div className={`w-6 h-6 rounded-full bg-[#FFF3EB] flex items-center justify-center shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`}>
                    <ChevronRight className="w-3.5 h-3.5 text-[#FF6B00]" />
                  </div>
                </button>
                <div className={`grid transition-all duration-300 ${openFaq === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                  <div className="overflow-hidden">
                    <div className="px-6 pb-4 text-sm text-[#6B7280] leading-relaxed">{faq.a}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FINAL CTA */}
      {/* ================================================================ */}
      <section className="py-28 lg:py-32 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-[#0B0B0C]" />
        <div className="absolute inset-0 opacity-20"
          style={{ backgroundImage: `radial-gradient(circle at 30% 20%, #FF6B00 0%, transparent 50%), radial-gradient(circle at 70% 80%, #FF6B00 0%, transparent 50%)` }}
        />

        <div className="relative z-10 max-w-[700px] mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full mb-8">
            <CalendarCheck className="w-4 h-4 text-[#FF6B00]" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {t(locale, "offer_valid")}
            </span>
          </div>

          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-[1.1] mb-6">
            {t(locale, "final_cta")}
          </h2>

          <p className="text-lg text-gray-400 mb-10 max-w-lg mx-auto">
            {t(locale, "final_sub")}
          </p>

          <TrackedCtaButton
            href={checkoutUrl}
            productSlug={productSlug ?? ""}
            productId={productId}
            locale={locale}
            className="inline-flex items-center gap-3 bg-[#FF6B00] hover:bg-[#E05E00] text-white px-12 py-5 rounded-2xl font-black text-lg tracking-wide transition-all shadow-[0_8px_32px_rgba(255,107,0,0.35)] hover:-translate-y-1 hover:shadow-[0_12px_40px_rgba(255,107,0,0.45)]"
          >
            {t(locale, "unlock_dash")} {data.prezzo ?? ""}
          </TrackedCtaButton>

          <div className="mt-10 flex flex-wrap justify-center gap-6 text-sm text-gray-500">
            <span className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#059669]" />
              {t(locale, "guarantee_badge")}
            </span>
            <span className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#FF6B00]" />
              {t(locale, "instant_access_badge")}
            </span>
            <span className="flex items-center gap-2">
              <Award className="w-4 h-4 text-[#FF6B00]" />
              {t(locale, "lifetime_badge")}
            </span>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FOOTER */}
      {/* ================================================================ */}
      <footer className="py-8 border-t border-[#EAEAEA] bg-white">
        <div className="max-w-[1120px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-[#6B7280] font-medium">
          <div>&copy; {new Date().getFullYear()} Courssy — {t(locale, "rights_reserved")}</div>
          <div className="flex items-center gap-6">
            <div className="relative">
              <LanguageSelector
                currentLocale={locale ?? "en"}
                productSlug={productSlug ?? ""}
              />
            </div>
            <a href="/privacy" className="hover:text-[#1A1A1A] transition-colors">{t(locale, "privacy")}</a>
            <a href="/terms" className="hover:text-[#1A1A1A] transition-colors">{t(locale, "terms")}</a>
          </div>
        </div>
      </footer>

      {/* Spacer for sticky mobile CTA */}
      <div className="h-20 md:h-0" />
    </div>
  );
}
