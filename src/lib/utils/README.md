# `utils/` — Utilities & Shared Types

> Funzioni di utilità, tipi condivisi, validazioni Zod, sanitizzazione HTML.

## File

| File | Descrizione |
|---|---|
| `utils.ts` | Helper generici (formattazione, slug, ecc.) |
| `validations.ts` | Schemi Zod per tutte le API routes |
| `validations.test.ts` | Test unitari validazioni |
| `sanitize.ts` | Sanitizzazione HTML (blocklist tag/attrs) |
| `sanitize.test.ts` | Test unitari sanitizzazione |
| `dashboard-data.ts` | Aggregazione dati dashboard admin |
| `api-types.ts` | Tipi TypeScript condivisi tra frontend e API |

---

## `validations.ts`

```ts
import {
  checkoutSchema,
  createProductSchema,
  translateSchema,
  analyticsEventSchema,
  validationErrorResponse,
} from "@/lib/utils/validations";
```

Tutti gli schemi Zod usano `z.object()` e supportano parsing con messaggi di errore custom in italiano.

### Schema常用

| Schema | Rotta |
|---|---|
| `checkoutSchema` | `POST /api/checkout` |
| `createProductSchema` | `POST /api/products` |
| `translateSchema` | `POST /api/translate` |
| `analyticsEventSchema` | `POST /api/analytics` |
| `progressSchema` | `POST /api/progress` |

---

## `sanitize.ts`

```ts
import { sanitizeHtml } from "@/lib/utils/sanitize";

// Rimuove tag pericolosi (script, iframe, on* attrs) da HTML arbitrary
const safe = sanitizeHtml(dirtyHtml);
```

Usa **blocklist** (più sicuro del allowlist per contenuto editoriale):
- Rimuove: `<script>`, `<iframe>`, `<object>`, `<form>`
- Rimuove: tutti gli attributi `on*` (`onclick`, `onerror`, ecc.)
- Rimuove: `javascript:` URLs
- Mantiene: tag semantici comuni (`p`, `h1`-`h6`, `ul`, `ol`, `li`, `strong`, `em`, `a` con `href` cleaned)

---

## `api-types.ts`

Tipi TypeScript usati trasversalmente:

```ts
import type {
  ProductApiItem,
  ProductApiDetail,
  TranslateApiResponse,
} from "@/lib/utils/api-types";
```

---

## `dashboard-data.ts`

```ts
import { getDashboardData } from "@/lib/utils/dashboard-data";
const data = await getDashboardData(productId);
```

Aggrega dati per il dashboard admin: ordini, ricavi, accessi, analytics.