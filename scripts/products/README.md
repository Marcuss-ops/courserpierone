# `scripts/products/` — Product Management Scripts

## File

| Script | Descrizione |
|---|---|
| `generate.ts` | Genera config.json del corso + cache DB |
| `list-products.ts` | Lista tutti i prodotti nel DB |
| `read-product.ts` | Mostra dettaglio completo di un prodotto |
| `add-currency-prices.ts` | Aggiunge prezzi in valute multiple a un prodotto (param: <slug>) |
| `check-prices.ts` | Verifica i prezzi configurati per un prodotto (param: <slug>) |
| `backfill-primary-creator.ts` | (Phase 1.4) Backfill `Product.creatorId` per tutti i prodotti che sono NULL, promuovendo un admin come creator primario |

## `generate.ts`

```bash
npx tsx scripts/products/generate.ts <slug>
# Es: npx tsx scripts/products/generate.ts amish-secrets
```

Legge tutte le traduzioni dal DB e genera:
- `public/courses/{slug}/config.json` (locale)
- `CourseConfigCache` nel DB (funziona anche su Vercel)

**Nuovo sistema traduzioni:** vedi `scripts/translate/` per:
- `extract-locales.ts` — estrae DB → JSON per lingua
- `argos-bridge.ts` — traduzione offline con Argos Translate (Python)

## `add-currency-prices.ts`

```bash
npx tsx scripts/products/add-currency-prices.ts <slug>
# Es: npx tsx scripts/products/add-currency-prices.ts amish-secrets
```

Aggiunge prezzi in valute multiple a un prodotto usando le defined currencies.
Richiede che il prodotto abbia già un prezzo base in EUR.

## `check-prices.ts`

```bash
npx tsx scripts/products/check-prices.ts <slug>
# Es: npx tsx scripts/products/check-prices.ts amish-secrets
```

Verifica e stampa tutti i prezzi configurati per un prodotto (EUR, USD, GBP, JPY, ecc.).

## `backfill-primary-creator.ts` (Phase 1.4 del piano DMs)

```bash
# Default: primo admin per createdAt ascendente
npx tsx scripts/products/backfill-primary-creator.ts

# Specifica tramite email (opzionale)
PRIMARY_CREATOR_EMAIL=alice@example.com \
  npx tsx scripts/products/backfill-primary-creator.ts

# Dry run: mostra solo cosa farebbe, senza scrivere
npx tsx scripts/products/backfill-primary-creator.ts --dry-run
```

**Cosa fa:** designa un account (default: primo admin per createdAt) come creator **primario** del sistema e popola `Product.creatorId` per ogni prodotto che ne è privo. Lo script è **idempotente** — rilanciarlo termina con `0 changes applied`.

**Quando eseguirlo:** dopo aver deployato la migration `20260712170003_add_product_creator_id` su un DB che aveva prodotti esistenti senza creator, o dopo aver promosso manualmente un admin a creator principale.

**Sicurezza:** lo script non elimina mai dati; l'unica scrittura è su `User.role` (se non già admin/creator) e `Product.creatorId` (solo per NULL). Usare `--dry-run` per ispezionare le modifiche prima di applicarle.

**Multi-admin guard (fail-fast):** se esistono **più di 1 account admin** nella tabella `User` e `PRIMARY_CREATOR_EMAIL` non è impostato, lo script **rifiuta di procedere** (exit 1) e stampa la lista formattata di tutti gli admin con `id`, `email`, `createdAt`. Il guard resta attivo anche in `--dry-run`, per garantire che la scelta del creator primario sia sempre intenzionale e mai "il primo admin per createdAt" di default con più opzioni possibili. Rilanciare con `PRIMARY_CREATOR_EMAIL=<email-desiderata> npx tsx scripts/products/backfill-primary-creator.ts` per procedere.