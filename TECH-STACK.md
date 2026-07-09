# Technology Stack

## Frontend

| Tecnologia | Scelta | Motivazione |
|---|---|---|
| **Framework** | Next.js 14+ (App Router) | SSR/SSG, i18n nativo, deploy facile |
| **Linguaggio** | TypeScript | Type safety, DX migliore |
| **Styling** | Tailwind CSS | Velocità sviluppo, consistenza |
| **UI Components** | shadcn/ui | Componenti accessibili, customizzabili |
| **i18n** | next-intl | Routing multipiattaforma, fallback |
| **Forms** | React Hook Form + Zod | Validazione type-safe |

## Backend

| Tecnologia | Scelta | Motivazione |
|---|---|---|
| **API** | tRPC (o REST se preferito) | Type safety end-to-end |
| **ORM** | Prisma | Migration, type safety, DX |
| **Database** | PostgreSQL | Robusto, JSON support, locale |
| **Auth** | Supabase Auth | Google OAuth, sessioni |

## Pagamenti

| Tecnologia | Scelta | Motivazione |
|---|---|---|
| **Checkout** | Stripe Checkout | Gestisce valuta, tasse, 135+ valute |
| **Webhooks** | Stripe Webhooks | Conferma pagamento automatica |
| **Tax** | Stripe Tax | Calcolo automatico VAT/sales tax |
| **subscriptions** | Stripe Billing | Se necessario in futuro |

## Contenuti

| Tecnologia | Scelta | Motivazione |
|---|---|---|
| **Video** | YouTube/Vimeo embed (MVP) | Zero costi hosting video iniziali |
| **Audio** | Cloudflare R2 / S3 | Storage economico, delivery veloce |
| **PDF** | Cloudflare R2 / S3 | Stessa infrastruttura degli audio |
| **Player audio** | Custom React component | Controllo completo sull'UX |

## Infrastruttura

| Tecnologia | Scelta | Motivazione |
|---|---|---|
| **Hosting** | Vercel (o Docker self-hosted) | Deploy automatico, edge network |
| **Database hosted** | Neon / Supabase / Railway | PostgreSQL managed, free tier generoso |
| **CDN** | Cloudflare | Cache, sicurezza, performance |
| **File storage** | Cloudflare R2 | S3-compatible, zero egress fees |
| **Email** | Resend | Transactional email semplice |
| **Analytics** | PostHog (self-hosted) o Umami | Privacy-friendly, product analytics |
| **Error tracking** | Sentry | Error monitoring real-time |
| **Monitoring** | Uptime Robot | Uptime check gratuito |

## Alternativa Self-Hosted

Se vuoi evitare dipendenze da servizi managed:

```
Vercel  →  Docker + Nginx + VPS (Hetzner, Contabo)
Neon    →  PostgreSQL su VPS
R2      →  MinIO su VPS
Resend  →  Mailtrain / Listmonk su VPS
```

Costo VPS: ~€5-15/mese vs Vercel Pro €20/mese.

## Dipendenze Principali (package.json)

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "next-intl": "^3.0.0",
    "next-auth": "^4.0.0",
    "@prisma/client": "^5.0.0",
    "@trpc/server": "^10.0.0",
    "@trpc/client": "^10.0.0",
    "stripe": "^14.0.0",
    "zod": "^3.0.0",
    "react-hook-form": "^7.0.0",
    "@hookform/resolvers": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "prisma": "^5.0.0",
    "tailwindcss": "^3.0.0",
    "postcss": "^8.0.0",
    "autoprefixer": "^10.0.0"
  }
}
```
