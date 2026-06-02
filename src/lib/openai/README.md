# `openai.ts` — OpenAI Client (Standalone)

> Singleton client per GPT-4o-mini (traduzione automatica batch).

```ts
import { getOpenAI, translateContent, SUPPORTED_LOCALES } from "@/lib/openai";
```

## `getOpenAI()`

```ts
const openai = getOpenAI();
const chat = await openai.chat.completions.create({ model: "gpt-4o-mini", ... });
```

**Richiede:** `OPENAI_API_KEY` nel `.env`

## `translateContent(text, sourceLocale, targetLocales)`

Traduzione automatica batch via GPT-4o-mini. Tutte le lingue target in una singola chiamata.

```ts
const results = await translateContent(
  "Benvenuto nel corso",
  "it",
  ["en", "fr", "de", "es"]
);
// { en: "Welcome to the course", fr: "...", de: "...", es: "..." }
```

## Lingue supportate

```ts
const SUPPORTED_LOCALES = [
  "it","en","es","fr","de","pt","nl","pl",
  "ru","ja","ko","zh","ar","hi","tr","vi",
  "th","id","sv","da"
] as const;
```

## Costo

GPT-4o-mini è il modello più economico di OpenAI (~€0.003 per 27 lingue per questo contenuto).