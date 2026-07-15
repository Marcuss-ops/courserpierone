# `src/app/` — Next.js App Router

> Struttura principale delle route Next.js.

## Struttura

```
app/
├── admin/              # Pannello admin (products, orders, users)
├── api/                # API routes (tutte le integrazioni)
├── dashboard/          # Area riservata utente
├── login/              # Autenticazione (Google)
├── [locale]/[domain]/  # Landing page funnel per locale (dinamico)
├── privacy/            # Pagina privacy policy
├── terms/              # Pagina termini e condizioni
├── error.tsx           # Error boundary globale
├── layout.tsx          # Layout root (metadata, navbar, footer)
├── loading.tsx         # Loading globale
├── not-found.tsx       # Pagina 404
└── page.tsx            # Homepage principale
```

## `[locale]/[domain]/`

Route dinamica per landing page multilingua:

```
/it-it/amish-secrets    → Locale: it-it, Domain: amish-secrets
/fr-fr/amish-secrets    → Locale: fr-fr, Domain: amish-secrets
/ja-jp/amish-secrets    → Locale: ja-jp, Domain: amish-secrets
```

Il middleware risolve il locale e passa la richiesta alla route corretta.

## API Routes (`api/`)

| Path | Descrizione |
|---|---|
| `api/access` | Verifica accesso utente a un prodotto |
| `api/admin/orders` | CRUD ordini admin |
| `api/admin/users` | CRUD utenti admin |
| `api/analytics` | Registrazione eventi |
| `api/analytics/dashboard` | Dashboard analytics |
| `api/auth/[...nextauth]` | NextAuth handler |
| `api/certificate/[productId]` | Genera certificato |
| `api/checkout` | Crea sessione Lemon Squeezy |
| `api/cron/abandoned-checkouts` | Cron: recupero carrelli abbandonati |
| `api/ebook/[slug]/download` | Download ebook PDF |
| `api/lessons/[lessonId]/assets` | Assets per lezione |
| `api/notes` | CRUD note utente |
| `api/products` | CRUD prodotti |
| `api/progress` | Tracciamento progresso lezioni |
| `api/translate` | Traduzione GPT-4o-mini |
| `api/upload` | Upload file (immagini prodotti) |
| `api/user/orders` | Ordini utente |
| `api/webhooks/lemonsqueezy` | Webhook LemonSqueezy |