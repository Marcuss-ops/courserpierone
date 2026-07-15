# `services/` — Business Logic Services

> Logica di business: gestione ordini, invio email transazionali.

## File

| File | Descrizione |
|---|---|
| `order-service.ts` | Elaborazione ordini (crea/aggiorna Order + UserProduct + accesso) |
| `email.ts` | Email transazionali localizzate (acquisto, abbandono) |

---

## `order-service.ts`

```ts
import { processOrder } from "@/lib/services/order-service";
```

### `processOrder(params)`

Elabora un ordine da webhook LemonSqueezy.

```ts
await processOrder({
  provider: "lemonsqueezy",
  providerId: "evt_xxx",
  productId: "prod_amish123",
  email: "mario@esempio.com",
  amount: 9700,        // centesimi
  currency: "EUR",
  locale: "it-it",
  userId: "opt",
  metadata: { channel: "youtube_fr" }
});
```

**Cosa fa:**
1. Cerca Ordine esistente per `provider + providerId` → skip se già processato
2. Trova o crea `User` tramite email
3. Crea `Order` record
4. Crea/aggiorna `UserProduct` (accesso al corso)
5. Invia `sendPurchaseConfirmation()` con locale corretto
6. Restituisce `{ order, user }`

**Idempotenza:** se l'ordine è già stato processato (stesso `providerId`), restituisce l'ordine esistente senza duplicare.

---

## `email.ts` — Email System locale-aware

```ts
import {
  sendPurchaseConfirmation,
  sendAbandonedCheckoutEmail,
} from "@/lib/services/email";
```

### `sendPurchaseConfirmation(email, product, courseUrl, locale?)`

Email conferma acquisto — locale-aware con 7 lingue.

### `sendAbandonedCheckoutEmail(email, product, checkoutUrl, locale?)`

Email recupero carrello abbandonato — locale-aware.

### Lingue supportate

| Lingua | Codice | Template |
|---|---|---|
| Italiano | `it` | ✅ completo |
| Inglese | `en` | ✅ completo |
| Francese | `fr` | ✅ completo |
| Tedesco | `de` | ✅ completo |
| Spagnolo | `es` | ✅ completo |
| Portoghese | `pt` | ✅ completo |
| Giapponese | `ja` | ✅ completo |

**Fallback chain:** `locale → languageCode → en → it`

### Variabili d'ambiente (SMTP)

```env
EMAIL_SERVER_HOST=smtp.gmail.com
EMAIL_SERVER_PORT=587
EMAIL_SERVER_USER=
EMAIL_SERVER_PASSWORD=
EMAIL_FROM=noreply@courser.app
```

Se SMTP non è configurato, le email vengono loggate in console invece di essere inviate (utile in dev).