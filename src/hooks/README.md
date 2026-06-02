# `src/hooks/` — React Hooks

> Custom hooks per analytics e tracciamento.

## File

| Hook | Descrizione |
|---|---|
| `use-analytics.ts` | Hook per tracciamento eventi analytics lato client |

## `use-analytics.ts`

```tsx
import { useAnalytics } from "@/hooks/use-analytics";

const { stats, track, trackPageView, trackClickBuy, trackPurchase } = useAnalytics(productId);
```

### Eventi tracciabili

| Evento | Metodo |
|---|---|
| Pageview | `trackPageView()` |
| Click acquisto | `trackClickBuy()` |
| Checkout aperto | `trackCheckoutStart()` |
| Acquisto completato | `trackPurchase(amount)` |
| Lezione completata | `trackLessonComplete(lessonId)` |

### API routes utilizzate

- `POST /api/analytics` — registra evento
- `GET /api/analytics/dashboard?productId=...` — carica stats

### Schema DB

```prisma
model AnalyticsEvent {
  id         String   @id @default(cuid())
  eventType  String   # pageview, click_buy, purchase, lesson_complete...
  productId  String?
  userId     String?
  sessionId  String?
  metadata   Json?
  createdAt  DateTime @default(now())
}
```