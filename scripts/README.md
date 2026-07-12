# `scripts/` — Developer Scripts

> Script di utility, seeding, traduzione, e generazione config.

## Struttura

```
scripts/
├── products/         # Script prodotti (generate, list, read, check-prices)
├── db/               # Script database (seed-locales)
├── translate/        # Sistema traduzioni white-label (extract-locales, argos-bridge)
├── audit-v1-readiness.ts # (root) audit read-only dei 3 gate che bloccano V1 cleanup
├── README.md         # This file
```

## Usage

```bash
# Prodotti
npx tsx scripts/products/generate.ts amish-secrets

# Database seed
npx tsx scripts/db/seed-locales.ts

# Traduzioni white-label
npx tsx scripts/translate/extract-locales.ts amish-secrets
npx tsx scripts/translate/argos-bridge.ts it en fr de es

# V1 readiness audit (read-only, no mutations)
npx tsx scripts/audit-v1-readiness.ts
PRIMARY_DATABASE_URL='postgres://...' npx tsx scripts/audit-v1-readiness.ts
PRIMARY_DATABASE_URL='postgres://...' npx tsx scripts/audit-v1-readiness.ts --production
```

## Variabili d'ambiente

Gli script che usano Prisma richiedono `DATABASE_URL` (o `PRIMARY_DATABASE_URL` per direct connection) nel `.env`.
Per traduzioni AI: `OPENAI_API_KEY` (OpenAI) o `pip install argostranslate` (locale).

## Audit

Lo script `scripts/audit-v1-readiness.ts` (read-only, no mutations) misura **i 3 counter che bloccano / hanno bloccato i cleanup DB di V1**:

1. **`Product.creatorId IS NULL`** → contatore che gating la migration
   `20260712210000_creator_id_required_restrict`. Deve essere `0` prima di
   applicare il NOT NULL + Restrict FK sul creator. Recovery legacy pre-migration:
   `scripts/products/backfill-primary-creator.ts`.

2. **`Order.paymentProvider = 'stripe' AND status IN ('pending','completed')`**
   → ordini Stripe ancora attivi: devono essere drained (refund o migrazione
   a Lemon Squeezy) prima di collassare il dual-provider.

3. **`Account + Session + VerificationToken` row counts** → residui del vecchio
   NextAuth: una purge mirata dovrebbe precedere `DROP TABLE` di quei tre
   modelli Prisma (migration `20260712220000_drop_nextauth_models`).
   Implementato via raw SQL (`prisma.$queryRaw`) per forward-compat: dopo
   che la migration è stata applicata, i modelli spariscono dal typed Prisma
   client e lo script restituisce `-1` (sentinel = tabella assente) per ogni
   tabella, che è un segnale GREEN (tabella post-cleanup = ✓).

Oltre ai 3 gate counter, emette sanity baselines (`Total products`,
`Total orders`, `Total users`) e un gate decision (`GREEN` se tutti i
blocker sono zero o post-cleanup, `YELLOW/RED` con lista blockers altrimenti).
Output finale include riga JSON machine-readable per pipeline.

### Usage

```bash
# Variabile preferita (direct connection con full privilege)
PRIMARY_DATABASE_URL='postgres://user:pwd@host:5432/db' \
  npx tsx scripts/audit-v1-readiness.ts

# Fallback se PRIMARY_DATABASE_URL non è settata
DATABASE_URL='postgres://user:pwd@host:5432/db' \
  npx tsx scripts/audit-v1-readiness.ts

# Appendi --production per attivare il DBS-empty sanity warning
# (altrimenti silente; auto-attivo anche se NODE_ENV='production')
PRIMARY_DATABASE_URL='postgres://user:pwd@host:5432/db' \
  npx tsx scripts/audit-v1-readiness.ts --production
```

### Output format

Lo script emette in ordine:

1. **Header** — source env, timestamp, mode (production vs dev).
2. **V1 BLOCKER COUNTERS** — i 3 gate con count, descrizione del gate, recovery script.
3. **SANITY BASELINES** — totali (non sono blockers, solo sanity check).
4. **DBS-EMPTY SANITY (production only)** — warning se totals sono tutti zero
   in production (possibile misconfig del DATABASE_URL).
5. **GATE DECISION** — GREEN se tutti i blocker sono zero, altrimenti YELLOW/RED
   con l elenco delle cause.
6. **JSON machine-readable** — una riga JSON con tutti i counter, i baselines
   e i blockers (per pipeline CI/CD).

### Safety

- **Mai `prisma.X.create/update/delete`** nello script — solo `.count()` + raw
  `SELECT COUNT(*)` per le 3 tabelle NextAuth residual (forward-compat).
- **Mai stampare la URL** in chiaro — solo il label `PRIMARY_DATABASE_URL` /
  `DATABASE_URL`.
- **Mai committare secrets.** `.env` e `.env.local` sono in `.gitignore`.
- **Mai accettare argomenti dinamici** in `safeTableCount` — solo i 3 nomi
  tabella NextAuth sono allowlisted (previene SQL-injection nei raw query).
- **Exit codes**: 0 (success), 1 (runtime error), 2 (missing env).
- **Sempre `prisma.$disconnect()`** anche sull'error path.
