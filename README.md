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
| `DATABASE_URL` | ✅ | URL di connessione PostgreSQL |
| `NEXTAUTH_SECRET` | ✅ | Segreto per firma sessioni (genera con `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | ✅ | URL base dell'app (es. `http://localhost:3000`) |
| `NEXT_PUBLIC_APP_URL` | ✅ | URL pubblico per link assoluti |
| `STRIPE_SECRET_KEY` | ✅ | Chiave segreta Stripe |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ | Chiave pubblicabile Stripe |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Segreto webhook Stripe |
| `OPENAI_API_KEY` | ❌ | Solo per traduzioni automatiche |
| `GOOGLE_CLIENT_ID` | ❌ | Solo per login con Google |
| `GOOGLE_CLIENT_SECRET` | ❌ | Solo per login con Google |
| `EMAIL_SERVER_HOST` | ❌ | SMTP host (solo magic link) |
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

## Stripe (Pagamenti)

1. Crea un account su [stripe.com](https://stripe.com)
2. Vai su Dashboard → Developers → API keys e copia le chiavi
3. Per i webhook in locale:

```bash
# Installa Stripe CLI: https://stripe.com/docs/stripe-cli
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Copia il whsec_... che appare nel terminale in STRIPE_WEBHOOK_SECRET
```

4. Crea un prodotto su Stripe Dashboard e usa il suo `price_id`
   nel config.json del corso.

---

## OpenAI (Traduzioni)

Se vuoi usare le traduzioni automatiche:

1. Vai su [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Crea una API key e impostala in `OPENAI_API_KEY`
3. Usa l'endpoint `/api/translate` dal pannello admin

Se non configurata, la funzionalità di traduzione non sarà disponibile
ma l'app funziona comunque.

---

## Google OAuth (Login Social)

1. Vai su [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. Crea un nuovo progetto → Abilita "Google OAuth 2.0"
3. Configura l'URI di redirect: `http://localhost:3000/api/auth/callback/google`
4. Copia Client ID e Client Secret nel `.env`

Se non configurato, gli utenti potranno comunque accedere via Magic Link.

---

## Email (Magic Link)

Il sistema di Magic Link usa SMTP per inviare le email.
Se non configuri SMTP, puoi testare la funzionalità mock controllando
il terminale: l'app stampa il link magico nei log.

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
└── _refs/                   # Riferimenti di design
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
- [ROADMAP.md](ROADMAP.md) — Piano di sviluppo per fasi
- [TECH-STACK.md](TECH-STACK.md) — Scelte tecnologiche
- [MVP-SPEC.md](MVP-SPEC.md) — Specifica dettagliata del MVP

---

## Creare il Primo Corso

### 1. Crea un prodotto su Stripe

```bash
# Vai su https://dashboard.stripe.com/products → "Aggiungi prodotto"
# Compila: nome, prezzo (es. 29.00 EUR), frequenza "Pagamento unico"
# Salva e copia il Price ID (es. price_1234567890abc)
```

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

### Magic Link non funziona

- `NEXT_PUBLIC_APP_URL` deve essere impostato (anche a `http://localhost:3000`)
- Se `EMAIL_SERVER_HOST` non è configurato, il magic link viene stampato
  nei log del terminale invece che spedito via email (utile per debug locale)
- Il link scade dopo 24 ore (modifica `expiresIn` in `src/app/api/magic-link/route.ts`)

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

1. Vai su `/login` e inserisci la tua email
2. Controlla il terminale per il magic link (se SMTP non configurato)
3. Clicca il link → vieni reindirizzato al corso
4. Il token ti dà accesso fino a che non lo usi (poi viene consumato)

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
- [ROADMAP.md](ROADMAP.md) — Piano di sviluppo per fasi
- [TECH-STACK.md](TECH-STACK.md) — Scelte tecnologiche
- [MVP-SPEC.md](MVP-SPEC.md) — Specifica dettagliata del MVP

