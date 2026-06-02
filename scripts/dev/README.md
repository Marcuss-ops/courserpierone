# `scripts/dev/` — Development Utility Scripts

## File

| Script | Descrizione |
|---|---|
| `add-currency-prices.ts` | Aggiunge prezzi in valute multiple a un prodotto |
| `check-prices.ts` | Verifica i prezzi configurati per un prodotto |
| `translate-amish.ts` | Salva traduzioni manuali FR/DE/ES + EN per slug prodotto (param: <slug>) |
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

Salva le traduzioni manuali FR/DE/ES + EN per un prodotto.
Originariamente specifico per Amish Secrets, ora accetta qualsiasi slug.
Le traduzioni salvate sono quelle del prodotto originale "amish-secrets".

```bash
npx tsx scripts/dev/translate-amish.ts <product-slug>
# Es: npx tsx scripts/dev/translate-amish.ts amish-secrets
```

Per traduzioni massiva via AI, usa batch-translate.ts:
```bash
npx tsx scripts/products/batch-translate.ts <slug> <source-locale>
```

## `update-imports.ts`

Utility di refactoring. Usato durante la riorganizzazione `src/lib/` in subdir.
Non è pensato per uso manualo ricorrente.