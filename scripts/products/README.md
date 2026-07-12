# `scripts/products/` — Product Management Scripts

## File

| Script | Descrizione |
|---|---|
| `generate.ts` | Genera config.json del corso + cache DB |
| `list-products.ts` | Lista tutti i prodotti nel DB |
| `read-product.ts` | Mostra dettaglio completo di un prodotto |
| `add-currency-prices.ts` | Aggiunge prezzi in valute multiple a un prodotto (param: <slug>) |
| `check-prices.ts` | Verifica i prezzi configurati per un prodotto (param: <slug>) |
| `backfill-primary-creator.ts` | (Post-fase 4 — verification-only) Assertion read-only dell'invariant `Product.creatorId IS NOT NULL` DB-enforced dalla migration `*_creator_id_required_restrict`. Storicamente mutante pre-fase 4 (backfill NULL → primary admin); oggi logga conteggi + canonical creator audit. |

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

## `backfill-primary-creator.ts` (Phase 1.4 — post-fase 4 verification)

```bash
# Default: read-only (non muta)
npx tsx scripts/products/backfill-primary-creator.ts

# Stesso effetto — --dry-run è ora sinonimo del default
npx tsx scripts/products/backfill-primary-creator.ts --dry-run
```

**Stato post-fase 4 hardening:** la colonna `Product.creatorId` è ora REQUIRED (NOT NULL + FK Restrict) per via della migration `*_creator_id_required_restrict`. Lo script **non muta più** il DB: asserisce l'invariant "zero orphan products" via conteggio + audit del creator canonico (primo admin/creator per `createdAt` ASC).

**Storicamente: cosa faceva.** Pre-fase 4 designava un account (default: primo admin per `createdAt`) come creator **primario** del sistema e popolava `Product.creatorId` per ogni prodotto NULL. Era idempotente — rilanciarlo terminava con `0 changes applied`.

**Recovery mode per DB legacy pre-migration** (rollback di emergenza): se serve rieseguire la mutazione originaria (es. DB legacy con prodotti NULL), seguire la procedura documentata inline nello script (4 step). Il branch main **non** mantiene più la versione mutante — per recovery andrebbe ripristinata via git log pre-fase 4 (`feat(db): make Product.creatorId required…` e precedenti).

**Multi-admin guard (fail-fast):** presente nella versione mutante storica; rimosso nella versione verification-only perché l'invariant è ora DB-enforced — la fase di selezione del primary creator non avviene più runtime.
