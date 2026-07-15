# `src/lib/` — Library Root

> Raccolta di moduli organizzati per dominio funzionale.

## Struttura

```
lib/
├── auth/          # NextAuth configuration
├── config/        # Course config generation & reading
├── db/            # Prisma & Supabase clients
├── i18n/          # Internationalization (locale, player-locale, visitor-session)
├── payment/       # LemonSqueezy integration
├── services/      # Business logic (order-service, email)
├── utils/         # Shared utilities (validations, sanitize, types)
├── openai.ts      # OpenAI client (standalone)
└── README.md      # This file
```

## Barrel exports

Ogni subdirectory esporta il proprio contenuto. Per importare:

```ts
// ✅ Consigliato — path specifico
import { authOptions } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { initLS } from "@/lib/payment/lemonsqueezy";

// ❌ Da evitare — nessun index barrel centrale
// (evita dipendenze circolari)
```

## Dipendenze tra subdir

```
openai.ts          → (standalone, no deps)
utils/             → (standalone)
db/prisma.ts       → (standalone)
i18n/              → (standalone)
auth/auth.ts       → db/prisma.ts
config/            → db/prisma.ts
payment/           → (standalone, reads env)
services/
  ├── email.ts     → (standalone, reads env)
  └── order-service.ts → db/prisma.ts, services/email.ts
```

## Variabili d'ambiente globali

```env
# Database
DATABASE_URL=postgresql://...

# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=

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