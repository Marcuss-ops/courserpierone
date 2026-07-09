# Architettura del Progetto

## Visione Generale

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Homepage │  │  Store   │  │  Course  │              │
│  │  (i18n)  │  │  (i18n)  │  │  Player  │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    API LAYER (tRPC / REST)              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Auth &   │  │ Payments │  │ Content  │              │
│  │ Users    │  │ (Stripe) │  │ Delivery │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                   DATABASE (PostgreSQL)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │ Products │  │  Orders  │  │  Users   │              │
│  │ & i18n   │  │ & Stripe │  │ & Access │              │
│  └──────────┘  └──────────┘  └──────────┘              │
└─────────────────────────────────────────────────────────┘
```

## Componenti Core

### 1. Sistema di Localizzazione (i18n)

- **Database**: Ogni entità (prodotto, lezione, PDF) ha un campo `locale` e un JSON di traduzioni
- **Routing**: Prefisso URL per lingua (`/it/corso`, `/en/course`, `/es/curso`)
- **Content delivery**: API restituisce la versione nella lingua richiesta
- **Fallback**: Se una traduzione non esiste, mostra la lingua primaria

### 2. Gestione Prodotti Digitali

- **Asset principale**: Video hosted (YouTube/Vimeo embed o player custom)
- **Tracce audio**: File MP3 collegati alla lezione, selezionabili per lingua
- **PDF localizzati**: Un file per lingua, generato o caricato manualmente
- **Metadata**: Titolo, descrizione, tags — tutti tradotti

### 3. Checkout & Pagamenti

- **Stripe Checkout**: Pagina di pagamento hosted da Stripe
- **Valuta dinamica**: Rilevamento automatico dal browser/posizione utente
- **Tasse**: Stripe Tax gestisce automatically VAT/sales tax
- **Consegna automatica**: Webhook Stripe → verifica pagamento → accesso al contenuto

### 4. Accesso & Utenti

- **Auth**: Supabase Auth (Google OAuth)
- **Ruoli**: Admin, Creator, Student
- **Dashboard utente**: Lista acquisti, download PDF, progresso corsi
- **Area admin**: Gestione prodotti, ordini, analytics

### 5. Analytics & Tracking

- **Eventi**: Pageview, acquisto, completamento lezione, download
- **Source tracking**: Parametri URL da YouTube (`?utm_source=youtube&utm_campaign=nome_canale`)
- **Dashboard**: Revenue per lingua, conversioni per canale, top prodotti
- **Integrazione**: PostHog self-hosted o Umami per privacy

## Flusso Utente (Funnel)

```
YouTube Video (link in descrizione)
    │
    ▼
Landing Page (i18n) ──── Prezzo localizzato
    │
    ▼
Stripe Checkout ──── Valuta + Tasse automatiche
    │
    ▼
Webhook Confirmation
    │
    ▼
Email Benvenuto + Credenziali
    │
    ▼
Dashboard Utente ──── Accesso corsi, PDF, download
```

## Flusso Contenuto (Creator)

```
Carica Video (YouTube/Vimeo URL)
    │
    ▼
Aggiungi Tracce Audio (per lingua)
    │
    ▼
Carica PDF (per lingua)
    │
    ▼
Compila Metadata (titolo, descrizione — per lingua)
    │
    ▼
Pubblica ──── Auto-genera pagine in tutte le lingue
```

## Scalabilità

| Componente | Strategia |
|---|---|
| Video streaming | YouTube/Vimeo embed (MVP) → player custom (fase 3+) |
| Database | PostgreSQL + connection pooling |
| File storage | Cloudflare R2 / S3 per PDF e audio |
| CDN | Cloudflare per asset statici |
| Pagamenti | Stripe (gestisce tutto) |
| Email | Resend / SendGrid (transactional) |
| Hosting | Vercel (Next.js) o self-hosted Docker |
