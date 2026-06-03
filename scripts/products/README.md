# `scripts/products/` — Product Management Scripts

## File

| Script | Descrizione |
|---|---|
| `generate.ts` | Genera config.json del corso + cache DB |
| `list-products.ts` | Lista tutti i prodotti nel DB |
| `read-product.ts` | Mostra dettaglio completo di un prodotto |
| `add-currency-prices.ts` | Aggiunge prezzi in valute multiple a un prodotto (param: <slug>) |
| `check-prices.ts` | Verifica i prezzi configurati per un prodotto (param: <slug>) |

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