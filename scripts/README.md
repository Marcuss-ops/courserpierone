# `scripts/` — Developer Scripts

> Script di utility, seeding, traduzione, e generazione config.
> Organizzati in 3 sottodirectory per dominio.

## Struttura

```
scripts/
├── products/         # Script prodotti (generate, list, read, batch-translate)
├── db/               # Script database (seed-locales, seed-ui-translations)
├── dev/              # Script di sviluppo (add-currency-prices, check-prices)
├── README.md         # This file
└── [standalone]      # Script one-shot non categorizzati
```

## Usage

```bash
# Prodotti
npx tsx scripts/products/generate.ts amish-secrets
npx tsx scripts/products/batch-translate.ts amish-secrets it

# Database seed
npx tsx scripts/db/seed-locales.ts

# Currency prices
npx tsx scripts/dev/add-currency-prices.ts amish-secrets
```

## Variabili d'ambiente

Gli script che usano Prisma richiedono `DATABASE_URL` nel `.env`.
Gli script OpenAI richiedono `OPENAI_API_KEY`.