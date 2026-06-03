# `scripts/db/` — Database Seeding Scripts

## File

| Script | Descrizione |
|---|---|
| `seed-locales.ts` | Popola la tabella `Locale` con tutte le 71 lingue supportate |
| `seed-locales.ts` | Popola la tabella `Locale` con tutte le 71 lingue supportate |

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

> **Nota:** Il sistema traduzioni white-label è in `scripts/translate/` — estrai DB → JSON con `extract-locales.ts`, traduci con `argos-bridge.ts` (Argos Translate locale).