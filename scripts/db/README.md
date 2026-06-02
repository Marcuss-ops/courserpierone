# `scripts/db/` — Database Seeding Scripts

## File

| Script | Descrizione |
|---|---|
| `seed-locales.ts` | Popola la tabella `Locale` con tutte le 71 lingue supportate |
| `seed-ui-translations.ts` | Popola la tabella `UiTranslation` con traduzioni UI globali |

## `seed-locales.ts`

```bash
npx tsx scripts/db/seed-locales.ts
```

Inserisce/update tutte le 71 combinazioni lingua-paese nella tabella `Locale`.
Rieseguibile (upsert) — non duplica.

Schema `Locale`:
```prisma
model Locale {
  code        String @id  # es. "it-it"
  languageCode String     # es. "it"
  countryCode  String?    # es. "IT"
  name         String     # es. "Italian (Italy)"
  nativeName   String     # es. "Italiano (Italia)"
  fallbackLocale String   # es. "en-us"
  currency     String     # es. "EUR"
}
```

## `seed-ui-translations.ts`

```bash
npx tsx scripts/db/seed-ui-translations.ts [locale]
# npx tsx scripts/db/seed-ui-translations.ts fr
```

Popola `UiTranslation` con traduzioni di labels, benefits, FAQ per una lingua specifica.
Se nessuna lingua specificata, carica tutte le 27 lingue.