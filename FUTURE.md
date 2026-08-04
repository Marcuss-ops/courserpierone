# Future Improvements

> 🚫 **NON è il repo Velox.** Questo documento appartiene a **courserpierone / Courssy**
> (piattaforma corsi: Next.js + Supabase + Lemon Squeezy) — un progetto separato
> dalla render farm **Velox**. Per il futuro/migliorie di Velox (`VeloxEditiingg`)
> vedi il file omonimo [`FUTURE.md`](https://github.com/Marcuss-ops/VeloxEditiingg/blob/main/FUTURE.md)
> (più [`ROADMAP.md`](https://github.com/Marcuss-ops/VeloxEditiingg/blob/main/ROADMAP.md) e
> [`DEPLOY-CHECKLIST.md`](https://github.com/Marcuss-ops/VeloxEditiingg/blob/main/DEPLOY-CHECKLIST.md)).

> Catalogo organizzato di tutte le feature, ottimizzazioni e migliorie future per la piattaforma multilingua.

---

## 📋 Legenda Priorità

| Simbolo | Significato |
|---------|-------------|
| 🔴 Alta | Impatto immediato su revenue/conversioni |
| 🟡 Media | Crescita e scalabilità |
| 🟢 Bassa | Nice-to-have, rifiniture |
| ⚪ Infra | Infrastruttura e manutenzione |

---

## 1. 📧 Email & Automazione

### 🔴 Email transazionali localizzate
- [x] Purchase confirmation (IT/EN/FR/DE/ES/PT/JA)
- [x] Abandoned checkout recovery (IT/EN/FR/DE/ES)
- [ ] **Email di benvenuto** con credenziali e link al corso
- [ ] **Email di upsell** (24h dopo acquisto: "Potrebbe interessarti anche...")
- [ ] **Email di re-engagement** (30gg senza accesso: "Il corso ti aspetta")
- [ ] **Template email per affiliate** (promo link, report commissioni)
- [ ] **Abandoned checkout con sconto** (automatico 10% dopo 24h)

### 🟡 Automazione marketing
- [ ] **Sequenze email** (drip campaign: 5 email in 7 giorni)
- [ ] **Trigger comportamentali** (es. completamento lezione → upsell)
- [ ] **Segmentazione utenti** (per lingua, prodotto acquistato, data)
- [ ] **Coupon dinamici** via email (sconto personalizzato)
- [ ] **Webhook diari** per report acquisti/recuperi
- [ ] **Email di compleanno** / anniversario acquisto

---

## 2. 🚀 SEO & Performance

### 🔴 Metadata per locale (head)
- [ ] **Title tag localizzato** per ogni lingua
- [ ] **Meta description localizzata** per ogni lingua
- [ ] **Open Graph tag** (og:title, og:description, og:image) per lingua
- [ ] **Twitter Card** localizzate
- [ ] **JSON-LD structured data** (Product, Course, FAQ) per lingua
- [ ] **Canonical URL** per ogni versione locale (evita duplicati)
- [ ] **Hreflang** già implementato — ✓

### 🟡 Ottimizzazione pagine
- [ ] **Sitemap per prodotto** (oggi flat — generare sitemap separate)
- [ ] **SSG/ISR** per pagine prodotto (ridurre TTFB)
- [ ] **Preload font critici e LCP image**
- [ ] **Lazy loading immagini non critiche**
- [ ] **Core Web Vitals** monitoring
- [ ] **A/B testing** su CTA, prezzo, layout per lingua
- [ ] **Pagina 404 localizzata** per lingua

### ⚪ Infrastruttura
- [ ] **CDN Cloudflare** per asset statici
- [ ] **Edge caching** per pagine pubbliche (Vercel Edge / Cloudflare)
- [ ] **Image optimization** pipeline (WebP, AVIF)
- [ ] **Redirect map** per URL legacy (/{lang}/ → /{locale}/)

---

## 3. 🎓 Corsi & Lezioni

### 🔴 Player & Erogazione
- [ ] **Player video integrato** (YouTube/Vimeo embed) con navigazione lezioni
- [ ] **Pulsanti** Avanti/Indietro tra lezioni
- [ ] **Progresso lezioni** (visivo: barra di completamento)
- [ ] **Ripresa automatica** (salva timestamp video)
- [ ] **Download PDF per lezione** (collegato a `LessonAsset`)
- [ ] **Player audio indipendente** (per corsi solo audio)
- [ ] **Tracce audio multiple per lingua** (stesso video, audio diverso)

### 🟡 Funzionalità corso
- [ ] **Certificati di completamento** (generazione PDF + download)
  - API esiste (`/api/certificate/[productId]`) — manca UI
- [ ] **Appunti studente** per lezione (CRUD completo)
  - Schema `LessonNote` esiste — manca integrazione UI
- [ ] **Segnalibri** (salva minuto esatto del video)
- [ ] **Velocità riproduzione** (0.5x, 1x, 1.5x, 2x)
- [ ] **Sottotitoli** (SRT/VTT per lingua, auto-generati con Whisper)
- [ ] **Trascrizione lezione** (testo completo sotto il video)
- [ ] **Download offline** (PWA service worker)

### 🟢 Gamification
- [ ] **Badge** per completamento corso, prime 24h, referral
- [ ] **Classifica** (studenti più attivi del mese)
- [ ] **XP / punti** per lezione completata
- [ ] **Streak** (accesso giornaliero consecutivo)

---

## 4. 👤 Utenti & Accesso

### 🔴 Area utente
- [ ] **Dashboard completa**:
  - Lista acquisti con link ai corsi
  - Download PDF e risorse
  - Progresso corsi (% completato)
  - Ultimo accesso / ripresa corso
- [ ] **Profilo utente**:
  - Modifica nome, email, avatar
  - Preferenza lingua (salva in DB, non solo cookie)
  - Storico ordini
- [ ] **Access Gate** integrato (`access-gate.tsx`):
  - Chi ha comprato → vede contenuti
  - Chi non ha comprato → vede CTA "Acquista Ora"

### 🟡 Auth & Sicurezza
- [ ] **Reset password**
- [ ] **2FA** per utenti admin
- [ ] **Rate limiting** su login e checkout API
- [ ] **Session management** (vedi sessioni attive, revoca)
- [ ] **Social login** esteso (GitHub, Apple, Facebook)

### 🟢 Community
- [ ] **Commenti sotto le lezioni** (thread per lezione)
- [ ] **Discussioni** (forum per prodotto)
- [ ] **Recensioni prodotto** (stelle + testo, per lingua)
- [ ] **Q&A** (domande e risposte visibili a tutti)
- [ ] **Coach / mentor** (prenotazione call direttamente)

---

## 5. 💰 E-commerce & Prezzi

### 🔴 Checkout & Vendite
- [ ] **Coupon e sconti**:
  - Codici promozionali (es. `ESTATE2026`)
  - Sconto percentuale (10%, 20%, 50%)
  - Sconto fisso (€10 off)
  - Scadenza coupon
  - Coupon per lingua specifica
  - Coupon usa-e-getta (single-use)
- [ ] **Prezzi dinamici per paese**:
  - Prezzo diverso per BR vs US vs EU
  - Non solo cambio valuta, ma prezzo adattato al mercato
- [ ] **Bundle prodotti**:
  - Sconto su acquisto multiplo (es. 3 corsi a €99)
  - Bundle per lingua (es. pacchetto FR completo)
- [ ] **Pricing tiers** (Basic / Pro / Enterprise)

### 🟡 Gestione ordini
- [ ] **Admin: CRUD coupon** (crea, modifica, disabilita)
- [ ] **Admin: report ordini** (filtra per lingua, prodotto, periodo)
- [ ] **Admin: rimborsi** (processo semplificato)
- [ ] **Admin: sconti manuali** (per utente specifico)
- [ ] **Storico cambi prezzo** (tracking nel DB)
- [ ] **Test mode** (checkout di prova senza pagare)

### 🟢 Affiliazioni
- [ ] **Programma affiliazioni**:
  - Link tracciato per partner
  - Commissione per vendita (% o fisso)
  - Dashboard affiliato (click, conversioni, commissioni)
  - Payout automatico (Lemon Squeezy Affiliates)
- [ ] **Lemon Squeezy Affiliates** per marketplace (creator esterni vendono)

---

## 6. 📊 Analytics & Dati

### 🔴 Dashboard Admin
- [ ] **Revenue overview**: MRR, ARPU, LTV
- [ ] **Conversioni per lingua** (visite → checkout → acquisto)
- [ ] **Conversioni per canale YouTube** (UTM source tracking)
- [ ] **Funnel visualization** (componente esiste — integrarlo in admin)
- [ ] **Cohort analysis** (retention per mese di acquisto)
- [ ] **Top prodotti** (per revenue, per vendite, per lingua)

### 🟡 Tracking eventi
- [ ] **UTM tracking end-to-end**:
  - YouTube → landing page → checkout → acquisto
  - Salva UTM su `AnalyticEvent` + ordine
- [ ] **Source attribution** (ultimo click, primo click)
- [ ] **Session recording** (anonymized, per ottimizzare UX)
- [ ] **Heatmap** (click sul CTA, scroll depth)
- [ ] **A/B test integrato** (split traffic, misura conversioni)

### ⚪ Monitoraggio
- [ ] **Sentry** per error tracking
- [ ] **Uptime monitoring** (cron-job.org / Better Uptime)
- [ ] **Log centralizzato** (per debug produzione)
- [ ] **Alert su drop conversioni** (email/Slack)
- [ ] **Performance budget** (Lighthouse CI)

---

## 7. 🌐 Canali YouTube

### 🟡 Integrazione canali
- [ ] **Popolare tabella `YouTubeChannel`** (dati reali dei canali)
- [ ] **Link generator** (URL con `?channel=xxx` + locale automatico)
- [ ] **Landing page dedicata** per ogni canale (URL brandizzata)
- [ ] **Analytics per canale** (click, conversioni, revenue)
- [ ] **Confronto canali** (quale converte meglio per lingua)
- [ ] **API YouTube** per estrarre metadata canale (subscriber count, video recenti)

### 🟢 Automazione contenuti
- [ ] **Testo descrizione YouTube** generato per ogni lingua
- [ ] **Card e end screen** con URL personalizzato per lingua
- [ ] **Scheduling pubblicazione** coordinato per tutti i canali
- [ ] **Cross-promotion** tra canali (link da IT a EN, etc.)

---

## 8. 🛠 Admin Panel

### 🔴 CRUD completo
- [ ] **Gestione prodotti** (già esistente) — aggiungere:
  - Editor UI translations inline (labels, benefits, FAQ)
  - Anteprima template live
  - Duplica prodotto per nuova lingua
- [ ] **Gestione ordini**: filtri avanzati, export CSV
- [ ] **Gestione utenti**: cerca, blocca, modifica ruolo
- [ ] **Gestione lezioni**: riordina, upload PDF per lingua

### 🟡 Dashboard Admin
- [ ] **Funnel visualization** (grafico a imbuto per ogni lingua)
- [ ] **Revenue chart** (per giorno/settimana/mese, per valuta)
- [ ] **Mapa mondiale** (paesi → conversioni)
- [ ] **Export dati** (CSV, PDF report)
- [ ] **Notifiche** (nuovo ordine, rimborso richiesto)

### 🟢 Admin tools
- [ ] **Traduzione batch** (trigger via UI, non solo script CLI)
- [ ] **Generazione configurazione** (pulsante "Rigenera Config")
- [ ] **Cache management** (invalida cache prodotto)
- [ ] **Log attività admin** (chi ha fatto cosa)
- [ ] **Dark mode** per admin panel

---

## 9. 🤖 Automazione & AI

### 🟡 Traduzioni
- [x] Script batch translate via LLM (27 lingue)
- [ ] **Traduzione automatica UI** (labels, benefits, FAQ)
- [ ] **Traduzione incremental** (solo nuove sezioni, non ritradurre tutto)
- [ ] **Quality check** (controllo automatico traduzioni: lunghezza, coerenza)
- [ ] **Glossario** (termini specifici da non tradurre)
- [ ] **Translation memory** (riusa traduzioni già fatte per frasi simili)

### 🟡 Generazione contenuti
- [ ] **Generazione landing page** completa da descrizione prodotto
- [ ] **Generazione benefits e FAQ** per lingua
- [ ] **Rewriting** (test A/B: variazione CTA, titolo, prezzo)
- [ ] **SEO content generation** (meta title, description per lingua)
- [ ] **Email copywriting** (genera testo email promozionale per lingua)

### 🟢 AI features
- [ ] **Chatbot supporto** sul sito (risponde in lingua dell'utente)
- [ ] **Riepilogo lezione** (auto-generato per ogni video)
- [ ] **Quiz autogenerato** (domande per ogni lezione)
- [ ] **Sottotitoli** con Whisper API (generate per ogni video)
- [ ] **Traduzione sottotitoli** (da EN a tutte le lingue)

---

## 10. ☁️ Infrastruttura & DevOps

### ⚪ Cloud & Hosting
- [ ] **Cloudflare CDN** per asset statici (immagini, PDF, audio)
- [ ] **Image optimization** pipeline (auto-conversione WebP/AVIF)
- [ ] **Edge Functions** per redirect localizzati
- [ ] **Database backup** automatico (giornaliero, con retention 30gg)
- [ ] **Staging environment** (branch preview su Vercel)
- [ ] **Docker compose** per sviluppo locale (DB + app + mailhog)

### ⚪ Performance
- [ ] **Database connection pooling** (PgBouncer o Supabase pool)
- [ ] **Query optimization** (N+1 audit, index tuning)
- [ ] **Redis cache** per CourseConfig (ridurre letture DB)
- [ ] **Pagine statiche** (ISR per landing page prodotto)
- [ ] **Bundle analysis** (ridurre JS initial load)
- [ ] **Edge caching** API response (Cloudflare Cache API)

### ⚪ CI/CD
- [ ] **GitHub Actions** per test automatici su PR
- [ ] **Deploy preview** per ogni branch (Vercel)
- [ ] **Database migration** automatica in deploy
- [ ] **E2E tests** (Playwright / Cypress sui flussi critici)
- [ ] **Load testing** (k6 per checkout flow)
- [ ] **Security audit** automatico (npm audit, secrets scanning)

---

## 11. 🎨 Frontend & UX

### 🟡 Miglioramenti UI
- [ ] **Dark mode** (toggle tema per utente)
- [ ] **Responsive design** completo per mobile
- [ ] **Animazioni** (framer motion per transizioni pagina)
- [ ] **Skeleton loading** (placeholder durante caricamento)
- [ ] **Toast notifications** (conferma azioni utente)
- [ ] **Breadcrumbs** (navigazione chiara)
- [ ] **Infinite scroll** lista prodotti/admin

### 🟢 Accessibilità
- [ ] **Aria labels** su tutti i componenti interattivi
- [ ] **Keyboard navigation** (tab order, focus trap)
- [ ] **Screen reader** testing (VoiceOver, NVDA)
- [ ] **Contrast ratio** WCAG AA (test automatizzato)
- [ ] **Font scaling** (rispetta impostazioni sistema)
- [ ] **Reduced motion** (rispetta preferenza utente)

---

## 12. 🧪 Testing & Qualità

### 🟡 Test coverage
- [ ] **Unit test** per lib/ (locale-resolver, validations, order-service)
  - Esistono test per validations e sanitize — estendere
- [ ] **Integration test** per API routes (checkout, webhooks, translate)
  - Esistono test per auth e analytics — estendere
- [ ] **E2E test** (Playwright):
  - Flusso landing → checkout → acquisto
  - Cambio lingua → pagina localizzata
  - Admin CRUD prodotti
- [ ] **Visual regression** (Chromatic / Percy per template)

### 🟢 Quality
- [ ] **TypeScript strict mode** (tutti gli errori risolti)
- [ ] **ESLint** già configurato — estendere regole
- [ ] **Prettier** per formattazione automatica
- [ ] **Husky** pre-commit hook (typecheck + lint)
- [ ] **Dependency audit** (settimanale, automatico)
- [ ] **API documentation** (OpenAPI / tRPC)

---

## 13. 📱 Mobile & PWA

### 🟢 Progressive Web App
- [ ] **Service worker** (cache first per landing page)
- [ ] **Manifest.json** (icona, nome, tema colore)
- [ ] **Offline access** (corso scaricato)
- [ ] **Push notifications** (nuova lezione, offerta)
- [ ] **Install prompt** (A2HS: Add to Home Screen)

### 🟢 Mobile app
- [ ] **React Native** / Expo per iOS + Android
- [ ] **Download offline** video e PDF
- [ ] **Background audio** (ascolta mentre usi altre app)
- [ ] **Mobile payment** (Apple Pay, Google Pay nativi)
- [ ] **Biometric auth** (Face ID, fingerprint)

---

## 14. 🔌 API & Integrazioni

### 🟡 API pubblica
- [ ] **REST API** documentata per creator esterni
- [ ] **API key** authentication (generazione chiave per partner)
- [ ] **Webhook outbound** (notifica a sistemi esterni su acquisto)
- [ ] **Rate limiting** per API pubblica
- [ ] **API dashboard** (usage, requests, errors)

### 🟢 Integrazioni
- [ ] **Zapier / Make** (n8n) per automazioni no-code
- [ ] **Slack notification** (nuovo ordine, errore)
- [ ] **Discord community** bridge (notifiche acquisti)
- [ ] **Google Analytics 4** / Tag Manager
- [ ] **Facebook Pixel / Meta Ads** (conversion tracking)

---

## 15. 🗂 Database & Data Model

### 🟡 Miglioramenti schema
- [ ] **Soft delete** per prodotti e lezioni
- [ ] **Versioning** delle traduzioni (storico modifiche)
- [ ] **Audit log** tabella unica (registra ogni modifica)
- [ ] **Full-text search** su prodotti e lezioni (PostgreSQL tsvector)
- [ ] **Materialized views** per dashboard analytics
- [ ] **Data retention policy** (anonimizzazione dopo X mesi)

### ⚪ Migrazioni
- [ ] **Migration strategy** per 100+ lingue
- [ ] **Data seeding** per tutti i prodotti esistenti
- [ ] **Export/Import** trasloco dati
- [ ] **Cleanup** dati orfani (abandoned checkout vecchi, sessioni scadute)

---

## 16. 🔒 Legal & Compliance

### 🟡 Privacy & GDPR
- [ ] **Cookie consent banner** (con selezione lingue)
- [ ] **Privacy policy** generata per ogni lingua
- [ ] **Terms of service** per ogni lingua
- [ ] **Data deletion request** (GDPR Art. 17)
- [ ] **Data portability** (esporta tutti i dati utente)
- [ ] **Age verification** (COPPA per minori)

### 🟡 Pagamenti & Tasse
- [ ] **Gestione automatica tasse** per 100+ paesi
- [ ] **VAT handling** EU (MOSS, OSS)
- [ ] **Invoice generation** (fattura PDF per ogni acquisto)
- [ ] **Receipt** nella lingua dell'utente
- [ ] **Multi-currency payout** (affiliati in valuta locale)
- [ ] **Refund policy** per ogni mercato

---

## 📈 Roadmap Suggerita

### Subito (sprint corrente)
1. Batch traduzione LLM (script già creato)
2. Email transazionali localizzate (appena implementato)

### Prossimo sprint
3. SEO metadata per locale (title, description, og:image in head)
4. Coupon e sconti dinamici
5. Popolare tabella YouTubeChannel

### Sprint successivo
6. Player video + area corsi completa
7. Dashboard analytics admin
8. Abandoned checkout email + sconto automatico

### Mese prossimo
9. Certificati di completamento
10. Affiliazioni
11. Bundle prodotti
12. Dark mode + PWA

---

*Ultimo aggiornamento: Giugno 2026*
