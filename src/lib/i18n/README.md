# `i18n/` — Internationalization

> Risoluzione locale, traduzione UI, tracciamento sessione visitatore.

## File

| File | Descrizione |
|---|---|
| `locale-resolver.ts` | Risolutore locale completo (URL → cookie → YouTube → browser → IP) |
| `player-locale.ts` | Traduzioni UI del player video (`t()`) |
| `visitor-session.ts` | Sessione anonima, UTM params, referrer, visitorId |

---

## `locale-resolver.ts`

### Locale detection chain (ordine di priorità)

1. **URL** — `/fr-fr/amish-secrets` → locale esplicito ✓
2. **Cookie** — `locale` salvato dall'utente
3. **YouTube** — UTM source o referrer → mappatura canale → locale
4. **Browser** — `Accept-Language` header → risoluzione paese
5. **IP** — `x-vercel-ip-country` header → locale predefinito
6. **Fallback** — `en-us`

### Funzioni principali

```ts
import {
  resolveLocale,       // main resolver — tutti i parametri insieme
  normalizeLocale,     // "en-US" → "en-us"
  langToLocale,        // "fr" → "fr-fr"
  localeToLanguage,    // "fr-fr" → "fr"
  getCurrencyFromLocale, // "en-us" → "USD"
  isKnownLocale,       // verifica se un codice è supportato
  resolveFallback,     // risoluzione catena fallback
  parseAcceptLanguage, // parsing Accept-Language header
} from "@/lib/i18n/locale-resolver";
```

### Supported locales

71 combinazioni lingua-paese. Locale completo (`it-it`, `fr-fr`, `pt-br`) + codici lingua (`it`, `fr`, `pt`).

### Risoluzione fallback

```
pt-br → pt-pt (stessa lingua)
pt     → pt-pt
xx     → en-us (ultimo fallback)
```

### Variabili d'ambiente

```env
# Opzionali — per YouTube channel detection
YOUTUBE_CHANNEL_locale_1=UCxxxxx:fr-fr
```

---

## `player-locale.ts`

```ts
import { t } from "@/lib/i18n/player-locale";

// Traduce chiavi UI del player
const label = t("buy_now");       // → "Acquista Ora" (default it)
const label = t("buy_now", "fr"); // → "Acheter maintenant"
```

Traduzioni caricate da DB (`UiTranslation` table) con fallback a valori hardcoded.

---

## `visitor-session.ts`

```ts
import {
  getVisitorId,      // ID anonimo persistente (cookie o generato)
  parseUtmParams,    // Estrae UTM da URL
  getReferrer,       // HTTP referrer normalizzato
} from "@/lib/i18n/visitor-session";
```

### Schema cookie

```
visitor_id:    UUID v4, 1 anno di vita
locale:        codice locale scelto, 30 giorni
yt_channel:    ID canale YouTube di provenienza
```

### URL params tracciati

`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `channel`