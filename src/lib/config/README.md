# `config/` — Course Configuration

> Generazione e lettura della configurazione per ogni corso/prodotto.
> La config include tutte le traduzioni, prezzi, lezioni, SEO metadata.

## File

| File | Descrizione |
|---|---|
| `generate-course-config.ts` | Genera la config del corso (da DB, salva su file + cache) |
| `white-label-data.ts` | Legge la config del corso (da file locale o DB cache) |

## Tipo principale

```ts
import type { CourseConfig } from "@/lib/config/white-label-data";

interface CourseConfig {
  slug: string;
  template: "lumio" | "h612" | "horizon" | "book-claude";
  defaultLanguage: string;
  cover: string;                          // URL copertina
  price: number;
  prices?: Record<string, PriceByLocale>; // prezzi per valuta
  lemonVariantId?: string;
  languages: Record<string, LanguageEntry>;
  lessons: LessonConfig[];
  ebookChapters: { page: number; [locale: string]: string | number }[];
}

interface LanguageEntry {
  title: string;
  problem: string;
  story: string;
  cta: string;
  description: string;       // sottotitolo
  ebookTitle: string;
  ebookContent: string;
  seo?: { title: string; description: string; ogImage?: string; };
  ui?: { labels: Record<string,string>; benefits: []; faq: []; };
}
```

## Generare una config

```ts
// Da API route o script
import { generateCourseConfig } from "@/lib/config/generate-course-config";
const config = await generateCourseConfig("amish-secrets");
// Salva su: public/courses/{slug}/config.json
//          + DB: CourseConfigCache
```

## Leggere una config (consigliato)

```ts
// In una Server Component o API route
import { getCourseConfig } from "@/lib/config/white-label-data";
const config = await getCourseConfig("amish-secrets"); // null se non esiste
```

## Struttura su disco

```
public/courses/{slug}/
├── config.json       # Cache locale (generato da generate-course-config.ts)
└── cover.*           # Copertina del corso
```

## Struttura in DB

```prisma
model Product { slug, templateId, coverUrl, price, pricesByCurrency, translations, lessons, ... }
model ProductTranslation { productId, locale, section, content }
model CourseConfigCache { slug, config (JSON), version }
model Lesson { translations: LessonTranslation[] }
```

## SEO Metadata

Ogni lingua ha i propri metadata SEO (`seo.title`, `seo.description`, `seo.ogImage`).
Se non presenti nel DB, vengono derivati da `titolo`, `sottotitolo`, `problema`.