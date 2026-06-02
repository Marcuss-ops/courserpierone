# `scripts/products/` — Product Management Scripts

## File

| Script | Descrizione |
|---|---|
| `generate.ts` | Genera config.json del corso + cache DB |
| `list-products.ts` | Lista tutti i prodotti nel DB |
| `read-product.ts` | Mostra dettaglio completo di un prodotto |
| `batch-translate.ts` | Traduzione GPT-4o-mini batch in 27+ lingue |
| `save-all-translations.ts` | Seed one-shot traduzioni da contenuto hardcoded |

## `generate.ts`

```bash
npx tsx scripts/products/generate.ts <slug>
# Es: npx tsx scripts/products/generate.ts amish-secrets
```

Legge tutte le traduzioni dal DB e genera:
- `public/courses/{slug}/config.json` (locale)
- `CourseConfigCache` nel DB (funziona anche su Vercel)

## `batch-translate.ts`

```bash
npx tsx scripts/products/batch-translate.ts <slug> [source-locale] [target-locales...]
# Es: npx tsx scripts/products/batch-translate.ts amish-secrets it en fr de es
```

Legge le traduzioni esistenti (source-locale) dal DB, traduce via GPT-4o-mini in tutte le lingue target in una chiamata, e salva su `ProductTranslation` per ogni sezione.

**Richiede:** `OPENAI_API_KEY`

## `save-all-translations.ts`

Script di seed one-shot. Contiene tutte le 189 traduzioni hardcoded (27 lingue × 7 sezioni) per Amish Secrets.
Usato per popolare il DB senza API key OpenAI.