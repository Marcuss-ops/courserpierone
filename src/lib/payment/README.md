# `payment/` — Payment Integrations

> Stripe e LemonSqueezy — wrapper per API e webhook processing.

## File

| File | Descrizione |
|---|---|
| `stripe.ts` | Client Stripe singleton (`getStripe()`) |
| `lemonsqueezy.ts` | Client LemonSqueezy, Store ID, checkout helpers |

---

## Stripe (`stripe.ts`)

```ts
import { getStripe } from "@/lib/payment/stripe";

const stripe = getStripe();
// usa stripe.customers, stripe.paymentIntents, stripe.webhooks ...
```

**Variabili d'ambiente richieste:**
```env
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...   # per frontend (opzionale)
```

**API routes correlate:**
- `POST /api/webhooks/stripe` — webhook per payment events
- `POST /api/checkout` — creazione payment intent / checkout session

**Eventi webhook Stripe tracciati:**
- `checkout.session.completed` → crea/aggiorna ordine + genera accesso
- `checkout.session.expired` → marca checkout come scaduto

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
  → /api/checkout (crea sessione Stripe/LS)
  → Redirect a Stripe/LS checkout
  → Pagamento completato
  → Webhook (Stripe o LS)
  → processOrder() in order-service.ts
  → Crea/aggiorna Order + UserProduct
  → Invia email conferma (locale dal checkout)
```

## Servizio ordini

```ts
import { processOrder } from "@/lib/services/order-service";

// Crea ordine da webhook Stripe/LS
await processOrder({
  provider: "stripe" | "lemonsqueezy",
  providerId: "evt_...",
  productId: "prod_...",
  email: "user@example.com",
  amount: 9700,         // in centesimi
  currency: "EUR",
  locale: "it-it",
  userId: "user_123",   // opzionale
});
```