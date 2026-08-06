# 🚀 Deploy Checklist — Going Live on Production (V1.x)

> 🚫 **NON è il repo Velox.** Questo documento appartiene a **courserpierone / Courssy**
> (piattaforma corsi: Next.js + Supabase + Lemon Squeezy) — un progetto separato
> dalla render farm **Velox**. Per il deploy di Velox (`VeloxEditiingg`)
> vedi il file omonimo [`DEPLOY-CHECKLIST.md`](https://github.com/Marcuss-ops/VeloxEditiingg/blob/main/DEPLOY-CHECKLIST.md)
> (più [`ROADMAP.md`](https://github.com/Marcuss-ops/VeloxEditiingg/blob/main/ROADMAP.md) e
> [`FUTURE.md`](https://github.com/Marcuss-ops/VeloxEditiingg/blob/main/FUTURE.md)).

> **Status:** V1.x Pre-GA · Generated 2026-07-13 · Reference: see `README.md`, `OAUTH-SETUP.md`, `MISSION.md`, `ARCHITECTURE.md`
>
> Questo file è il playbook canonico per portare la piattaforma da 0% a 100% online (primo pagamento reale). Gli step 1-9 sono **bloccanti** — niente live senza. Gli step 10+ sono hardening post-launch.

---

## TL;DR — Sequenza operativa

```
DNS ──► Vercel env ──► Supabase setup ──► Google OAuth ──► Lemon Squeezy ──► SMTP ──► migrate ──► push ──► smoke test
```

**Tempo totale (utente sui dashboard)**: ~90 min
**Tempo totale (incluso KYC Lemon Squeezy)**: **2-3 giorni** (KYC review domina)

---

## 🚨 BLOCKER #1-9 — Senza non si va live

### #1 DNS · 5min · manuale

Nel tuo provider DNS (Cloudflare / Route53 / altri):
- Tipo `A` o `CNAME` per `www.courssy.com` → target Vercel (vedi `npx vercel domains inspect courssy.com`)
- Tipo `A` per root domain `courssy.com` → `76.76.21.21` (Vercel standard)
- **Attendere propagazione** (5-30 min)

```bash
# Verifica DNS resolution
nslookup www.courssy.com
# Output atteso: indirizzo Vercel
```

### #2 Vercel env vars · 30min · operativo

19 variabili in `production` via `npx vercel env add <KEY> production`:

| Variabile | Obbligatoria | Note |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL pooled (port 6543) |
| `DIRECT_URL` | ✅ | Direct connection (port 5432) per `prisma migrate deploy` |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Es. `https://xxxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Public anon JWT |
| `SUPABASE_URL` | ✅ | = NEXT_PUBLIC_SUPABASE_URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Service role secret |
| `NEXT_PUBLIC_APP_URL` | ✅ | `https://www.courssy.com` (NO trailing slash, NO localhost) |
| `LEMONSQUEEZY_API_KEY` | ✅ | Live key |
| `LEMONSQUEEZY_STORE_ID` | ✅ | Store UUID |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | ✅ | `openssl rand -hex 16` |
| `CHECKOUT_TOKEN_SECRET` | ✅ | `openssl rand -hex 32` — HMAC secret for one-time checkout sessions |

| `EMAIL_SERVER_HOST` | ✅ | Es. `smtp.resend.com` |
| `EMAIL_SERVER_PORT` | ✅ | Es. `587` (o `2525` se Resend/Vercel lo blocca) |
| `EMAIL_SERVER_USER` | ✅ | SMTP user |
| `EMAIL_SERVER_PASSWORD` | ✅ | App password (non master pwd) |
| `EMAIL_FROM` | ✅ | Es. `no-reply@courssy.com` |
| `CRON_SECRET` | ✅ | `openssl rand -base64 32` |
| `ALERT_WEBHOOK_URL` | ✅ | Slack incoming webhook per monitoring |
| `LOG_ERROR_SECRET` | ✅ | `openssl rand -base64 32` |
| `NEXT_PUBLIC_LOG_ERROR_SECRET` | ✅ | Stesso valore di LOG_ERROR_SECRET |
| `UPSTASH_REDIS_REST_URL` | ✅ | Upstash REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | ✅ | Upstash token |

**Suggerimenti**: non incollare valori nel terminale (rischio shell-history leak). Usa `npx vercel env add` interattivo o `cat .env.local | xargs -I {} npx vercel env add '{}' production` se hai già `.env.local` pronto.

```bash
# Verifica env vars settate (mostra mascherate)
npx vercel env ls production

# Verifica diagnostica OAuth dopo setup
curl -H "Authorization: Bearer $CRON_SECRET" https://www.courssy.com/api/diagnose-oauth | jq
```

### #3 Supabase · 15min · manuale

1. Crea progetto su [supabase.com/dashboard](https://supabase.com/dashboard)
2. Project Settings → Database → copia:
   - `Connection string` → `Transaction pooler` (port **6543**) → `DATABASE_URL`
   - `Connection string` → `Direct connection` (port **5432**) → `DIRECT_URL`
3. Authentication → URL Configuration:
   - Site URL: `https://www.courssy.com`
   - Redirect URLs (uno per riga):
     - `https://www.courssy.com/auth/callback`
     - `https://www.courssy.com/**` (wildcard per tutti i locale-prefix)
4. SQL Editor → Storage → crea bucket `courses` (se non esiste)

### #4 Google Cloud Console · 20min · manuale

(See `OAUTH-SETUP.md` per runbook dettagliato)

1. [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) → Create OAuth Client ID (Web application)
2. **Authorized JavaScript origins**: `https://www.courssy.com`
3. **Authorized redirect URIs**: ⚠️ `https://<project>.supabase.co/auth/v1/callback` (NON il tuo!)
4. OAuth consent screen:
   - Publishing status → **Publish App** (production) oppure aggiungi te stesso come test user
   - Authorized domains: `supabase.co`, `courssy.com`
5. Copia Client ID + Secret → Supabase Dashboard → Authentication → Providers → Google → Enable

### #5 Lemon Squeezy · 2-3 giorni (KYC review) · manuale

1. Crea account su [lemonsqueezy.com](https://lemonsqueezy.com)
2. Settings → API → copia:
   - `LEMONSQUEEZY_API_KEY` (live mode)
   - `LEMONSQUEEZY_STORE_ID`
3. Settings → Webhooks → Create endpoint:
   - URL: `https://www.courssy.com/api/webhooks/lemonsqueezy`
   - Events: `order_created`, `subscription_created`, `subscription_cancelled`, `subscription_payment_failed`, `order_refunded`, `subscription_updated` (audit-only: `ignored_unsupported`, no subscription synchronization)
   - Copia `LEMONSQUEEZY_WEBHOOK_SECRET`
4. **KYC submission** (2-3gg review): Settings → Payout → completa tax/business info
5. Per ogni prodotto in admin (`/admin/products/new`):
   - LS Dashboard → crea variant per ogni corso
   - Copia `Variant ID` → `Product.lemonVariantId`
6. Toggle Live mode

### #6 Supabase Pro upgrade · 5min · operativo

Per PITR (point-in-time recovery) 7gg (consigliato per revenue):
- Settings → Plan → Pro ($25/mese)
- Necessario per protezione dati utente + recovery da incidenti

### #7 SMTP provider · 10min · manuale

Scegli uno:
| Provider | Setup |
|---|---|
| **Resend** (consigliato DX) | `https://resend.com/api-keys` → SMTP creds |
| **SendGrid** | `https://app.sendgrid.com/settings/api_keys` |
| **Gmail** | App Password da `myaccount.google.com/apppasswords` |

Verifica con:
```bash
# Test SMTP via codice (placeholder)
node -e "require('./src/lib/services/email.ts')"
```

### #8 Prisma migrate · 5min · operativo · ⚠️ IPv6 trap

⚠️ **NON eseguire `prisma migrate deploy` da Vercel.** Vercel è IPv4-only; Supabase disabilita IPv4 sulle connessioni dirette free-tier → build si blocca all'infinito.

**Esegui localmente prima del push:**
```bash
# Prerequisito: DATABASE_URL + DIRECT_URL nel tuo .env.local
npx prisma migrate deploy
```

### #9 Push · 2min · operativo

```bash
# Verifica final state pre-push
git log --oneline -3
git status -sb

# Push
git push origin main

# Vercel auto-deploy: guarda il panel Vercel → Deployments
```

Vercel avvierà il build. Tempo: ~3min per il primo deploy (cache cold).

> ⚠️ **Push di file `.github/workflows/*` richiede token con scope `workflow`.**
> Se `git push origin main` viene rifiutato con:
> ```
> ! [remote rejected] main -> main (refusing to allow an OAuth App to create
>   or update workflow `.github/workflows/...` without `workflow` scope)
> ```
> il token usato (PAT classico `ghp_...`, OAuth app, ecc.) **non ha lo scope `workflow`**.
> Fix: rigenera il token spuntando lo scope **workflow** (oppure usa un fine-grained PAT con
> permission *Workflows: Read and write* sul repo) e poi:
> ```bash
> gh auth refresh -h github.com -s workflow
> git push origin main
> ```
> Nota: un push può essere bloccato anche se nel range ci sono **commit altrui recenti** che
> toccano workflow files — il controllo è sull'intero range, non solo sul tuo ultimo commit.

---

## 🛡️ DEPLOY HARDENING #10-16 · 24-48h post-launch

### #10 Smoke test magic-link signup

Triggerare un sign-in reale con email personale. Verificare:
- Email magic link ricevuta (nodemailer v9 default TLS più rigorosi)
- Click sul link → atterrato su `/auth/callback`
- Session cookie impostato
- Redirect a `/dashboard`

```bash
# Quick check: SMTP service running? —Vercel Preview con env SMTP già settate—
curl -sS https://www.courssy.com/api/health | jq # → services.redis.email.status
# Poi: trigger signup via UI su https://www.courssy.com/login
```

### #11 Smoke test checkout LS end-to-end

Path critico (DEVE FUNZIONARE al 100%):
1. Landing page → click "Buy Now"
2. LS checkout hosted → completa pagamento con carta test
3. Webhook ricevuto in `https://www.courssy.com/api/webhooks/lemonsqueezy`
4. `Order.status='completed'` in DB
5. `AccessGrant.status='active'` creato nella stessa transazione dell'ordine
6. Quattro `OutboxEvent` durabili presenti con chiavi deterministiche
7. Il worker outbox processa `purchase_email`; `OutboxDeliveryAttempt(channel='email')` termina in `sent` (oppure `uncertain` e viene riconciliato, mai reinviato alla cieca)
8. Login con quella email → accesso al corso

Tool: usa [LS test mode](https://docs.lemonsqueezy.com/help/franchise-models/test-mode) prima di andare Live.

### #12 Test cambio lingua (già implementato)

Visitare:
- `https://www.courssy.com/it-it/<slug>`
- `https://www.courssy.com/en-us/<slug>`
- `https://www.courssy.com/fr-fr/<slug>`

Verificare:
- Hreflang `<link rel="alternate">` presenti nel head
- Canonical URL corretta per ogni lingua
- Cookie `locale=` impostata su switch

### #13 CSS regression check (postcss 8.5.19 hoisted)

Dopo npm install con override, postcss è 8.5.19 (vs 8.4.31 vecchio). Verificare:
- `npm run build` output identico (Tailwind 4 + autoprefixer)
- CSS bundle size non è cambiato drasticamente (>5% delta = investigate)

### #14 Privacy / Terms / Refund pages

Vedi `app/(locale)/[locale]/[domain]/page.tsx` per pagine localizzate esistenti. Aggiungere:
- Privacy Policy multilingua (5+ lingue minimo)
- Terms of Service
- Refund Policy (richiesto da EU consumer law)

### #15 ALERT_WEBHOOK_URL

Configura Slack incoming webhook:
- `https://api.slack.com/messaging/webhooks`
- URL `/api/alerts` lo usa per errori 500+ e rate-limit superati

### #16 LOG_ERROR_SECRET + cron secrets

```bash
# Genera tutti i secret random richiesti
openssl rand -base64 32  # LOG_ERROR_SECRET
openssl rand -base64 32  # CRON_SECRET
openssl rand -hex 16     # LEMONSQUEEZY_WEBHOOK_SECRET
# (NEXT_PUBLIC_LOG_ERROR_SECRET = LOG_ERROR_SECRET)
# Settare anche in Vercel via `npx vercel env add`
```

---

## ⏱️ FIRST WEEK post-live #17-20

### #17 Observability

| Tool | Setup |
|---|---|
| Sentry | `https://sentry.io` → DSN → `SENTRY_DSN` env |
| UptimeRobot | `https://uptimerobot.com` → monitor `/api/health` |
| Better Stack | `https://betterstack.com` → log aggregation |

Per `ALERT_WEBHOOK_URL`, integrare con Sentry webhook → Slack.

### #19 GDPR cookie consent

Richiesto per EU users:
- Banner opt-in/opt-out
- Categorizzazione (analytics, marketing, essential)
- Persist preference in cookie 1 anno
- Lib esistente consigliata: `react-cookie-consent`

### #20 React-hooks refactor TODO

22 inline `// eslint-disable-line react-hooks/... -- TODO: refactor (FASE 1.10)`:
- 16 `set-state-in-effect` → lazy useState init o derived state
- 3 `immutability` → structural immutability (spread operator confirmed state)
- 3 `exhaustive-deps` → useCallback wrappers o extract fuori dal component

Refactor sufficiente quando si tocca il file per altri motivi — non blocca il live.

---

## 🎯 STRATEGIC (post-V1, roadmap §Future)

- Security headers (CSP, HSTS)
- Web Vitals monitoring + Lighthouse CI
- Dependabot / Renovate auto-PR settimanali
- PDF certificate generation integration
- Multi-currency payout per affiliazioni
- 2FA admin
- PWA mobile offline
- Traduzione automatica soggetti a quality check

Vedi `FUTURE.md` per catalogo completo (16 sezioni).

---

## 🔐 CLI Cheatsheet

```bash
# === VERCEL ===
npx vercel login
npx vercel link --project courssy
npx vercel env add <KEY> production
npx vercel env ls production
npx vercel --prod --yes              # Force deploy

# === SUPABASE ===
# Web dashboard only: https://supabase.com/dashboard

# === GOOGLE CLOUD CONSOLE ===
# Web dashboard only: https://console.cloud.google.com/apis/credentials

# === LEMON SQUEEZY ===
# Web dashboard only: https://app.lemonsqueezy.com

# === DNS ===
# Web dashboard del tuo provider (Cloudflare / Route53 / ecc.)

# === DATABASE ===
npx prisma migrate deploy           # ⚠️ locale, mai da Vercel
# Include la migration OutboxDeliveryAttempt: verifica la tabella e il vincolo
# UNIQUE (outboxEventId, channel) prima dello smoke test email.
npx prisma studio                   # GUI inspect

# === SMTP ===
# Web dashboard del provider scelto

# === GIT ===
git status -sb
git log --oneline -10
git push origin main

# === DIAGNOSTICS ===
npx tsx scripts/audit-v1-readiness.ts
npx tsx scripts/diagnose-messaging-extended.ts
npx tsx scripts/diagnose-oauth.ts    # richiede CRON_SECRET + Vercel env set

# === QUALITY GATE ===
npm run typecheck      # tsc --noEmit
npm run lint           # eslint src/
npm run test           # vitest run
npm run check          # typecheck + lint + test
npm run build          # prisma generate + validate:locales + generate:locales + next build
```

---

## 🔄 Recovery / Rollback

Se qualcosa si rompe post-deploy:

```bash
# Revert all'ultimo commit (re-deploy automatico via Vercel)
git revert HEAD
git push origin main

# O: rollback via Vercel dashboard → Deployments → "Promote to Production"
# Sul penultimo deploy green in 1 click.

# Revert env vars (se problema di config)
npx vercel env rm <KEY> production

# Prisma migration rollback (raramente necessario)
npx prisma migrate resolve --rolled-back <migration_name>
```

---

## ✅ Final smoke (esegui DOPO ogni push)

```bash
# Locale
npm run check
npm run build
npx tsc --noEmit
npx vitest run

# Diagnostica OAuth (richiede CRON_SECRET live)
curl -H "Authorization: Bearer $CRON_SECRET" https://www.courssy.com/api/diagnose-oauth | jq
```

La condizione **online ready non è soddisfatta** nello stato documentato: i gate PostgreSQL/Redis, migration deploy reale, audit database, E2E/SSE, Gitleaks e CI remoto sono ancora non eseguiti o bloccati.

### Esito verifica release locale (2026-08-06 — audit su `main`, baseline `6f107e9`)

Questa è una verifica **locale**. Non equivale a una run GitHub Actions e non abilita il deploy da sola.

| Check | Esito verificato | Nota |
|---|---|---|
| `npm ci` | ✅ PASS | Lockfile installato senza errori |
| `npm run typecheck` | ✅ PASS | Exit 0 |
| `npm run lint` | ✅ PASS | Exit 0 |
| `npm test` | ✅ PASS | 2.089 test superati in 144 file |
| `npm run check` | ✅ PASS | Quality gate e DoD: 0 failure, 7 warning |
| `npm run build` | ✅ PASS | Build produzione completata |
| `npm audit --audit-level=high` | 📋 STORICO | 0 vulnerabilità nel precedente candidato; rieseguire sul commit corrente |
| `npm run check:deploy-gate-shape` | ✅ PASS | Verificata la forma, non l'esecuzione GitHub |
| Migration safety scan | ✅ PASS | Controllo statico completato |
| Integration PostgreSQL | ⚠️ SKIPPED | 13 test skipped dal guard di ambiente; Docker/DB non disponibili |
| `prisma migrate deploy` reale | ⏸ NON ESEGUITO | PostgreSQL non raggiungibile |
| `audit-v1-readiness` su DB | ⏸ NON ESEGUITO | Nessun DB vuoto, copia o staging raggiungibile |
| E2E / SSE | ⚠️ BLOCCATO | Chromium setup bloccato: `TEST_DATABASE_URL`/`DATABASE_URL` assenti nella fixture Prisma |
| Gitleaks CLI | ⏸ NON ESEGUITO | CLI non installata localmente |
| CI remota / deploy-gate | ⏸ NON VERIFICATO | Il commit corrente non è ancora pubblicato; il push richiede scope `workflow` |

**Stato release:** **bloccata**. Non dichiarare `online ready`: mancano la verifica PostgreSQL/Redis, migration deploy, audit database, E2E/SSE, Gitleaks e una run CI remota verde con deploy-gate.

- **Baseline verificata localmente:** `6f107e9` (`main` locale), con correzioni di fixture/documentazione ancora da committare in questo audit.
- **Push:** tentato verso `origin/main`, rifiutato da GitHub perché il token OAuth non ha lo scope `workflow` (`refusing to allow an OAuth App to create or update workflow`).
- **Stato remoto:** il branch locale è avanti rispetto a `origin/main`; il push richiede un OAuth/PAT con scope `workflow` perché il range contiene `.github/workflows/ci.yml`.
- **Ultima CI remota disponibile:** run `#31040206880` sul commit `a49b8601...`: security scan passata, build/typecheck/unit/integration/migration/E2E/deploy-gate falliti, deploy-production skipped. Vedi `docs/roadmap-current.md` per il dettaglio.

---

*File generato il 2026-07-13 · Sezione "BLOCKER" è critical-path. Le altre sezioni sono hardening progressivo.*
