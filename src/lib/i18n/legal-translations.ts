/**
 * Legal Page Translations
 *
 * Traduzioni per le pagine legali: Terms & Conditions, Privacy Policy, Refund Policy.
 * Basate sul codice lingua (2 lettere), non sul locale completo.
 *
 * ─── Status: content-only (post Fase 7.2 knip cleanup) ──────────────────
 * Questo file NON ha più export dalla Fase 7.2 (l'API `getLegalTranslations`
 * + le 3 interfaces sono state rese interne perché knip le flaggava come
 * unused). Il modulo resta come **contenuto** pronto per il privacy/terms
 * rewrite (V1.1 o V2): quando le pagine legali atreranno l'editoring via
 * admin, ri-aggiungere `export` e re-introdurre la riga `export * from
 * "./legal-translations"` in `src/lib/i18n/index.ts`.
 *
 * Per ora il file è raggiungibile SOLO via import diretto del path
 * (`import { ... } from "@/lib/i18n/legal-translations"`) ma non espone
 * nulla. Mantenere i dati qui (vs cancellare) per evitare di perdere le
 * 3 lingue di traduzione quando il rewrite atterra.
 */

interface LegalSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
}

interface LegalPageContent {
  title: string;
  description: string;
  lastUpdated: string;
  sections: LegalSection[];
  contactText: string;
  backLabel: string;
}

interface LegalTranslations {
  terms: LegalPageContent;
  privacy: LegalPageContent;
  refund: LegalPageContent;
}

