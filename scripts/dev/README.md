# `scripts/dev/` — Development Utility Scripts

## File

| Script | Descrizione |
|---|---|
| `add-currency-prices.ts` | Aggiunge prezzi in valute multiple a un prodotto |
| `check-prices.ts` | Verifica i prezzi configurati per un prodotto |
| `translate-amish.ts` | Script di traduzione specifico Amish (vecchio, usare batch-translate.ts) |
| `update-imports.ts` | Utility di refactoring — aggiorna import path dopo riorganizzazione |

## `add-currency-prices.ts`

```bash
npx tsx scripts/dev/add-currency-prices.ts <slug>
# Es: npx tsx scripts/dev/add-currency-prices.ts amish-secrets
```

Aggiunge prezzi in valute multiple a un prodotto usando le defined currencies.
Richiede che il prodotto abbia già un prezzo base in EUR.

## `check-prices.ts`

```bash
npx tsx scripts/dev/check-prices.ts <slug>
# Es: npx tsx scripts/dev/check-prices.ts amish-secrets
```

Verifica e stampa tutti i prezzi configurati per un prodotto (EUR, USD, GBP, JPY, ecc.).

## `translate-amish.ts`

Script legacy specifico per Amish Secrets — **non usare più**.
Usare invece:
```bash
npx tsx scripts/products/batch-translate.ts amish-secrets it
```

## `update-imports.ts`

Utility di refactoring. Usato durante la riorganizzazione `src/lib/` in subdir.
Non è pensato per uso manualo ricorrente.