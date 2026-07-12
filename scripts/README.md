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
```

## Variabili d'ambiente

Gli script che usano Prisma richiedono `DATABASE_URL` (o `PRIMARY_DATABASE_URL` per direct connection) nel `.env`.
Per traduzioni AI: `OPENAI_API_KEY` (OpenAI) o `pip install argostranslate` (locale).

## Audit

Lo script `audit-v1-readiness.ts` (read-only, no mutations) misura **i 3 counter che gating il cleanup DB di V1**:

1. ~~**`Product.creatorId IS NULL`**~~ → post-fase 4 hardening (`20260712210000_creator_id_required_restrict`): `Product.creatorId` è ora REQUIRED + FK Restrict a livello DB. La query `count({ where: { creatorId: null } })` non è più legalmente esprimibile in TypeScript. L'invariant vive nel constraint di schema. Recovery legacy pre-migration: `scripts/products/backfill-primary-creator.ts` (versione mutante disponibile via git log pre-fase 4).
2. **`Order.paymentProvider = 'stripe' AND status IN ('pending','completed')`** → ordini Stripe ancora attivi: devono essere drained (refund o migrazione a Lemon Squeezy) prima di collassare il dual-provider.
3. **`Account + Session + VerificationToken` row counts** → residui del vecchio NextAuth: una purge mirata dovrebbe precedere `DROP TABLE` di quei tre modelli Prisma (Phase di cleanup già pianificata).

Oltre ai 3 counter emette sanity baselines (`Total products`, `Total orders`, `Total users`) e un gate decision (`GREEN` se tutti zero, `YELLOW/RED` con lista blockers altrimenti). Output finale include riga JSON machine-readable per pipeline.

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

### Safety

- **Mai `prisma.X.create/update/delete`** nello script — solo `.count()`.
- **Mai stampare la URL** in chiaro — solo il label `PRIMARY_DATABASE_URL` / `DATABASE_URL`.
- **Mai committare secrets.** `.env` e `.env.local` sono in `.gitignore`.
- **Exit codes**: 0 (success), 1 (runtime error), 2 (missing env).