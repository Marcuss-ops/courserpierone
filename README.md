# Courser

Piattaforma globale per la vendita di corsi e libri digitali multilingua.
Trasforma il traffico YouTube in prodotti digitali localizzati con template,
analytics, protezione accessi e gestione progressi.

---

## Requisiti

- Node.js 18+ (consigliato 20 LTS)
- npm, pnpm, o bun
- Database PostgreSQL (locale via Docker o remoto Supabase/Neon)
- Stripe account (per pagamenti)
- OpenAI API key (opzionale, per traduzioni automatiche)
- Google OAuth credentials (opzionale, per login con Google)

---

## Setup Rapido

```bash
# 1. Clona il repository
cd Courser

# 2. Installa le dipendenze
npm install

# 3. Copia le variabili d'ambiente e configurale
cp .env.example .env
# Ora modifica .env con i tuoi valori (vedi sezione sotto)

# 4. Crea il database e le tabelle
npx prisma db push
# Oppure per generare il client Prisma senza push:
# npx prisma generate

# 5. Avvia il server di sviluppo
npm run dev

# 6. Apri http://localhost:3000 nel browser
```

---

## Variabili d'Ambiente

Tutte le variabili sono documentate in `.env.example`. Ecco un riepilogo:

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `DATABASE_URL` | ✅ | URL di connessione PostgreSQL (pgBouncer-pooled, port 6543) |
| `DIRECT_URL` | ✅ | URL di connessione **direct** (port 5432, no pooler) per `prisma migrate deploy` |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | URL Supabase (Project Settings → API) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Anon key Supabase — esposta al client |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role Supabase — full privilege, server-only |
| `NEXT_PUBLIC_APP_URL` | ✅ | URL pubblico per link assoluti email/redirect |
| `LEMONSQUEEZY_API_KEY` | ✅ | Chiave API Lemon Squeezy (provider pagamenti primario) |
| `LEMONSQUEEZY_STORE_ID` | ✅ | Store ID Lemon Squeezy |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | ✅ | Segreto webhook Lemon Squeezy |
| `STRIPE_SECRET_KEY` | ❌ | Chiave segreta Stripe (legacy — solo per ordini storici da drainare) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ❌ | Chiave pubblicabile Stripe (legacy) |
| `STRIPE_WEBHOOK_SECRET` | ❌ | Segreto webhook Stripe (legacy) |
| `OPENAI_API_KEY` | ❌ | Solo per traduzioni automatiche |
| `GOOGLE_CLIENT_ID` | ❌ | Solo per login con Google |
| `GOOGLE_CLIENT_SECRET` | ❌ | Solo per login con Google |
| `EMAIL_SERVER_HOST` | ❌ | SMTP host (email transazionali) |
| `EMAIL_SERVER_PORT` | ❌ | SMTP port |
| `EMAIL_SERVER_USER` | ❌ | SMTP username |
| `EMAIL_SERVER_PASSWORD` | ❌ | SMTP password |
| `EMAIL_FROM` | ❌ | Indirizzo mittente email |
| `SUPABASE_URL` | ❌ | Solo per Supabase storage |
| `SUPABASE_ANON_KEY` | ❌ | Solo per Supabase storage |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ | Solo per Supabase storage |

> **Nota**: Le variabili contrassegnate con ❌ sono opzionali.
> Se non configurate, le funzionalità corrispondenti vengono disabilitate
> senza crash (OpenAI, Google OAuth, Supabase, email).

---

## Database

### Locale con Docker

```bash
docker run --name courser-db -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=courser -p 5432:5432 -d postgres:16-alpine
```

Poi imposta `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/courser`
nel tuo `.env`.

### Remoto (Supabase / Neon)

