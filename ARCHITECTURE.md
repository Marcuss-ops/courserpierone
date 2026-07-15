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
- **Content source of truth**: `ProductTranslation` (DB) + `data/<slug>/<locale>.json` (derived build artifact via `extract-locales.ts`). Vedi `docs/content-source-map.md` per la matrice completa e `docs/adr/0009-content-source-canonical.md` per il design canonical.

### 3. Checkout & Pagamenti (LS-only)

- **Lemon Squeezy**: Merchant of Record unico. Gestisce checkout hosted, valuta, tasse (VAT/sales tax) e fatturazione.
- **Webhook → Order**: `src/app/api/webhooks/lemonsqueezy/route.ts` riceve `order_created` + `subscription_*` events, scrive `Order` row + `AccessGrant` row (MCR Phase 2).
- **Variant ID**: `Product.lemonVariantId` è il campo canonico per il checkout Lemon Squeezy.
- **Valuta dinamica**: Rilevamento automatico dal browser/posizione utente (`src/lib/i18n/locale-resolver.ts`) → `Product.pricesByCurrency` lookup → override per paese (`Product.countryOverrides`).
- **Consegna automatica**: Webhook LS → `processOrder` happy path → `AccessGrant.status='active'` → `AccessGate` autorizza accesso al contenuto.

### 4. Accesso & Utenti

- **Auth**: Supabase Auth (Google OAuth + Magic Link). Vedi `docs/OAUTH-SETUP.md` per il setup.
- **Ruoli**: `admin`, `creator`, `student` (string columns, check inline in route handlers).
- **MCR Phase 2 (canonical)**: `AccessGrant` table è la single source of truth per "l'utente X ha accesso al prodotto Y". Sostituisce i direct reads su `Order.status='completed'` (legacy path, gated by `USE_ACCESS_GRANT_RESOLVER` env flag).
- **Dashboard utente**: Lista acquisti, download PDF, progresso corsi
- **Area admin**: Gestione prodotti, ordini, utenti (in `src/app/admin/*`)

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
Webhook LS → processOrder
    │
    ▼
Email Benvenuto + Credenziali Supabase
    │
    ▼
AccessGate (AccessGrant check) ──── Accesso corsi, PDF, download
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
extract-locales.ts → data/<slug>/<locale>.json (build artifact)
    │
    ▼
Pubblica ──── generateCourseConfig(slug) → CourseConfigCache DB row
                              ↓
                     Pagina pubblica renderizzata dal template selezionato
```

## Note operative

- **Dev server**: `npm run dev` (Next.js alone — la real-time chat passa via SSE in `/api/conversations/[id]/stream`, polling server-driven interno al route handler). Vedi `docs/production.md` per la topologia di produzione.
  - **Edge proxy (Next.js 16+)**: il file convenzione globale è `src/proxy.ts` che esporta la funzione `proxy` (era `middleware` in Next.js ≤15). `config.matcher` invariato. `updateSession` da `@/lib/supabase/middleware` (helper internal, NON rinominato) continua a girare come Step 1 della catena: `proxy → updateSession (Supabase session refresh) → checkProtectedAccess → handleFullLocale → handleShortLang → handleLangParam → handleRootLocale → handleNoPrefix → fallback response`. Il vecchio `src/middleware.ts` è stato rimosso (deprecation Next 16).
- **Typecheck + lint**: `npm run check` (typecheck + eslint + vitest). Vedi `docs/roadmap-current.md` §1.5 per il baseline degli errori pre-esistenti.
- **DB locale**: `docker compose up -d db redis` (Postgres 16 + Redis). Lo stack include `pgbackups` per i backup automatici (PITR per Supabase prod).
