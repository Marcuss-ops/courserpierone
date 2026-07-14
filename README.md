# Courser

> **V1.x status:** Pre-GA. Vedi [docs/roadmap-current.md](docs/roadmap-current.md) per V1 blockers + post-V1 + tech debt.

Piattaforma globale per la vendita di corsi e libri digitali multilingua.
Trasforma il traffico YouTube in prodotti digitali localizzati con template,
analytics, protezione accessi e gestione progressi.

**Stack V1.x:** Next.js 16 · React 19 · Supabase · REST · Lemon Squeezy · Tailwind 4. Dettagli in [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Requisiti

- **Node.js 20 LTS**
- **PostgreSQL 15+** (Supabase, Neon, o locale via Docker)
- **Account Supabase** (Auth + Postgres + Storage)
- **Account Lemon Squeezy** (provider pagamenti unico in V1.x)
- **OpenAI API key** (opzionale, per traduzioni automatiche)
- **Account SMTP** (opzionale, per email transazionali)

> ⚠️ **V1.x status (2026-07-15):** LS-only per i nuovi ordini dal commit `a0e511e` (C1g: legacy Stripe provider module rimosso) + `4242f18` (C2a: env registry cleaned — `ENABLE_STRIPE_CHECKOUT`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `GOOGLE_CLIENT_ID/SECRET` rimossi, Vercel + `.env.example` svuotati). Stripe residuo: `stripe@^22.2.0` in package.json + webhook `src/app/api/webhooks/stripe/` + campi Prisma legacy (`Order.stripeSessionId`, `Order.stripeSubscriptionId`, `Product.stripePriceId`) + e2e test (`tests/e2e/checkout.stripe.spec.ts`) — **tutti richiesti dal drain legacy** finché `activeStripeOrders === 0` ([V1 blocker, roadmap §1.2](docs/roadmap-current.md#12-active-stripe-orders)). Solo `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` restano required, e SOLO dal webhook handler per refund/dispute. Fase 8 (post‑V1) rimuove definitivamente webhook + DB columns + npm package.

---

## Setup Rapido

```bash
# 1. Clona il repository
git clone <repo-url> courser && cd courser

# 2. Installa le dipendenze
npm install

# 3. Copia e configura le env
cp .env.example .env
# Modifica .env con i tuoi valori (sezione sotto)

# 4. Applica le migration al DB
npx prisma migrate deploy

# 5. Avvia il dev server
npm run dev
# → http://localhost:3000
```

---

## Variabili d'Ambiente

Riepilogo (`.env.example` contiene i default completi):

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL pooled (Supabase pgBouncer, port 6543) |
| `DIRECT_URL` | ✅ | PostgreSQL direct (port 5432, per `prisma migrate deploy`) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL progetto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Anon key Supabase (client-safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role key (server-only, full privilege) |
| `NEXT_PUBLIC_APP_URL` | ✅ | URL pubblico per link email/redirect assoluti |
| `LEMONSQUEEZY_API_KEY` | ✅ | Lemon Squeezy API key |
| `LEMONSQUEEZY_STORE_ID` | ✅ | Lemon Squeezy Store ID |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | ✅ | Webhook secret LS |
| `OPENAI_API_KEY` | ❌ | Traduzioni automatiche (opzionale) |
| `EMAIL_SERVER_HOST` / `EMAIL_SERVER_PORT` / `EMAIL_SERVER_USER` / `EMAIL_SERVER_PASSWORD` / `EMAIL_FROM` | ❌ | Required per send email — vedi sezione "Email (Transazionali)" sotto |

Senza Stripe env client-side (V1.x rimuove): solo `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` restano richiesti dalla drain legacy (webhook-only). Senza NextAuth env: nessuna (Supabase Auth non le richiede).

---

## Database

### Supabase (consigliato per produzione)

1. Crea progetto su [supabase.com](https://supabase.com)
2. Project Settings → Database → copia `Connection string` (pooled, port 6543) e `Direct connection` (port 5432)
3. Imposta `DATABASE_URL` (pooled) e `DIRECT_URL` (direct) in `.env`
4. `npx prisma migrate deploy`

### Docker locale (dev)

```bash
docker run --name courser-db -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=courser -p 5432:5432 -d postgres:16-alpine
```

Poi `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/courser` in `.env`.

---

## Auth (Supabase)

Auth gestita interamente da **Supabase Auth**. Niente NextAuth.

- **Magic Link** — funziona out-of-the-box, nessuna config
- **Google OAuth** (opzionale) — vedi sezione sotto

### Google OAuth setup

1. **Google Cloud Console** — [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
   - Crea OAuth Client ID (Web application)
   - **Authorized redirect URI**: `https://<your-project-ref>.supabase.co/auth/v1/callback`
     ⚠️ NON `/api/auth/callback/google` (è il pattern NextAuth, non più usato)
2. **Supabase Dashboard** — Authentication → Providers → Google → Enable
   - Incolla Client ID + Client Secret da Google Cloud Console
   - Salva
3. Google OAuth credentials (Client ID + Secret) vivono **solo nella dashboard Supabase** del progetto. Non servono come env Vercel — il flusso OAuth è gestito interamente da Supabase Auth.

---

## Pagamenti (Lemon Squeezy)

**Canonical V1.x:** Lemon Squeezy come Merchant of Record (target: unico provider, gestisce pagamenti + tasse + fatture). **Legacy da drainare:** Stripe (`stripe@^22.2.0` ancora in package.json, webhook route, campi Prisma, e2e test, 5+ lingue di legal i18n). Vedi Fase 8 in [roadmap §1.2](docs/roadmap-current.md) per il piano di rimozione completa.

1. Crea account su [lemonsqueezy.com](https://lemonsqueezy.com)
2. Settings → API → copia `LEMONSQUEEZY_API_KEY`
3. Settings → Stores → copia `LEMONSQUEEZY_STORE_ID`
4. Settings → Webhooks → crea endpoint `https://your-domain.com/api/webhooks/lemonsqueezy`, copia `LEMONSQUEEZY_WEBHOOK_SECRET`
5. Per ogni prodotto: crea una variante su LS Dashboard e copia il `Variant ID` nel campo `Product.lemonVariantId` (vedi admin panel)

---

## Email (Transazionali)

SMTP via Nodemailer. Provider consigliati:

| Provider | Host | Port |
|---|---|---|
| Gmail SMTP | `smtp.gmail.com` | 587 |
| Resend | `smtp.resend.com` | 587 |
| SendGrid | `smtp.sendgrid.net` | 587 |
| Mailgun | `smtp.mailgun.org` | 587 |

Senza SMTP configurato: le email vengono loggate in stdout (utile in dev).

---

## OpenAI (Traduzioni, opzionale)

Se vuoi le traduzioni automatiche:

1. Crea API key su [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Imposta in `OPENAI_API_KEY`
3. Usa `/api/translate` dal pannello admin

Senza: la traduzione manuale funziona comunque (upload JSON per lingua).

---

## Architettura

Dettaglio completo in [ARCHITECTURE.md](ARCHITECTURE.md). Stack V1.x: Next.js 16 + React 19 + Supabase + REST + Lemon Squeezy + Tailwind 4.

```
courser/
├── prisma/
│   ├── schema.prisma
│   └── migrations/         # versionate (migrate dev → migrate deploy)
├── src/
│   ├── app/
│   │   ├── admin/                 # dashboard admin (prodotti, ordini, utenti)
│   │   ├── api/                   # REST (Next.js Route Handlers)
│   │   │   ├── conversations/     # DM canonici (POST/GET/PATCH/stream)
│   │   │   ├── webhooks/lemonsqueezy/  # solo LS (Stripe rimosso)
│   │   │   ├── checkout/
│   │   │   ├── progress/
│   │   │   └── ...
│   │   ├── dashboard/             # area utente (studenti + creator)
│   │   │   ├── messages/          # inbox studente
│   │   │   └── creator/messages/  # inbox creator
│   │   ├── login/                 # Supabase Auth UI
│   │   └── privacy/               # legal pages
│   ├── components/
│   │   ├── chat/                  # ChatView canonico (conversationId-based)
│   │   ├── layout/                # InboxProvider, ecc.
│   │   ├── course/                # access-gate, player wrapper
│   │   └── ...
│   ├── lib/
│   │   ├── db/                    # Prisma client singleton
│    │   ├── messaging/             # permission resolver, find-or-create conversation
│   │   ├── payment/               # Lemon Squeezy client
│   │   ├── supabase/              # server client, get-user
│   │   └── i18n/                  # use-chat-t, locale resolver
│   └── ...
├── public/
│   └── courses/                   # solo assets statici (no config.json in V1.x)
├── docs/
│   ├── roadmap-current.md         # V1 blockers + post-V1 + tech debt
│   ├── production.md              # runbook (deploy, audit, cron, PITR)
│   └── archive/                   # historical docs
├── scripts/
│   ├── audit-v1-readiness.ts      # gate V1 blockers
│   ├── diagnose-messaging-extended.ts
│   ├── products/                  # backfill-primary-creator, sync, generate
│   ├── translate/                 # Argos translation pipeline
│   ├── validate/                  # validate-locales
│   └── generate/                  # generate-locale-resolver
├── tests/
│   └── e2e/                       # playwright (unit/integration vitest sono colocati in src/**/*.test.ts)
└── ARCHITECTURE.md                # architettura canonica
```

---

## Comandi Principali

| Comando | Descrizione |
|---|---|
| `npm run dev` | Dev server (Next.js 16) |
| `npm run build` | Build produzione (prisma generate + validate:locales + generate:locales + next build) |
| `npm start` | Server produzione (Next.js) |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run lint` | ESLint (read-only) |
| `npm run lint:fix` | ESLint con autofix |
| `npm run test` | Vitest unit + integration |
| `npm run test:e2e` | Playwright E2E |
| `npm run check` | typecheck + lint + test (quality gate) |
| `npm run check:messaging` | Diagnostica DMs (`scripts/diagnose-messaging-extended.ts`) |
| `npm run validate:locales` | Validazione i18n JSON |
| `npm run generate:locales` | Rigenera locale resolver statico |
| `npx prisma migrate dev --name <n>` | Crea migration (locale) |
| `npx prisma migrate deploy` | Applica migration (DB prod) |
| `npx prisma studio` | GUI ispezione DB |
| `npx tsx scripts/audit-v1-readiness.ts` | Verifica V1 blockers |

---

## Documentazione

- [MISSION.md](MISSION.md) — Bussola strategica del progetto
- [ARCHITECTURE.md](ARCHITECTURE.md) — Architettura tecnica + V1 stack
- [docs/roadmap-current.md](docs/roadmap-current.md) — V1 blockers + post-V1 + tech debt + out-of-scope
- [docs/production.md](docs/production.md) — Runbook: deploy, audit, cron, PITR
- [docs/i18n-coverage.md](docs/i18n-coverage.md) — Copertura i18n per corso
- [docs/content-source-map.md](docs/content-source-map.md) — Mappa sorgenti contenuti (Fase 9)
- [docs/v1-acceptance-test.md](docs/v1-acceptance-test.md) — Acceptance test V1
- [docs/archive/MVP-SPEC-initial.md](docs/archive/MVP-SPEC-initial.md) — Specifica MVP legacy (archiviata, pre-Supabase)

---

## Creare il Primo Corso

1. **Crea una variante su Lemon Squeezy** (vedi sezione Pagamenti sopra). Copia il `Variant ID`.
2. **Vai su `/admin/products/new`** e compila:
   - Slug (URL pubblico, es. `fotografia-pro`)
   - Nome, prezzo, valuta
   - Cover URL (Supabase Storage, Unsplash, o URL pubblico)
   - Template (`lumio`, `h612`, `horizon`)
3. **Incolla il `lemonVariantId`** dalla variante LS
4. **Aggiungi le lezioni** dalla pagina di modifica (titolo per lingua, video YouTube embed)
5. **Pubblica**: lo status passa a `published` e la landing è raggiungibile su `/{locale}/{slug}`

Le traduzioni si gestiscono via:
- **Manuale**: JSON file in `data/<slug>/<locale>.json` (template-driven)
- **Automatica**: `python scripts/translate/translate-argos.py <slug> all`

---

## Prisma: workflow migrations

V1.x richiede **migration versionate** (no `db push` per audit trail).

| Step | Comando |
|---|---|
| Modifica schema | edit `prisma/schema.prisma` |
| Crea migration (locale) | `npx prisma migrate dev --name <name>` |
| Applica a prod (manualmente) | `npx prisma migrate deploy` (con `DIRECT_URL` del DB prod) |
| Push codice | `git add . && git commit && git push` |
| Build Vercel | solo build, **MAI** `migrate deploy` in `postbuild` |

### ⚠️ Vercel + Supabase: IPv4 vs IPv6

Vercel build infrastructure è **IPv4-only**. Supabase ha disabilitato IPv4 sulle connessioni dirette free-tier. Se aggiungi `"postbuild": "prisma migrate deploy"`, ogni build su Vercel resterà **infinite in "Building"** senza errori e senza log. Workaround: applica le migration **localmente** prima del push (Vedi workflow sopra). Dettagli in [docs/production.md](docs/production.md).

---

## Next.js Image Domains

Le immagini remote caricate con `next/image` vanno autorizzate in `next.config.mjs`:

```js
// next.config.mjs
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
      // Aggiungi qui il tuo CDN
    ],
  },
};
```

---

## Troubleshooting V1.x

### `npm run typecheck` fallisce con errori pre-esistenti

Vedi `docs/roadmap-current.md` §1.5 — backlog di errori typecheck da drenare per V1 GA.

### `prisma migrate deploy` non si connette a Supabase da Vercel

Vedi sezione "Vercel + Supabase" sopra. Workaround: applica migration localmente.

### Login con Google non funziona

Verifica che il **redirect URI** su Google Cloud Console sia:
`https://<your-project-ref>.supabase.co/auth/v1/callback`
(NON `/api/auth/callback/google` — è il pattern NextAuth, deprecato)

### Email transazionali non partono

- `NEXT_PUBLIC_APP_URL` deve essere impostato (anche `http://localhost:3000` in dev)
- Senza SMTP: le email sono loggate in stdout

### Webhook Lemon Squeezy non arriva

1. Verifica endpoint su LS Dashboard: `https://your-domain.com/api/webhooks/lemonsqueezy`
2. Verifica `LEMONSQUEEZY_WEBHOOK_SECRET` in `.env` corrisponda a quello mostrato da LS
3. In dev: usa [webhook.site](https://webhook.site) o un tunnel ngrok

### "Non riesco a vedere il corso dopo l'acquisto"

1. Login con la stessa email dell'ordine (Google o Magic Link)
2. Verifica che l'ordine sia `status='completed'`:
   ```bash
   npx tsx scripts/audit-v1-readiness.ts
   ```
3. Se l'ordine è pending: controlla che il webhook LS sia arrivato (sezione sopra)

### Active Stripe orders bloccano V1

`docs/roadmap-current.md` §1.2 — V1 blocker. Drenare prima del V1 GA:
- Refunda ordini Stripe attivi
- OPPURE migrali manualmente a Lemon Squeezy
- Poi rimuovi il codice dual-provider (Fase 8)

### Running E2E tests — fail-fast semantics

`npm run test:e2e` (che gira l'intera suite `tests/e2e/` via `playwright.config.ts: testDir`) include i 3 file LS-touching (`tests/e2e/checkout.ls.spec.ts`, `tests/e2e/refund.lemonsqueezy.spec.ts`, `tests/e2e/ls-webhook-customdata.spec.ts`) — sono questi 3 ad avere i guard differenziati. La differenza cruciale:

- **Env var LS mancanti** (`LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_WEBHOOK_SECRET`, `LEMONSQUEEZY_STORE_ID`, `TEST_LEMON_VARIANT_ID`) → **l'intero file LS fallisce a module-load** con `rc != 0` e messaggio `❌ Missing required Lemon Squeezy env vars: …` (da `tests/e2e/fixtures/ls-env-guard.ts:34-40`). Niente silent skip, niente `rc=0` falsi positivi. **Impostazione**: per ottenere le creds vedi [`scripts/ops/staging-bootstrap.md` §3.1](scripts/ops/staging-bootstrap.md#get-section-31).
- **Env var LS presenti ma prodotto DB-side senza `lemonVariantId`** (ovvero la riga `Product` con `slug = "test-course-e2e"` esiste ma ha `lemonVariantId = null`) → il singolo test salta con `test.skip(true, "TEST_LEMON_VARIANT_ID not configured on the seeded test product")`. **NO** module-load fail. Test adiacenti continuano a girare.

L'evidenza empirica (3 staged probe: env assenti / stub `DATABASE_URL` / direct `requireLsEnvVars()` invocation) è documentata in [`docs/ops/staging-run-log-2026-07-13.md`](docs/ops/staging-run-log-2026-07-13.md). La tabella pre-`0c91b77` vs post-`0c91b77` (il commit che ha introdotto `requireLsEnvVars()` al posto del vecchio `test.skip(!hasLsCreds, …)`) è inclusa.

---

## Strumenti per Agenti AI (Agent Developer Guide)

Pipeline automatizzate usate per tradurre, validare, rigenerare e deployare i funnel.

### Traduzione automatica (Argos)

```bash
# Traduci in tutte le lingue
python scripts/translate/translate-argos.py amish-secrets all

# Traduci solo in alcune lingue
python scripts/translate/translate-argos.py amish-secrets de fr es pt

# Forza sovrascrittura (ignora merge intelligente)
python scripts/translate/translate-argos.py --force amish-secrets all
```

### Validazione i18n

```bash
npm run validate:locales
# o mirato: npx tsx scripts/validate/validate-locales.ts <slug>
```

### Rigenerazione locale resolver

```bash
npm run generate:locales
# o: npx tsx scripts/generate/generate-locale-resolver.ts
```

### Quality gate pre-deploy

```bash
npm run check    # typecheck + lint + test
```

### Audit V1 readiness

```bash
npx tsx scripts/audit-v1-readiness.ts
# Verifica: orphanProducts=0, activeStripeOrders=0, NextAuth tables=0, typecheck=0, SSE test exists
```

### Diagnostica DMs

```bash
npm run check:messaging
# o: npx tsx scripts/diagnose-messaging-extended.ts
# Rileva re-introduzione accidentale di /api/messages (legacy)
```

### Deploy Vercel

```bash
npx vercel --prod
```

> ⚠️ **Mai** aggiungere `postbuild: "prisma migrate deploy"` in `package.json` (vedi sezione Prisma sopra).

---

## Custom Domain (production canonical URL)

Vercel produce automaticamente un dominio tipo `https://<team>-<project>.vercel.app` — **non usarlo** per documentazione, webhook LS, OAuth redirect URI, email link, o monitoring. Usa sempre un **custom domain** (es. `https://www.courssy.com`).

Vedi [docs/production.md §1.5](docs/production.md) per:
- Bug post-mortem del V1.0 cutover (LS webhook silenziosamente mismatchato)
- Checklist operatore per diagnosticare mismatch
- Procedura per aggiungere dominio custom in Vercel + DNS + cert auto
- Detection automatico in `scripts/ops/staging-env.sh` (emit `✓ NEXT_PUBLIC_APP_URL = ... (custom domain — stable)` o `⚠ ... (auto-vercel.app SUBdomain — fragile)`)