const legalTranslations: Record<string, LegalTranslations> = {
  // ═══ Italiano ═══
  it: {
    terms: {
      title: "Termini di Servizio",
      description: "Termini e condizioni per l'uso di Courssy",
      lastUpdated: "Ultimo aggiornamento: 1 gennaio 2026",
      sections: [
        {
          title: "1. Accettazione",
          paragraphs: [
            "Accedendo o utilizzando UploaderCourssy (il \"servizio\", la \"piattaforma\", sviluppato da Courssy S.r.l.), accetti di essere vincolato da questi Termini di Servizio (\"Termini\"). Se non sei d'accordo con questi Termini, non utilizzare il servizio.",
            "Utilizzando il servizio, dichiari di avere almeno 18 anni e di avere la capacità legale di stipulare contratti.",
          ],
        },
        {
          title: "2. Descrizione del Servizio",
          paragraphs: [
            "Courssy è una piattaforma SaaS che consente agli utenti di creare e gestire funnel di vendita per corsi digitali. I servizi includono:",
          ],
          items: [
            "Creazione di pagine di vendita e landing page",
            "Gestione di checkout e pagamenti",
            "Distribuzione di contenuti digitali",
            "Strumenti di analisi e tracciamento",
          ],
        },
        {
          title: "3. Account e Accesso",
          items: [
            "Sei responsabile della riservatezza delle tue credenziali",
            "Devi immediatamente informarci di qualsiasi uso non autorizzato",
            "Non puoi condividere il tuo account con terze parti",
            "Possiamo sospendere o terminare account che violano questi Termini",
          ],
        },
        {
          title: "4. Piani, Fatturazione e Politica di Rimborso",
          paragraphs: [
            "Piano Starter: gratuito, 1 funnel, 100 studenti, branding Courssy visibile.",
            "Piano Pro: €29/mese, funnel illimitati, dominio personalizzato, zero commissioni sulle transazioni.",
            "I pagamenti sono gestiti da Stripe e Lemon Squeezy. Le fatture vengono generate automaticamente e sono accessibili dal tuo account.",
            "Politica di Rimborso: offriamo una garanzia di rimborso di 30 giorni per il primo ciclo di fatturazione. Se non sei soddisfatto della piattaforma entro 30 giorni dall'abbonamento, puoi contattarci a supporto@courssy.it per richiedere un rimborso completo.",
          ],
        },
        {
          title: "5. Contenuti dell'Utente",
          paragraphs: [
            "I contenuti che carichi sulla piattaforma (corsi, testi, immagini) rimangono di tua proprietà. Ci concedi una licenza per usarli per fornire il servizio.",
            "Garantisci di detenere tutti i diritti sui contenuti caricati e che questi non violano i diritti di terze parti.",
          ],
        },
        {
          title: "6. Uso Accettabile",
          paragraphs: ["Non puoi utilizzare il servizio per:"],
          items: [
            "Attività illegali o violazione di diritti di terze parti",
            "Contenuti fraudolenti, ingannevoli o spam",
            "Violazione di copyright, marchi o leggi sulla privacy",
            "Interferire con il funzionamento del servizio",
          ],
        },
        {
          title: "7. Limitazione di Responsabilità",
          paragraphs: [
            "Il servizio è fornito \"così com'è\". Non garantiamo che il servizio sia sempre disponibile, privo di errori o senza interruzioni.",
            "Non saremo responsabili per danni indiretti, consequenziali, speciali o punitivi, inclusa la perdita di profitti, dati o opportunità commerciali.",
          ],
        },
        {
          title: "8. Proprietà Intellettuale",
          paragraphs: [
            "UploaderCourssy, Courssy e il suo design, logo e interfaccia sono di nostra proprietà e sono protetti da copyright e altri diritti di proprietà intellettuale.",
          ],
        },
        {
          title: "9. Terminazione",
          paragraphs: [
            "Possiamo sospendere o terminare il tuo servizio in qualsiasi momento, con o senza preavviso, per violazione di questi Termini o per motivi di sicurezza.",
          ],
        },
        {
          title: "10. Legge Applicabile",
          paragraphs: [
            "Questi Termini sono regolati dalla legge italiana. Qualsiasi controversia sarà risolta esclusivamente presso il Tribunale di Roma.",
          ],
        },
      ],
      contactText: "Per domande su questi Termini, contattaci a",
      backLabel: "← indietro",
    },
    privacy: {
      title: "Privacy Policy",
      description: "Privacy Policy per Courssy",
      lastUpdated: "Ultimo aggiornamento: 1 gennaio 2026",
      sections: [
        {
          title: "1. Titolare del Trattamento",
          paragraphs: [
            "UploaderCourssy (sviluppato da Courssy S.r.l., denominato \"noi\", \"nostro\", \"titolare\", o \"UploaderCourssy\") è responsabile del trattamento dei tuoi dati personali in conformità con il Regolamento Generale sulla Protezione dei Dati (GDPR).",
            "Entità: Courssy S.r.l.\nIndirizzo: Via Roma 123, 00100 Roma, Italia\nEmail: supporto@courssy.it",
          ],
        },
        {
          title: "2. Dati Raccolti",
          paragraphs: ["Raccogliamo le seguenti categorie di dati:"],
          items: [
            "Informazioni Account: nome, email, password crittografata",
            "Informazioni di Pagamento: elaborate in modo sicuro da Stripe e Lemon Squeezy, mai memorizzate sui nostri server",
            "Dati di Utilizzo: pagine visitate, azioni eseguite, timestamp",
            "Cookie: identificatori anonimi per funzionalità e analisi",
          ],
        },
        {
          title: "3. Finalità del Trattamento",
          paragraphs: ["Trattiamo i tuoi dati per:"],
          items: [
            "Fornire accesso alla piattaforma e ai tuoi corsi",
            "Processare pagamenti ed emettere fatture/ricevute",
            "Inviare email transazionali (es. conferme ordini, link di recupero)",
            "Migliorare le prestazioni della piattaforma e l'esperienza utente",
            "Rispettare obblighi legali e fiscali",
          ],
        },
        {
          title: "4. Base Giuridica",
          paragraphs: ["Il trattamento dei dati si basa su:"],
          items: [
            "Esecuzione del contratto (GDPR Art. 6.1.b) — per erogare i servizi sottoscritti",
            "Consenso (GDPR Art. 6.1.a) — per il marketing diretto (revocabile in qualsiasi momento)",
            "Interesse legittimo (GDPR Art. 6.1.f) — per la sicurezza della piattaforma e l'analisi di base",
            "Obbligo legale (GDPR Art. 6.1.c) — per registri fiscali e contabili",
          ],
        },
        {
          title: "5. Conservazione dei Dati",
          paragraphs: [
            "Conserviamo i tuoi dati personali per il tempo necessario a soddisfare le finalità descritte. I dati dell'account vengono eliminati entro 30 giorni dalla richiesta di cancellazione. I dati di fatturazione sono conservati per 10 anni per rispettare le leggi fiscali vigenti.",
          ],
        },
        {
          title: "6. I Tuoi Diritti",
          paragraphs: ["Hai il diritto di:"],
          items: [
            "Accedere ai tuoi dati personali",
            "Rettificare dati inesatti o incompleti",
            "Richiedere la cancellazione dei tuoi dati (\"diritto all'oblio\")",
            "Opporti o limitare il trattamento dei tuoi dati",
            "Portabilità dei dati",
          ],
        },
        {
          title: "7. Cookie Policy",
          paragraphs: [
            "Utilizziamo cookie essenziali (necessari per il funzionamento della piattaforma) e cookie analitici (per capire come interagisci con il nostro servizio). Puoi gestire le preferenze sui cookie direttamente dalle impostazioni del tuo browser.",
            "Servizi di terze parti che impostano cookie: Stripe (elaborazione pagamenti), Lemon Squeezy (merchant of record) e Vercel (hosting provider).",
          ],
        },
        {
          title: "8. Modifiche",
          paragraphs: [
            "Questa Privacy Policy può essere aggiornata periodicamente. Le modifiche significative saranno comunicate via email o visualizzate in modo evidente sulla piattaforma.",
          ],
        },
      ],
      contactText: "Per qualsiasi domanda sulla privacy, contattaci a",
      backLabel: "← indietro",
    },
    refund: {
      title: "Politica di Rimborso",
      description: "Politica di Rimborso per Courssy",
      lastUpdated: "Ultimo aggiornamento: 1 gennaio 2026",
      sections: [
        {
          title: "Garanzia di Rimborso di 30 Giorni",
          paragraphs: [
            "Da Courssy vogliamo assicurarci che tu sia soddisfatto al 100% della nostra piattaforma. Offriamo una garanzia di rimborso di 30 giorni per tutti i piani iniziali di abbonamento (Starter, Pro, ecc.) e per gli acquisti di corsi digitali.",
            "Se ritieni che la piattaforma non soddisfi le tue esigenze, o se non sei soddisfatto del tuo acquisto per qualsiasi motivo, puoi richiedere un rimborso completo entro 30 giorni dalla data di acquisto originale.",
          ],
        },
        {
          title: "Come Richiedere un Rimborso",
          paragraphs: [
            "Per richiedere un rimborso, invia un'email a supporto@courssy.it con i seguenti dettagli:",
          ],
          items: [
            "L'email del tuo account registrato",
            "L'ID ordine o l'ID transazione",
            "Una breve spiegazione del motivo del rimborso (opzionale, ma ci aiuta a migliorare)",
          ],
        },
        {
          title: "Elaborazione dei Rimborsi",
          paragraphs: [
            "Una volta ricevuta la richiesta di rimborso, verrà esaminata ed elaborata entro 3-5 giorni lavorativi. Il rimborso sarà accreditato sul metodo di pagamento originale (gestito tramite il nostro Merchant of Record, Lemon Squeezy o Stripe).",
            "Nota che una volta elaborato il rimborso, l'accesso alle funzionalità a pagamento dell'abbonamento o ai contenuti del corso digitale sarà immediatamente terminato.",
          ],
        },
      ],
      contactText: "Per domande sulla nostra Politica di Rimborso, contattaci a",
      backLabel: "← indietro",
    },
  },

  // ═══ English ═══
  en: {
    terms: {
      title: "Terms & Conditions",
      description: "Terms and conditions for using Courssy",
      lastUpdated: "Last updated: January 1, 2026",
      sections: [
        {
          title: "1. Acceptance",
          paragraphs: [
            "By accessing or using UploaderCourssy (the \"service\", the \"platform\", developed by Courssy S.r.l.), you agree to be bound by these Terms & Conditions (\"Terms\"). If you do not agree to these Terms, do not use the service.",
            "By using the service, you represent that you are at least 18 years old and have the legal capacity to enter into contracts.",
          ],
        },
        {
          title: "2. Description of Service",
          paragraphs: [
            "Courssy is a SaaS platform that allows users to create and manage sales funnels for digital courses. The services include:",
          ],
          items: [
            "Creation of sales pages and landing pages",
            "Checkout and payment management",
            "Distribution of digital content",
            "Analytics and tracking tools",
          ],
        },
        {
          title: "3. Account and Access",
          items: [
            "You are responsible for maintaining the confidentiality of your credentials",
            "You must immediately notify us of any unauthorized use",
            "You cannot share your account with third parties",
            "We may suspend or terminate accounts that violate these Terms",
          ],
        },
        {
          title: "4. Plans, Billing, and Refund Policy",
          paragraphs: [
            "Starter Plan: free, 1 funnel, 100 students, visible Courssy branding.",
            "Pro Plan: €29/month, unlimited funnels, custom domain, zero transaction fees.",
            "Payments are managed by Stripe and Lemon Squeezy. Invoices are generated automatically and are accessible from your account.",
            "Refund Policy: We offer a 30-day money-back guarantee for your first billing cycle. If you are not satisfied with the platform within 30 days of subscribing, you may contact us at supporto@courssy.it to request a full refund.",
          ],
        },
        {
          title: "5. Customer Content",
          paragraphs: [
            "The content you upload to the platform (courses, text, images) remains your property. You grant us a license to use it to provide the service.",
            "You warrant that you own all rights to the uploaded content and that it does not infringe on third-party rights.",
          ],
        },
        {
          title: "6. Acceptable Use",
          paragraphs: ["You may not use the service for:"],
          items: [
            "Illegal activities or violating third-party rights",
            "Fraudulent, deceptive, or spam content",
            "Infringing on copyrights, trademarks, or privacy laws",
            "Interfering with the operation of the service",
          ],
        },
        {
          title: "7. Limitation of Liability",
          paragraphs: [
            "The service is provided \"as is\". We do not guarantee that the service will always be available, error-free, or run without interruptions.",
            "We will not be liable for any indirect, consequential, special, or punitive damages, including loss of profits, data, or business opportunities.",
          ],
        },
        {
          title: "8. Intellectual Property",
          paragraphs: [
            "UploaderCourssy, Courssy, and its design, logo, and interface are our property and are protected by copyright and other intellectual property rights.",
          ],
        },
        {
          title: "9. Termination",
          paragraphs: [
            "We may suspend or terminate your service at any time, with or without notice, for violation of these Terms or for security reasons.",
          ],
        },
        {
          title: "10. Governing Law",
          paragraphs: [
            "These Terms are governed by Italian law. Any dispute will be resolved exclusively in the Court of Rome.",
          ],
        },
      ],
      contactText: "For questions about these Terms, contact us at",
      backLabel: "← back",
    },
    privacy: {
      title: "Privacy Policy",
      description: "Privacy Policy for Courssy",
      lastUpdated: "Last updated: January 1, 2026",
      sections: [
        {
          title: "1. Data Controller",
          paragraphs: [
            "UploaderCourssy (developed by Courssy S.r.l., referred to as \"we\", \"our\", \"controller\", or \"UploaderCourssy\") is responsible for the processing of your personal data in accordance with the General Data Protection Regulation (GDPR).",
            "Entity: Courssy S.r.l.\nAddress: Via Roma 123, 00100 Rome, Italy\nEmail: supporto@courssy.it",
          ],
        },
        {
          title: "2. Collected Data",
          paragraphs: ["We collect the following categories of data:"],
          items: [
            "Account Information: name, email, encrypted password",
            "Payment Information: processed securely by Stripe and Lemon Squeezy, never stored on our servers",
            "Usage Data: pages visited, actions performed, timestamps",
            "Cookies: anonymous identifiers for functionality and analytics",
          ],
        },
        {
          title: "3. Purposes of Processing",
          paragraphs: ["We process your data to:"],
          items: [
            "Provide access to the platform and your courses",
            "Process payments and issue invoices/receipts",
            "Send transactional emails (e.g. order confirmations, recovery links)",
            "Improve the platform performance and user experience",
            "Comply with legal and tax obligations",
          ],
        },
        {
          title: "4. Legal Basis",
          paragraphs: ["Data processing is based on:"],
          items: [
            "Contract execution (GDPR Art. 6.1.b) — to deliver services you subscribed to",
            "Consent (GDPR Art. 6.1.a) — for direct marketing (which you can revoke anytime)",
            "Legitimate interest (GDPR Art. 6.1.f) — for platform security and basic analytics",
            "Legal compliance (GDPR Art. 6.1.c) — for tax and accounting records",
          ],
        },
        {
          title: "5. Data Retention",
          paragraphs: [
            "We store your personal data for as long as necessary to fulfill the purposes outlined. Account data is deleted within 30 days of a cancellation request. Billing data is retained for 10 years to comply with statutory tax laws.",
          ],
        },
        {
          title: "6. Your Rights",
          paragraphs: ["You have the right to:"],
          items: [
            "Access your personal data",
            "Rectify inaccurate or incomplete data",
            "Request erasure of your data (\"right to be forgotten\")",
            "Object to or restrict the processing of your data",
            "Data portability",
          ],
        },
        {
          title: "7. Cookie Policy",
          paragraphs: [
            "We use essential cookies (required for platform operation) and analytical cookies (to understand how you interact with our service). You can manage cookie preferences directly from your browser settings.",
            "Third-party services placing cookies: Stripe (payment processing), Lemon Squeezy (merchant of record), and Vercel (hosting provider).",
          ],
        },
        {
          title: "8. Amendments",
          paragraphs: [
            "This Privacy Policy may be updated periodically. Significant changes will be notified via email or displayed prominently on our platform.",
          ],
        },
      ],
      contactText: "For any privacy inquiries, please contact us at",
      backLabel: "← back",
    },
    refund: {
      title: "Refund Policy",
      description: "Refund Policy for Courssy",
      lastUpdated: "Last updated: January 1, 2026",
      sections: [
        {
          title: "30-Day Money-Back Guarantee",
          paragraphs: [
            "At Courssy, we want to ensure you are 100% satisfied with our platform. We offer a 30-day money-back guarantee for all initial subscription plans (Starter, Pro, etc.) and digital course purchases.",
            "If you feel the platform does not meet your needs, or if you are unsatisfied with your purchase for any reason, you can request a full refund within 30 days from your original purchase date.",
          ],
        },
        {
          title: "How to Request a Refund",
          paragraphs: [
            "To request a refund, please send an email to supporto@courssy.it with the following details:",
          ],
          items: [
            "Your registered account email",
            "The order ID or transaction ID",
            "A brief explanation of why you are requesting a refund (optional, but helps us improve)",
          ],
        },
        {
          title: "Processing of Refunds",
          paragraphs: [
            "Once your refund request is received, it will be inspected and processed within 3 to 5 business days. The refund will be credited back to your original payment method (managed via our Merchant of Record, Lemon Squeezy, or Stripe).",
            "Please note that once a refund is processed, access to the paid subscription features or the digital course contents will be immediately terminated.",
          ],
        },
      ],
      contactText: "For questions about our Refund Policy, contact us at",
      backLabel: "← back",
    },
  },

  // ═══ Español ═══
  es: {
    terms: {
      title: "Términos y Condiciones",
      description: "Términos y condiciones para usar Courssy",
      lastUpdated: "Última actualización: 1 de enero de 2026",
      sections: [
        {
          title: "1. Aceptación",
          paragraphs: [
            "Al acceder o usar UploaderCourssy (el \"servicio\", la \"plataforma\", desarrollado por Courssy S.r.l.), aceptas estar vinculado por estos Términos y Condiciones (\"Términos\"). Si no estás de acuerdo con estos Términos, no uses el servicio.",
            "Al usar el servicio, declaras que tienes al menos 18 años y tienes capacidad legal para celebrar contratos.",
          ],
        },
        {
          title: "2. Descripción del Servicio",
          paragraphs: [
            "Courssy es una plataforma SaaS que permite a los usuarios crear y gestionar embudos de venta para cursos digitales. Los servicios incluyen:",
          ],
          items: [
            "Creación de páginas de ventas y landing pages",
            "Gestión de checkout y pagos",
            "Distribución de contenido digital",
            "Herramientas de análisis y seguimiento",
          ],
        },
        {
          title: "3. Cuenta y Acceso",
          items: [
            "Eres responsable de mantener la confidencialidad de tus credenciales",
            "Debes notificarnos inmediatamente cualquier uso no autorizado",
            "No puedes compartir tu cuenta con terceros",
            "Podemos suspender o terminar cuentas que violen estos Términos",
          ],
        },
        {
          title: "4. Planes, Facturación y Política de Reembolso",
          paragraphs: [
            "Plan Starter: gratis, 1 funnel, 100 estudiantes, branding Courssy visible.",
            "Plan Pro: €29/mes, funnels ilimitados, dominio personalizado, cero comisiones por transacción.",
            "Los pagos son gestionados por Stripe y Lemon Squeezy. Las facturas se generan automáticamente y son accesibles desde tu cuenta.",
            "Política de Reembolso: ofrecemos una garantía de reembolso de 30 días para tu primer ciclo de facturación. Si no estás satisfecho con la plataforma dentro de los 30 días de suscribirte, puedes contactarnos a supporto@courssy.it para solicitar un reembolso completo.",
          ],
        },
        {
          title: "5. Contenido del Cliente",
          paragraphs: [
            "El contenido que subes a la plataforma (cursos, textos, imágenes) sigue siendo de tu propiedad. Nos concedes una licencia para usarlo para proporcionar el servicio.",
            "Garantizas que posees todos los derechos sobre el contenido subido y que no infringe los derechos de terceros.",
          ],
        },
        {
          title: "6. Uso Aceptable",
          paragraphs: ["No puedes usar el servicio para:"],
          items: [
            "Actividades ilegales o violar derechos de terceros",
            "Contenido fraudulento, engañoso o spam",
            "Infringir derechos de autor, marcas o leyes de privacidad",
            "Interferir con el funcionamiento del servicio",
          ],
        },
        {
          title: "7. Limitación de Responsabilidad",
          paragraphs: [
            "El servicio se proporciona \"tal cual\". No garantizamos que el servicio esté siempre disponible, libre de errores o sin interrupciones.",
            "No seremos responsables por daños indirectos, consecuentes, especiales o punitivos, incluida la pérdida de beneficios, datos u oportunidades comerciales.",
          ],
        },
        {
          title: "8. Propiedad Intelectual",
          paragraphs: [
            "UploaderCourssy, Courssy y su diseño, logo e interfaz son de nuestra propiedad y están protegidos por derechos de autor y otros derechos de propiedad intelectual.",
          ],
        },
        {
          title: "9. Terminación",
          paragraphs: [
            "Podemos suspender o terminar tu servicio en cualquier momento, con o sin previo aviso, por violación de estos Términos o por razones de seguridad.",
          ],
        },
        {
          title: "10. Ley Aplicable",
          paragraphs: [
            "Estos Términos se rigen por la ley italiana. Cualquier disputa se resolverá exclusivamente en el Tribunal de Roma.",
          ],
        },
      ],
      contactText: "Para preguntas sobre estos Términos, contáctanos a",
      backLabel: "← volver",
    },
    privacy: {
      title: "Política de Privacidad",
      description: "Política de Privacidad para Courssy",
      lastUpdated: "Última actualización: 1 de enero de 2026",
      sections: [
        {
          title: "1. Responsable del Tratamiento",
          paragraphs: [
            "UploaderCourssy (desarrollado por Courssy S.r.l., denominado \"nosotros\", \"nuestro\", \"responsable\", o \"UploaderCourssy\") es responsable del tratamiento de tus datos personales de conformidad con el Reglamento General de Protección de Datos (GDPR).",
            "Entidad: Courssy S.r.l.\nDirección: Via Roma 123, 00100 Roma, Italia\nEmail: supporto@courssy.it",
          ],
        },
        {
          title: "2. Datos Recopilados",
          paragraphs: ["Recopilamos las siguientes categorías de datos:"],
          items: [
            "Información de Cuenta: nombre, email, contraseña encriptada",
            "Información de Pago: procesada de forma segura por Stripe y Lemon Squeezy, nunca almacenada en nuestros servidores",
            "Datos de Uso: páginas visitadas, acciones realizadas, timestamps",
            "Cookies: identificadores anónimos para funcionalidad y análisis",
          ],
        },
        {
          title: "3. Finalidades del Tratamiento",
          paragraphs: ["Tratamos tus datos para:"],
          items: [
            "Proporcionar acceso a la plataforma y a tus cursos",
            "Procesar pagos y emitir facturas/recibos",
            "Enviar emails transaccionales (ej. confirmaciones de pedido, links de recuperación)",
            "Mejorar el rendimiento de la plataforma y la experiencia del usuario",
            "Cumplir con obligaciones legales y fiscales",
          ],
        },
        {
          title: "4. Base Jurídica",
          paragraphs: ["El tratamiento de datos se basa en:"],
          items: [
            "Ejecución del contrato (GDPR Art. 6.1.b) — para entregar los servicios contratados",
            "Consentimiento (GDPR Art. 6.1.a) — para marketing directo (revocable en cualquier momento)",
            "Interés legítimo (GDPR Art. 6.1.f) — para seguridad de la plataforma y análisis básico",
            "Cumplimiento legal (GDPR Art. 6.1.c) — para registros fiscales y contables",
          ],
        },
        {
          title: "5. Conservación de Datos",
          paragraphs: [
            "Conservamos tus datos personales durante el tiempo necesario para cumplir las finalidades descritas. Los datos de la cuenta se eliminan dentro de los 30 días desde la solicitud de cancelación. Los datos de facturación se conservan durante 10 años para cumplir con las leyes fiscales vigentes.",
          ],
        },
        {
          title: "6. Tus Derechos",
          paragraphs: ["Tienes derecho a:"],
          items: [
            "Acceder a tus datos personales",
            "Rectificar datos inexactos o incompletos",
            "Solicitar la eliminación de tus datos (\"derecho al olvido\")",
            "Oponerte o limitar el tratamiento de tus datos",
            "Portabilidad de datos",
          ],
        },
        {
          title: "7. Política de Cookies",
          paragraphs: [
            "Utilizamos cookies esenciales (necesarias para el funcionamiento de la plataforma) y cookies analíticas (para entender cómo interactúas con nuestro servicio). Puedes gestionar las preferencias de cookies directamente desde la configuración de tu navegador.",
            "Servicios de terceros que colocan cookies: Stripe (procesamiento de pagos), Lemon Squeezy (merchant of record) y Vercel (proveedor de hosting).",
          ],
        },
        {
          title: "8. Modificaciones",
          paragraphs: [
            "Esta Política de Privacidad puede actualizarse periódicamente. Los cambios significativos se notificarán por email o se mostrarán prominentemente en nuestra plataforma.",
          ],
        },
      ],
      contactText: "Para cualquier consulta sobre privacidad, contáctanos a",
      backLabel: "← volver",
    },
    refund: {
      title: "Política de Reembolso",
      description: "Política de Reembolso para Courssy",
      lastUpdated: "Última actualización: 1 de enero de 2026",
      sections: [
        {
          title: "Garantía de Reembolso de 30 Días",
          paragraphs: [
            "En Courssy queremos asegurarnos de que estés 100% satisfecho con nuestra plataforma. Ofrecemos una garantía de reembolso de 30 días para todos los planes de suscripción iniciales (Starter, Pro, etc.) y las compras de cursos digitales.",
            "Si sientes que la plataforma no satisface tus necesidades, o si no estás satisfecho con tu compra por cualquier motivo, puedes solicitar un reembolso completo dentro de los 30 días desde la fecha de compra original.",
          ],
        },
        {
          title: "Cómo Solicitar un Reembolso",
          paragraphs: [
            "Para solicitar un reembolso, envía un email a supporto@courssy.it con los siguientes detalles:",
          ],
          items: [
            "El email de tu cuenta registrada",
            "El ID de pedido o el ID de transacción",
            "Una breve explicación del motivo del reembolso (opcional, pero nos ayuda a mejorar)",
          ],
        },
        {
          title: "Procesamiento de Reembolsos",
          paragraphs: [
            "Una vez recibida la solicitud de reembolso, será revisada y procesada dentro de 3 a 5 días hábiles. El reembolso se acreditará en tu método de pago original (gestionado a través de nuestro Merchant of Record, Lemon Squeezy o Stripe).",
            "Ten en cuenta que una vez procesado el reembolso, el acceso a las funciones de suscripción de pago o a los contenidos del curso digital se terminará inmediatamente.",
          ],
        },
      ],
      contactText: "Para preguntas sobre nuestra Política de Reembolso, contáctanos a",
      backLabel: "← volver",
    },
  },
};

// English as universal fallback
const FALLBACK: LegalTranslations = legalTranslations.en;

/**
 * Get legal translations for a given language code.
 * Falls back to English if the language is not supported.
 *
 * @param langCode - 2-letter language code (e.g. "it", "en", "es")
 */
/**
 * (Internal) Restituisce le traduzioni legali per un dato lang code.
 * Esportato come fallback per il barrel `src/lib/i18n/index.ts` che
 * re-esporta tutto. Se in futuro il privacy/terms rewrite userà
 * questo, ri-aggiungere `export`.
 */
function getLegalTranslations(langCode: string): LegalTranslations {
  const normalized = langCode.toLowerCase().split("-")[0];
  return legalTranslations[normalized] ?? FALLBACK;
}
