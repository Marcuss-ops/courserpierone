# `scripts/` — Developer Scripts

> Script di utility, seeding, traduzione, e generazione config.

## Struttura

```
scripts/
├── products/         # Script prodotti (generate, list, read, check-prices)
├── db/               # Script database (seed-locales)
├── translate/        # Sistema traduzioni white-label (extract-locales, argos-bridge)
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
```

## Variabili d'ambiente

Gli script che usano Prisma richiedono `DATABASE_URL` nel `.env`.
Per traduzioni AI: `OPENAI_API_KEY` (OpenAI) o `pip install argostranslate` (locale).