1. Crea un account su [supabase.com](https://supabase.com) o [neon.tech](https://neon.tech)
2. Crea un nuovo progetto e copia la connection string
3. Aggiorna `DATABASE_URL` nel `.env`

---

## Pagamenti (Lemon Squeezy primario, Stripe legacy)

Il sistema supporta **due provider**, con **Lemon Squeezy come primario** in V1.x e **Stripe come legacy** solo per ordini storici da drainare. Vedi `scripts/audit-v1-readiness.ts` per il gate `activeStripeOrders`.

### Lemon Squeezy (primario)

1. Crea un account su [lemonsqueezy.com](https://lemonsqueezy.com)
2. Settings → API → copia `LEMONSQUEEZY_API_KEY`
3. Settings → Stores → copia lo `LEMONSQUEEZY_STORE_ID` del tuo store
4. Settings → Webhooks → crea un endpoint su `https://your-domain.com/api/webhooks/lemonsqueezy`, copia `LEMONSQUEEZY_WEBHOOK_SECRET`
5. Per ogni prodotto, crea una variante su Lemon Squeezy Dashboard e usa:
   - `lemonVariantId` (variante standard, multi-store derivata dallo store di default)
   - `lemonStoreId` opzionale per override (es. `countryOverrides` regionali)

### Stripe (legacy / dismissione pianificata)

Solo per ordini storici. La nuova pipeline di checkout **non genera più ordini Stripe** — il vecchio endpoint `/api/webhooks/stripe` resta attivo solo per processare pagamenti pre-migrazione.

Per il drain: refunda ordini attivi o migrali manualmente a Lemon Squeezy, poi rimuovi il codice dual-provider (Post-V1 V1.1).

---

## OpenAI (Traduzioni)

Se vuoi usare le traduzioni automatiche:

1. Vai su [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Crea una API key e impostala in `OPENAI_API_KEY`
3. Usa l'endpoint `/api/translate` dal pannello admin

Se non configurata, la funzionalità di traduzione non sarà disponibile
ma l'app funziona comunque.

---

## Google OAuth (Login Social — via Supabase Auth)

L'OAuth Google è gestito interamente da **Supabase Auth** (non più NextAuth). La configurazione è in **2 posti**:

### 1. Google Cloud Console (chi sei)

1. Vai su [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. Crea OAuth Client ID (Web application)
3. **Authorized redirect URI**: `https://<your-project-ref>.supabase.co/auth/v1/callback` (NON più `/api/auth/callback/google`)
4. Copia Client ID + Client Secret

### 2. Supabase Dashboard (provider handover)

1. Authentication → Providers → Google → Enable
2. Incolla Client ID + Client Secret
3. Salva

Le env vars corrispondenti (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) vanno comunque nel `.env` per flessibilità di test locale; il client (browser) non le usa mai direttamente — passa sempre tramite Supabase come intermediario. Maggiori info in `.env.example` → sezione `─── Google OAuth ───`.

---

## Email (Transazionali)

Il sistema email transazionale usa SMTP.
Se non configuri SMTP, le email vengono loggate nei log del terminale (utile in dev).

Provider consigliati:

| Provider | Host | Port |
|---|---|---|
| **Gmail SMTP** | `smtp.gmail.com` | 587 |
| **SendGrid** | `smtp.sendgrid.net` | 587 |
| **Mailgun** | `smtp.mailgun.org` | 587 |
| **Resend** | `smtp.resend.com` | 587 |

---

## Architettura del Progetto

```
Courser/
├── prisma/                  # Schema DB e migration
│   └── schema.prisma
├── public/
│   └── courses/             # Config JSON dei corsi
│       └── [slug]/
│           └── config.json
├── src/
│   ├── app/
│   │   ├── admin/           # Dashboard admin
│   │   │   ├── page.tsx     # Statistiche e overview
│   │   │   └── products/    # Gestione prodotti
│   │   ├── api/             # API route handlers
│   │   ├── login/           # Pagine di login
│   │   └── [domain]/        # Landing page pubblico
│   ├── components/
│   │   ├── access/          # Access gate component
│   │   ├── admin/           # Admin UI components
│   │   ├── course/          # Analytics, progress, CTA
│   │   └── funnel/          # Template landing (lumio, h612, horizon)
│   ├── hooks/               # React hooks
│   └── lib/                 # Utility, Stripe, Auth, DB
└── docs/                   # Documentazione corrente + archivio historical
```

---

## Comandi Principali

| Comando | Descrizione |
|---|---|
| `npm run dev` | Avvia il server di sviluppo |
| `npm run build` | Build di produzione |
| `npm start` | Avvia il server di produzione |
| `npx prisma db push` | Sincronizza lo schema col DB |
| `npx prisma studio` | Apri il browser per i dati del DB |
| `npx prisma generate` | Rigenera il client Prisma |
| `npx prisma migrate dev` | Crea una migration |

---

## Documentazione

- [MISSION.md](MISSION.md) — Bussola strategica del progetto
- [ARCHITECTURE.md](ARCHITECTURE.md) — Architettura tecnica
- [docs/roadmap-current.md](docs/roadmap-current.md) — Roadmap: V1 blockers + Post-V1 + Tech debt + Out-of-scope
- [docs/archive/MVP-SPEC-initial.md](docs/archive/MVP-SPEC-initial.md) — Specifica MVP legacy (archiviato, pre-Supabase + post-V1)
- [docs/production.md](docs/production.md) — Deployment + audit + cron runbook

---

## Creare il Primo Corso

### 1. Crea un prodotto su Lemon Squeezy (provider primario)

1. Vai su [app.lemonsqueezy.com](https://app.lemonsqueezy.com) → Stores → Products → "New product"
2. Compila: nome, prezzo (es. 29.00 EUR), tipo "One-time payment"
3. Salva e copia il **Variant ID** (es. `123456`)
4. (Opzionale se multi-store) copia anche lo Store ID per override

> **Stripe legacy**: per drenare ordini storici, vedi [docs/audit-v1-readiness.md](docs/production.md#audit) — `scripts/audit-v1-readiness.ts` riporta `activeStripeOrders > 0` da migrare prima del V1 GA.

### 2. Crea il corso dal pannello Admin

1. Vai su **`/admin/products/new`**
2. Compila i campi:
   - **Slug** — identificatore unico (es. `fotografia-pro`). Diventerà l'URL del corso
   - **Nome / Prezzo / Valuta**
   - **Cover URL** — immagine di copertina (Unsplash, Supabase, o URL pubblico)
   - **Template** — scegli il layout della landing page (`lumio`, `h612`, `horizon`)
3. Clicca **Salva**

### 3. Aggiungi le lezioni

Nella pagina di modifica del corso:

1. **Titolo / Sottotitolo / CTA** — testi della landing page
2. **Problema / Storia / Recensioni** — sezioni persuasive
3. **Lezioni** — per ogni lezione:
   - Titolo (IT e EN)
   - Descrizione
   - Link YouTube (embed URL, es. `https://www.youtube.com/embed/...`)
   - Durata (es. `12:30`)

### 4. Genera il config.json

Clicca **"Genera config.json"** nella pagina di modifica.
Il file viene creato in `public/courses/[slug]/config.json` e letto automaticamente
alla landing page.

### 5. Testa il corso

Apri `http://localhost:3000/[slug]` — vedrai la landing page completa con
il template selezionato, le lezioni e il pulsante di acquisto.

> **Hands-free**: Puoi anche creare il `config.json` a mano in
> `public/courses/[slug]/config.json`. Vedi `public/courses/fotografia-pro/config.json`
> come esempio.

---

## Prisma: db push vs Migrations

| Comando | Quando usarlo |
|---|---|
| `npx prisma db push` | Sviluppo rapido — sincronizza lo schema direttamente col DB senza creare migration files |
| `npx prisma migrate dev` | Produzione — crea file di migration versionati in `prisma/migrations/` |
| `npx prisma migrate deploy` | Deploy — applica le migration in produzione |

**Regola pratica:**
- In locale per sviluppo veloce → `db push`
- Quando collabori in team o fai deploy → `migrate dev` + `migrate deploy`
- Dopo aver modificato `schema.prisma`, rigenera sempre il client:
  `npx prisma generate`

---

## ⚠️ Database Migrations (Vercel + Supabase)

**Regola critica**: NON aggiungere `"postbuild": "prisma migrate deploy"` in `package.json`.

Se lo fai, ogni build su Vercel resterà **infinite in "Building"** senza errori e senza log.
Poi dovrai cancellare il deploy stuck con `vercel rm <full-url> --yes` e ritriggerare.

### Perché

Vercel esegue i build su infrastruttura **IPv4-only**. Supabase ha disabilitato
IPv4 sulle connessioni dirette free-tier — l'host che Prisma usa di default
è ora IPv6. Quando `prisma migrate deploy` parte in `postbuild`, il TCP
handshake verso Supabase viene scartato silenziosamente → **TCP hang →
build apparentemente attivo per ore senza progresso**.

### Workflow corretto

**Prima di ogni push che include modifiche a `prisma/schema.prisma`:**

1. **Localmente** (la tua macchina ha sia IPv4 che IPv6 → funziona):
   ```bash
   npx prisma migrate dev --name <nome_descrittivo>
   # crea prisma/migrations/<timestamp>_<nome>/migration.sql
   npx prisma migrate deploy
   # applica al DB production usando il tuo DATABASE_URL locale
   ```
2. **Poi** committa e pusha normalmente:
   ```bash
   git add prisma/
   git commit -m "feat(db): <descrizione>"
   git push
   ```
3. Vercel triggera il deploy **senza** applicare migrations
   (`postbuild` non esiste più in `package.json`).

### Alternativa (futuro): GitHub Actions

Per automatizzare le migrations in CI:

- Crea `.github/workflows/db-migrate.yml`
- I runner GitHub Actions hanno IPv6 → possono raggiungere Supabase
- Step: `npx prisma migrate deploy` con `DATABASE_URL` da GitHub Secrets

### ⚠️ Pro tip: `DATABASE_URL` deve puntare al DB di produzione

Per applicare le migrations al DB di **produzione**, il `DATABASE_URL` nel
tuo `.env` locale deve puntare al DB remoto (Supabase / Neon / altro)
**e non a localhost**. Altrimenti `migrate deploy` applica al DB sbagliato.

Usa la string di connessione **direct** (porta `5432`) con un URL
IPv4-capable dal progetto Supabase. I **pooler (porta `6543`)** non
supportano `migrate deploy` — Prisma ha bisogno di lock e session
features che PgBouncer in transaction-mode non espone.

### TL;DR

| Step | Comando |
|---|---|
| Modifica schema | edit `prisma/schema.prisma` |
| Crea migration | localmente: `npx prisma migrate dev --name <name>` |
| Applica a prod | localmente: `npx prisma migrate deploy` |
| Push codice | `git add . && git commit && git push` |
| Build Vercel | solo build (no migrations) |

---

## Next.js Image Domains

Le immagini remote caricate con il componente `next/image`
devono essere autorizzate in `next.config.mjs`:

```js
// next.config.mjs
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "images.unsplash.com" },
      // Aggiungi qui il tuo CDN:
      // { protocol: "https", hostname: "mio-cdn.com" },
    ],
  },
};
```

Se vedi errori `hostname not configured` nel browser,
aggiungi il dominio mancante in `remotePatterns`.

---

## Troubleshooting

### "PrismaClientInitializationError: PrismaClient is not configured"

```bash
# Rigenera il client Prisma
npx prisma generate
# E/o sincronizza lo schema col DB
npx prisma db push
```

### "Stripe is not defined" / "OpenAI is not defined"

Probabilmente le env non sono impostate. Entrambe usano ora **lazy initialization**
— se la chiave è assente, la funzione `getStripe()` o `getOpenAI()` restituisce `null`
invece di crashare. Ma se serve la funzionalità, imposta le variabili.

### Webhook Stripe non arriva

```bash
# Assicurati che Stripe CLI sia in ascolto:
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Controlla che STRIPE_WEBHOOK_SECRET in .env corrisponda
# al segreto che Stripe CLI stampa al primo avvio
```

### Email transazionali non funzionano

- `NEXT_PUBLIC_APP_URL` deve essere impostato (anche a `http://localhost:3000`)
- Se `EMAIL_SERVER_HOST` non è configurato, le email vengono loggate nei log
  del terminale invece che spedite (utile per debug locale)

### Build fallisce con errori TypeScript

```bash
# Controlla gli errori specifici
npx next build 2>&1 | grep -i "error"

# Spesso è un'import mancante o un tipo sbagliato
# I comandi più utili per fixare:
npm install          # reinstalla le dipendenze
npx prisma generate  # rigenera i tipi Prisma
```

### "Non riesco a vedere il corso dopo l'acquisto"

1. Vai su `/login` e accedi con Google
2. Verifica che l'email dell'ordine corrisponda a quella del login
3. Dopo il login vieni reindirizzato al corso acquistato
4. Se l'accesso non si attiva, controlla i webhook del provider di pagamento

---

## Strumenti e Operazioni per Agenti AI (Agent Developer Guide)

Courser include una suite completa di script e pipeline automatizzate utilizzate dagli agenti AI per tradurre, validare, rigenerare e deployare i funnel in pochi secondi.

### 1. Traduzione Automatica Offline (Argos Translate)
Per tradurre una landing page dall'inglese a tutte o alcune delle 49+ lingue supportate:
```bash
# Traduci in tutte le lingue disponibili
python scripts/translate/translate-argos.py amish-secrets all

# Traduci solo in alcune lingue specifiche
python scripts/translate/translate-argos.py amish-secrets de fr es pt

# Forza la sovrascrittura di tutte le traduzioni esistenti (ignora il merge intelligente)
python scripts/translate/translate-argos.py --force amish-secrets all
```
*Nota*: Non utilizzare `extract-locales.ts` a meno che non si vogliano rigenerare i template da zero (sovrascriverebbe i testi custom come l'autore e le bio personalizzate).

### 2. Validazione dei File di Lingua (Locales Validation)
Prima di ogni build, è fondamentale validare che tutti i file JSON delle traduzioni contengano esattamente le stesse chiavi del file di riferimento inglese (`en.json`):
```bash
# Esegui la validazione per un corso specifico
npm run validate:locales
# Oppure direttamente via script:
npx tsx scripts/validate/validate-locales.ts amish-secrets
```

### 3. Rigenerazione del Locale Resolver
Se vengono modificate le localizzazioni del database o le regole di instradamento geografico, rigenera il resolver statico:
```bash
npm run generate:locales
# Oppure direttamente via script:
npx tsx scripts/generate/generate-locale-resolver.ts
```

### 4. Controllo di Qualità e Typecheck
Sempre prima di un deploy, verifica che non ci siano errori di compilazione TypeScript o test falliti:
```bash
# Esegui il controllo dei tipi statico
npm run typecheck

# Esegui la suite di test unitari e di integrazione (Vitest)
npm run test
```

### 5. Deploy Vercel (Produzione)
Il deploy in produzione viene fatto direttamente tramite la CLI di Vercel:
```bash
npx vercel --prod
```

---

## Documentazione Allegata

- [MISSION.md](MISSION.md) — Bussola strategica del progetto
- [ARCHITECTURE.md](ARCHITECTURE.md) — Architettura tecnica
- [docs/roadmap-current.md](docs/roadmap-current.md) — Roadmap canonica (V1 blockers + Post-V1 + Tech debt + Out-of-scope)
- [docs/archive/MVP-SPEC-initial.md](docs/archive/MVP-SPEC-initial.md) — Specifica MVP legacy (archiviato)
- [docs/production.md](docs/production.md) — Deployment + audit + cron runbook

