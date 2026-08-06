# Architettura del Progetto

## Stack attuale (V1.x)

Costruita su:

- **Next.js 16** (App Router, React Server Components)
- **React 19**
- **Supabase** (Auth + Postgres + Storage + RLS)
- **REST** API (Route Handlers in `src/app/api/*`)
- **Lemon Squeezy** (Merchant of Record, unico payment provider)
- **Tailwind CSS 4** (PostCSS via `@tailwindcss/postcss`)

Stack di supporto: **PostgreSQL** + **Prisma 5**, **Upstash Redis** + **ioredis** per cache/presenza/rate-limit, **next-intl** per i18n, **nodemailer** per email transazionali, **jspdf** per certificati.

> **SSOT runtime:** per versioni esatte e tree completo delle dipendenze, vedi `package.json` + `package-lock.json`. Questa sezione è uno snapshot a V1.x e può driftare; tenere allineato al PR che tocca `package.json`.

## Visione Generale

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Homepage │  │  Store   │  │  Course  │              │
│  │  (i18n)  │  │  (i18n)  │  │  Player  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    API LAYER (REST)                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Auth &   │  │ Payments │  │ Content  │              │
│  │ Users    │  │   (LS)   │  │ Delivery │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                   DATABASE (PostgreSQL)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Products │  │  Orders  │  │  Users   │              │
│  │ & i18n   │  │   (LS)   │  │ & Access │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
```

## Componenti Core

### 1. Sistema di Localizzazione (i18n)

- **Database**: Ogni entità (prodotto, lezione, PDF) ha un campo `locale` e un JSON di traduzioni
- **Routing**: Prefisso URL per lingua (`/it/corso`, `/en/course`, `/es/curso`)
- **Content delivery**: API restituisce la versione nella lingua richiesta
- **Fallback**: Se una traduzione non esiste, mostra la lingua primaria
- **Cataloghi i18n**: `src/lib/i18n/` espone `getUiTranslations`, `localeToLanguage`, `loadLocaleContentSafe/Cached`. Vedi `docs/i18n-coverage.md` per la matrice di copertura per lingua.

### 2. Gestione Prodotti Digitali

- **Asset principale**: Video hosted (YouTube unlisted URLs via `LessonTranslation.videoUrl`)
- **Tracce audio**: File MP3 collegati alla lezione, selezionabili per lingua
- **PDF localizzati**: Un file per lingua, generato o caricato manualmente (`LessonAsset` table)
- **Metadata**: Titolo, descrizione, tags — tutti tradotti
- **Content source of truth**: `ProductTranslation` (DB) + `courses/<slug>/locales/<locale>.json` (canonical path, ADR-0011; `next.config.mjs` `outputFileTracingIncludes` bundla in Lambda). Vedi `docs/content-source-map.md` per la matrice completa e `docs/adr/0009-content-source-canonical.md` per il design canonical.

### 3. Checkout & Pagamenti (LS-only)

- **Lemon Squeezy**: Merchant of Record unico. Gestisce checkout hosted, valuta, tasse (VAT/sales tax) e fatturazione.
- **Webhook → fulfillment**: `src/app/api/webhooks/lemonsqueezy/route.ts` verifica e riserva la delivery in `ProcessedWebhook`, poi traduce l'evento in `CompletePaidOrderCommand` e invoca `processOrder`.
- **Atomicità**: `processOrder` usa `prisma.$transaction` per creare `Order(status='completed')`, upsertare `AccessGrant(status='active')` e creare quattro `OutboxEvent` durabili. Il vincolo `(paymentProvider, providerOrderId)` deduplica gli ordini concorrenti.
- **Idempotenza utente**: `User.upsert` su email elimina la race `findUnique → create`; un `P2002` email è recuperato rileggendo il vincitore.
- **Variant ID**: `Product.lemonVariantId` è il campo canonico per il checkout Lemon Squeezy; il comando accetta un solo locator discriminato (`product_id`, `product_slug` o `variant_id`).
- **Valuta dinamica**: Rilevamento automatico dal browser/posizione utente (`src/lib/i18n/locale-resolver.ts`) → `Product.pricesByCurrency` lookup → override per paese (`Product.countryOverrides`).
- **Consegna automatica**: gli `OutboxEvent` vengono processati dal `OUTBOX_HANDLER_REGISTRY` con validazione Zod e retry policy infrastrutturale. L'email usa `OutboxDeliveryAttempt` con chiave unica `(outboxEventId, channel)`; stati `sent`, `failed` e `uncertain` impediscono reinvii ciechi dopo crash SMTP.
- **Accesso finale**: `AccessGate` legge l'`AccessGrant` attivo; l'ordine non è una credenziale pubblica e non concede accesso direttamente.

### 4. Accesso & Utenti

- **Auth**: Supabase Auth (Google OAuth + Magic Link). Vedi `docs/OAUTH-SETUP.md` per il setup.
- **Ruoli**: `admin`, `creator`, `student` (string columns, check inline in route handlers).
- **Canonical (V2/V3)**: `AccessGrant` table è la single source of truth per l'accesso concesso — "l'utente X ha accesso al prodotto Y". Ha sostituito i direct reads su `Order.status='completed'` come decisione di accesso (legacy path, rimosso insieme al feature flag `USE_ACCESS_GRANT_RESOLVER`). Gli ordini restano consultabili solo per la verifica server-side del checkout anonimo e per classificare un diniego, mai per concedere accesso direttamente.
- **Dashboard utente**: Lista acquisti, download PDF, progresso corsi
- **Area admin**: Gestione prodotti, ordini, utenti (in `src/app/admin/*`)

### 5. Canonical Order Identity

Identità degli ordini — regola architetturale vincolante. Ogni riferimento a un acquisto nel codice deve distinguere esplicitamente i due concetti:

- **`orderId`** — identifica un ordine **nel database applicativo** (`Order.id`, Prisma cuid). È la primary key interna, mai un id del provider esterno.
- **`providerOrderId`** — identifica l'oggetto **nel payment provider esterno** (es. Lemon Squeezy order id). È l'unico campo che può portare un id del provider; a livello di codice interno è esplicitamente nominato `internalOrderId`/`providerOrderId` (mai un generico `id`/`paymentId`/`reference`).

Regole vincolanti:

- **L'autorizzazione al prodotto passa SEMPRE da `resolveProductAccess`** (`src/domains/identity/index.ts`). Ogni consumer — player, portal, download, dashboard, certificate, ebook, progress, messaging, `GET /api/access` — delega la decisione al resolver canonico (AccessGrant SSOT). `src/lib/commerce/access/resolve-product-access.ts` resta temporaneamente un re-export compatibile.
- **Le route UI/content NON devono inferire accesso dai campi di pagamento**: niente query dirette a `Order.status`, niente check inline su `payment_status`/`paid`/`completed` nei player o nelle route che concedono accesso.
- **Wire contract esplicito** di `GET /api/access`: `{ productId, checkoutToken }` solo per lo scambio una tantum, oppure `{ productId }` con sessione autenticata/checkout-session HttpOnly. Il `checkoutToken` è breve, firmato e monouso; la credenziale anonima persistente è esclusivamente il cookie HttpOnly. `orderId` e `providerOrderId` non sono più credenziali pubbliche accettate da questa route.
- **Checkout post-pagamento:** `/api/checkout/complete` verifica server-side un ordine Lemon Squeezy completato e vincolato al prodotto, applica un claim Redis monouso, genera il checkout token firmato e lo converte in una sessione HttpOnly a breve durata. Il provider order id resta confinato al confine di verifica server-side.
- **Le query dirette agli ordini restano SOLO nei servizi amministrativi/account e nel callback server-side di checkout**: `api/admin/*`, history pagamenti (`account/payments`, `api/user/orders`), social-proof, lato scrittura webhook (`processOrder`/`revoke-order`) e verifica del callback Lemon Squeezy.

## Flusso Utente (Funnel)

```
YouTube Video (link in descrizione)
    │
    ▼
Landing Page (i18n) ──── Prezzo localizzato
    │
    ▼
LS Checkout ──── Valuta + Tasse automatiche (MoR)
    │
    ▼
Webhook LS → ProcessedWebhook reservation
    │
    ▼
CompletePaidOrderCommand
    │
    ▼
Transaction: Order + AccessGrant + 4 OutboxEvent
    │
    ├── Outbox registry → email / analytics / notification / recovery
    │       └── email: OutboxDeliveryAttempt(event, channel=email)
    │
    ▼
AccessGate (active AccessGrant) ──── Accesso corsi, PDF, download
```

## Flusso Contenuto (Creator)

```
Crea Product (template picker: lumio | h612 | horizon | book-claude | amish; "default" è il fallback dell'orchestratore quando `data.template` non è riconosciuto)
    │
    ▼
Aggiungi Lesson + LessonTranslation (per lingua)
    │
    ▼
Carica PDF/Audio (per lingua) → LessonAsset
    │
    ▼
Compila ProductTranslation (titolo, storia, problema, cta, recensioni, ui_all)
    │
    ▼
extract-locales.ts → `courses/<slug>/locales/<locale>.json` (build artifact, ADR-0011 canonical)
    │
    ▼
Pubblica ──── generateCourseConfig(slug) → CourseConfigCache DB row
                              ↓
                     Pagina pubblica renderizzata dal template selezionato
```

## Note operative

- **Dev server**: `npm run dev` (Next.js alone — la real-time chat passa via SSE in `/api/conversations/[id]/stream`, polling server-driven interno al route handler). Vedi `docs/production.md` per la topologia di produzione.
  - **Edge proxy (Next.js 16+)**: il file convenzione globale è `src/proxy.ts` che esporta la funzione `proxy` (era `middleware` in Next.js ≤15). `config.matcher` invariato. `updateSession` da `@/lib/supabase/middleware` (helper internal, NON rinominato) continua a girare come Step 1 della catena: `proxy → updateSession (Supabase session refresh) → checkProtectedAccess → handleFullLocale → handleShortLang → handleLangParam → handleRootLocale → handleNoPrefix → fallback response`. Il vecchio `src/middleware.ts` è stato rimosso (deprecation Next 16).
- **Typecheck + lint**: `npm run check` (typecheck + eslint + vitest). È un controllo locale: la readiness della release richiede anche una run GitHub Actions verde sul commit candidato.
- **Release verification:** l'ultima verifica locale del candidato `c2e0f87` ha superato typecheck, lint, unit test, quality gate, build, audit dipendenze, migration safety scan e deploy-gate shape; integration PostgreSQL, migration deploy reale, audit database, E2E/SSE e Gitleaks non sono stati completati. Vedi `docs/roadmap-current.md` e `DEPLOY-CHECKLIST.md` per lo stato evidence-based.
- **DB locale**: `docker compose up -d db redis` (Postgres 16 + Redis). Lo stack include `pgbackups` per i backup automatici (PITR per Supabase prod). Senza il daemon Docker attivo non dichiarare superati i gate che richiedono PostgreSQL/Redis.

## Architecture Decision Records (cross-cutting)

ADRs che attraversano più domini del codebase (`commerce/*` × `access/*` × webhook reliability) e quindi non trovano posto naturale nei singoli file di `docs/adr/`. Riferimento rapido:

- [`docs/architecture/001-db-migrations.md`](./docs/architecture/001-db-migrations.md) — **Migration policy**. Vincola `Order` / `AccessGrant` / `ProcessedWebhook` / `Product` / `User` (colonne lette/scritte dal LS webhook processor di Lemon Squeezy). Fino a v2: SOLO additive changes (`DROP`/`RENAME` vietati sullo strict-addictive zone); ogni nuova colonna non-null deve avere `@default(...)` esplicito o essere nullable per almeno una release.
