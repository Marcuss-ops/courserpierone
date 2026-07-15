# `db/` — Database Connections

> Client Prisma e Supabase. Singletons con global cache per evitare connessioni multiple in dev.

## File

| File | Descrizione |
|---|---|
| `prisma.ts` | Client Prisma singleton (Postgres via Prisma) |
| `supabase.ts` | Client Supabase (se necessario per storage) |

## Prisma

```ts
import { prisma } from "@/lib/db/prisma";

// Uso tipico in API routes:
const product = await prisma.product.findUnique({ where: { slug } });
const translations = await prisma.productTranslation.findMany({ where: { productId } });
```

## Inizializzazione schema

```bash
# Push schema al DB
npx prisma db push

# Apri Prisma Studio
npx prisma studio

# Generate client
npx prisma generate
```

## Schema Prisma

Principali entity:

```prisma
Product              # Corsi/prodotti
ProductTranslation   # Traduzioni (locale + section + content)
Lesson               # Lezioni di un corso
LessonTranslation    # Traduzioni lezione
CourseConfigCache    # Cache JSON config per ogni corso
User                 # Autenticazione
Order                # Ordini (LemonSqueezy)
AnalyticsEvent       # Eventi tracking
UiTranslation        # Traduzioni UI globali
Locale               # Locale supportati (71 lingue)
```