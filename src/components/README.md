# `src/components/` — UI Components

> Componenti React organizzati per dominio funzionale.

## Struttura

```
components/
├── access/     # Access gate (proteggi contenuto acquistato)
├── admin/      # Componenti admin panel (CurrencyPrices, FunnelVisualization, ImageUpload, TemplateSelector)
├── course/     # Componenti player corso (analytics, lezioni, progress, CTA)
├── funnel/     # Template landing page (4 template: lumio, h612, horizon, book-claude)
├── layout/     # Layout components (sidebar, mobile navigation)
└── ui/         # Componenti UI generici (vuoto — per future aggiunte)
```

## `access/`

```tsx
import { AccessGate } from "@/components/access/access-gate";
```

Protegge contenuto per utenti che hanno acquistato il prodotto.
Componente server-friendly — legge l'accesso lato server via API `/api/access`.

## `admin/`

Componenti per il pannello admin:
- `CurrencyPrices` — gestione prezzi multi-valuta
- `FunnelVisualization` — visualizzazione funnel vendite
- `ImageUpload` — upload copertine prodotti
- `TemplateSelector` — selezione template landing page

## `course/`

Componenti per l'area corso:
- `AnalyticsTracker` — tracciamento eventi pagina/lezione
- `LessonAssets` — download PDF/risorse per lezione
- `LessonNotes` — note per lezione
- `LessonProgressButton` — bottone progresso lezione
- `TrackLessonView` — tracciamento visualizzazione lezione
- `TrackedCtaButton` — CTA con analytics integrato
- `VideoPaywall` — paywall video per utenti senza accesso

## `funnel/`

4 template landing page con design distinti:

| Template | Stile | Uso |
|---|---|---|
| `lumio` | Minimal, bianco, focus conversioni | Default |
| `h612` | Brutalist, impatto forte | Landing ad alto contrasto |
| `horizon` | Gradient, modern, premium | Categorie generiche |
| `book-claude` | Book-focused, trust-building | Corsi ebook |

```tsx
import { FunnelRenderer } from "@/components/funnel";

// I template sono registrati in funnel/index.ts
```

## `layout/`

- `MobileSidebar` — sidebar mobile
- `SidebarToggleBtn` — bottone toggle sidebar