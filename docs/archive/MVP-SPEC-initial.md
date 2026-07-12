Archiviato: contiene il boot legacy pre-Supabase, post-V1.

# Specifica MVP — Fase 1

## Panoramica

Il MVP è un sito web in 3 lingue (Italiano, Inglese, Spagnolo) che vende un singolo corso digitale con checkout Stripe e accesso automatico dopo l'acquisto.

## Lingue Supportate

| Lingua | Codice | URL Pattern |
|---|---|---|
| Italiano | `it` | `/it/...` (default) |
| Inglese | `en` | `/en/...` |
| Spagnolo | `es` | `/es/...` |

## Pagine del MVP

### 1. Homepage (`/`)
- Hero section con CTA
- Lista prodotti in evidenza
- Sezione "Perché questa piattaforma"
- Footer con link alle lingue

### 2. Pagina Prodotto (`/{locale}/prodotto/{slug}`)
- Titolo e descrizione localizzata
- Anteprima video (embed YouTube)
- Prezzo con valuta locale
- Lista lezioni/moduli
- CTA "Acquista ora" → Stripe Checkout

### 3. Checkout (Stripe)
- Pagina gestita da Stripe
- Valuta rilevata automaticamente
- Tasse calcolate da Stripe Tax
- Pagamento: carta, Apple Pay, Google Pay

### 4. Dashboard Utente (`/{locale}/dashboard`)
- Lista acquisti
- Link ai corsi acquistati
- Download PDF per lezione
- Profilo utente

### 5. Lezione (`/{locale}/corso/{slug}/lezione/{id}`)
- Video embedded (YouTube/Vimeo)
- Player audio (se tracce multiple)
- Testo lezione localizzato
- Download PDF
- Navigazione lezioni precedente/successiva

### 6. Auth (`/{locale}/login`, `/api/auth/*`)
- Google OAuth
- Sessione gestita da NextAuth

## Database Schema (Prisma)

```prisma
model Product {
  id            String   @id @default(cuid())
  slug          String   @unique
  price         Int      // in centesimi
  currency      String   @default("eur")
  status        String   @default("draft") // draft, published, archived
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  translations  ProductTranslation[]
  lessons       Lesson[]
  orders        Order[]
}

model ProductTranslation {
  id          String  @id @default(cuid())
  productId   String
  locale      String  // it, en, es
  title       String
  description String
  content     String? // JSON per campi extra

  product     Product @relation(fields: [productId], references: [id])

  @@unique([productId, locale])
}

model Lesson {
  id          String   @id @default(cuid())
  productId   String
  position    Int
  videoUrl    String?  // YouTube/Vimeo URL
  createdAt   DateTime @default(now())

  product       Product            @relation(fields: [productId], references: [id])
  translations  LessonTranslation[]
  assets        LessonAsset[]
}

model LessonTranslation {
  id          String  @id @default(cuid())
  lessonId    String
  locale      String
  title       String
  content     String? // Markdown/HTML del testo della lezione

  lesson      Lesson @relation(fields: [lessonId], references: [id])

  @@unique([lessonId, locale])
}

model LessonAsset {
  id          String  @id @default(cuid())
  lessonId    String
  type        String  // pdf, audio
  locale      String
  fileUrl     String
  fileName    String

  lesson      Lesson @relation(fields: [lessonId], references: [id])
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  image     String?
  createdAt DateTime @default(now())

  orders    Order[]
  accounts  Account[]
  sessions  Session[]
}

model Order {
  id              String   @id @default(cuid())
  userId          String
  productId       String
  stripeSessionId String   @unique
  amount          Int      // in centesimi
  currency        String
  status          String   @default("pending") // pending, completed, refunded
  createdAt       DateTime @default(now())

  user            User     @relation(fields: [userId], references: [id])
  product         Product  @relation(fields: [productId], references: [id])
}

// NextAuth models (Account, Session, VerificationToken)
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

## Flusso di Acquisto Dettagliato

```
1. Utente clicca link YouTube → atterra su /it/prodotto/corso-fotografia
2. Vede descrizione, prezzo (€49), anteprima video
3. Clicca "Acquista ora" → redirect a Stripe Checkout
4. Stripe rileva valuta (EUR per utente italiano)
5. Utente inserisce dati carta e paga
6. Stripe invia webhook a /api/webhooks/stripe
7. Backend verifica firma webhook
8. Crea ordine nel database (status: completed)
9. Concede accesso al prodotto per quell'utente
10. Invia email di benvenuto con credenziali
11. Redirect a /it/dashboard con messaggio "Acquisto completato"
```

## Configurazione Stripe

```typescript
// Variabili d'ambiente necessarie
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

// Configurazione prodotto in Stripe Dashboard
// Ogni prodotto ha un price ID per ogni valuta supportata
STRIPE_PRICE_EUR=price_...
STRIPE_PRICE_USD=price_...
STRIPE_PRICE_GBP=price_...
```

## Checklist MVP

- [ ] Setup progetto Next.js + TypeScript + Tailwind
- [ ] Configurare Prisma + database PostgreSQL
- [ ] Implementare sistema i18n con next-intl
- [ ] Setup Supabase Auth (Google OAuth)
- [ ] Creare schema database
- [ ] Admin panel: CRUD prodotti e lezioni
- [ ] Pubblica prodotti con traduzioni
- [ ] Pagina prodotto pubblica (3 lingue)
- [ ] Checkout Stripe
- [ ] Webhook conferma pagamento
- [ ] Dashboard utente con accesso corsi
- [ ] Download PDF
- [ ] Email transazionali
- [ ] Deploy su Vercel
- [ ] Test end-to-end completo
