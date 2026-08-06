# `src/lib/` — shared infrastructure e compatibilità

`src/lib` non è più il proprietario della nuova business logic. Le nuove regole di dominio vivono in `src/domains/<domain>` e seguono `Route/UI → application use case → domain rule → port → adapter`.

## Struttura

```
lib/
├── db/             # Prisma/Supabase clients
├── i18n/           # Locale and translation infrastructure
├── logging/        # Shared logging helpers
├── redis/          # Cache/presence infrastructure
├── utils/          # Generic utilities
├── openai.ts       # OpenAI client
└── README.md       # This file
```

## Regola di ownership

Nuova business logic sotto `src/lib` è vietata dal quality gate `check:architecture`, salvo shim di solo re-export. I consumer devono usare l'API pubblica del dominio quando la slice è migrata. `src/lib` può contenere infrastruttura, helper condivisi e integrazioni legacy durante la finestra di compatibilità.

Proprietari canonici: Identity (`src/domains/identity`), Commerce, Messaging, Catalog, Automation e Discovery (`src/domains/*`). Tra domini si usano contratti pubblici, mai file interni.

## Barrel exports

Ogni subdirectory esporta il proprio contenuto. Per importare:

```ts
// ✅ Consigliato — path specifico
import { requireAdmin } from "@/domains/identity";
import { prisma } from "@/lib/db/prisma";
import { initLS } from "@/lib/payment/lemonsqueezy";

// ❌ Da evitare — nessun index barrel centrale
// (evita dipendenze circolari)
```

## Shim temporanei

Gli shim sono ammessi solo finché esistono consumer legacy e devono avere un test di compatibilità. La rimozione segue il 5-commit workflow di ADR-0016.

## Dipendenze tra subdir

```
openai.ts          → (standalone, no deps)
utils/             → (standalone)
db/prisma.ts       → (standalone)
i18n/              → (standalone)
auth/require-admin.ts       → supabase/get-user.ts
config/            → db/prisma.ts
payment/           → (standalone, reads env)
services/
  ├── email.ts     → (standalone, reads env)
  └── order-service.ts → db/prisma.ts, services/email.ts
```

## Verification

```bash
npm run check:architecture
npm run check:eslint-disables
npm run check:registry-drift
npm run check
```

## Variabili d'ambiente globali

```env
# Database
DATABASE_URL=postgresql://...

# Payment
LEMONSQUEEZY_API_KEY=
LEMONSQUEEZY_STORE_ID=
LEMONSQUEEZY_WEBHOOK_SECRET=

# Email
EMAIL_SERVER_HOST=
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=
EMAIL_SERVER_PASSWORD=
EMAIL_FROM=

# AI
OPENAI_API_KEY=

# App
NEXT_PUBLIC_APP_URL=https://www.courssy.com
VERCEL=1
```