# `payment/` — Payment Integrations

> LemonSqueezy — wrapper per API e webhook processing.

## File

| File | Descrizione |
|---|---|
| `lemonsqueezy.ts` | Client LemonSqueezy, Store ID, checkout helpers |

---

## LemonSqueezy (`lemonsqueezy.ts`)

```ts
import { initLS, getStoreId } from "@/lib/payment/lemonsqueezy";
```

**Variabili d'ambiente richieste:**
```env
LEMONSQUEEZY_API_KEY=...
LEMONSQUEEZY_STORE_ID=...
LEMONSQUEEZY_WEBHOOK_SECRET=...
```

**API routes correlate:**
- `POST /api/webhooks/lemonsqueezy` — webhook per subscription/one-time payment
- `POST /api/checkout` — creazione checkout LemonSqueezy

**Eventi webhook LS tracciati:**
- `order_created` → crea ordine + accesso
- `subscription_created` → gestione ricorrente

---

## Ordini — flusso completo

```
Checkout (frontend)
  → /api/checkout (crea sessione LS)
  → Redirect a LS checkout
  → Pagamento completato
  → Webhook LS
  → processOrder() in order-service.ts
  → Crea/aggiorna Order + AccessGrant
  → Invia email conferma (locale dal checkout)
```

## Servizio ordini

```ts
import { processOrder } from "@/lib/services/order-service";

// Crea ordine da webhook LS
await processOrder({
  paymentProvider: "lemonsqueezy",
  providerOrderId: "...",
  productId: "prod_...",
  email: "user@example.com",
  amount: 9700,         // in centesimi
  currency: "EUR",
  locale: "it-it",
});
```
