# Security Policy

## Modello di Minaccia

Courssy è una piattaforma single-creator per la vendita di corsi digitali con funzionalità di messaggistica diretta (DM) tra studenti e creator. L'architettura è serverless su Vercel con database PostgreSQL su Supabase.

### Attori

| Attore | Descrizione |
|---|---|
| **Visitatore** | Utente non autenticato che naviga pagine pubbliche |
| **Studente** | Utente autenticato con ruolo `student`, ha acquistato uno o più corsi |
| **Admin/Creator** | Utente autenticato con ruolo `admin`, accesso completo |
| **Attaccante esterno** | Tenta exploit senza account: XSS, CSRF, enumerazione, webhook forgery |
| **Attaccante autenticato** | Studente malevolo che tenta privilege escalation o accesso a dati altrui |

### Superfici di Attacco

| Superficie | Rischio | Mitigazione primaria |
|---|---|---|
| API pubbliche senza auth | Enumerazione utenti/corsi | Rate limiting, UUID non incrementali |
| API autenticate (studente) | Accesso a dati di altri utenti | Verifica ownership su ogni query |
| Webhook (LemonSqueezy) | Ordini falsi, replay attack | Firma crittografica, idempotency su `ProcessedWebhook` |
| Input utente (DM, profili) | XSS, HTML injection | DOMPurify server-side |
| Upload avatar | File malevoli, path traversal | Validazione tipo/dimensione, path ownership check |
| Supabase Storage | Accesso non autorizzato a file | RLS policies, presigned URLs |
| Sessioni JWT | Token theft, session hijacking | Supabase Auth gestisce rotazione e scadenza |

---

## Misure di Protezione Attive

### 1. Autenticazione e Sessione

- **Supabase Auth** con Google OAuth. I JWT vengono verificati a ogni richiesta API tramite `getServerUser()`.
- Le sessioni sono gestite lato Supabase con refresh token e scadenza configurabile.
- Il ruolo `admin` non viene mai letto dai `user_metadata` (fonte non fidata). Il ruolo è memorizzato nel database `User.role` e popolato al primo login come `"student"`.

### 2. Controllo Accessi (RBAC)

- **Admin gate** su tutte le route `/api/admin/*`:
  ```typescript
  if (!user || !dbUser || dbUser.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  ```
- **Ownership verification** su dati utente: il profilo (`/api/account/profile`) restituisce solo i dati dell'utente autenticato.
- **Conversation access control**: le API messages verificano che l'utente sia `userOneId` o `userTwoId` della conversazione. Accesso non autorizzato → `403 Forbidden`.

### 3. Protezione Dati Personali

- **Email esposta solo in route admin**: le API pubbliche (`social-proof`, `users/[username]`) non restituiscono mai `email`.
- **UUID pubblici**: tutti gli ID usano `cuid()` (non incrementali). Un attaccante non può enumerare utenti o risorse.
- **Nessun dato sensibile nei log**: i log contengono solo ID operazione, non dati utente.

### 4. Sicurezza Messaggi (DM)

- **Sanitizzazione HTML**: `DOMPurify` + `JSDOM` server-side su ogni messaggio in ingresso.
- **Tag permessi**: `b, i, em, strong, u, s, del, br, p, div, span, ul, ol, li, a, code, pre, blockquote, h1-h6`.
- **Protezione link**: `rel="noopener noreferrer"` forzato su tutti i link; `target="_blank"` solo su `http/https` (non `mailto`/`tel`).
- **Blocco**: `<script>`, event handler (`onclick`, `onerror`), `<img>`, `<iframe>`, protocollo `javascript:`.

### 5. Rate Limiting

- **Redis-backed** (`rate-limit.ts`) con fallback in-memory quando Redis non è disponibile.
- Applicato su tutte le API route critiche: messaggi, checkout, webhook, profile, avatar, analytics, presence.
- Rate limit per webhook: 20 richieste al minuto (protezione da DDoS sul webhook endpoint).

### 6. Webhook e Pagamenti

- **Verifica firma**: LemonSqueezy usa HMAC-SHA256 con `LEMONSQUEEZY_WEBHOOK_SECRET`.
- **Transazioni atomiche**: l'ordine viene creato in una singola operazione Prisma. Lo stato dell'ordine (`pending` → `completed`) viene aggiornato solo dopo verifica firma webhook.

### 7. Sicurezza File Upload (Avatar)

- **Presigned URLs**: il client carica direttamente su Supabase Storage senza passare dal server backend (zero bandwidth consumption lato server).
- **Validazione server-side**: Content-Type (`image/jpeg`, `image/png`, `image/webp`), dimensione (max 5 MB), estensione file.
- **Path ownership**: il PATCH handler verifica che il `path` inizi con `{userId}/` prima di salvare l'URL.

### 8. Infrastruttura

- **HTTPS everywhere**: Vercel forza HTTPS su tutti gli endpoint. Supabase impone TLS per il database.
- **Environment variables**: validate da `env.ts` con schema typed (critical/required/optional). Nessuna chiave hardcodata.
- **CORS**: gestito da Next.js middleware. Solo il dominio dell'app può fare richieste API.
- **Dipendenza minima da servizi esterni**: solo Supabase (auth + DB + storage) e LemonSqueezy (pagamenti).

---

## Gap Noti

I seguenti gap sono riconosciuti e prioritizzati. Pull request sono benvenute.

### 🔴 Critici

| Gap | Rischio | Priorità | Remediation |
|---|---|---|---|
| **Webhook idempotency** | Webhook duplicati possono creare ordini doppi | P0 | Tabella `processed_webhooks` con `delivery_id` unico; check prima del processing |
| **Signed URLs per video** | I link video (YouTube) sono embed pubblici senza protezione | P0 | Supabase Storage signed URLs con TTL breve; proxy lato server per i video privati |
| **Pagamento fallito** | Nessun handler per eventi LS di pagamento fallito — l'accesso non viene revocato su mancato rinnovo | P0 | Aggiungere handler webhook LS per `subscription_payment_failed` → `Order.status = "failed"` → revoca accesso |

### 🟡 Medi

| Gap | Rischio | Priorità | Remediation |
|---|---|---|---|
| **Refund auto-revoke** | Rimborso registrato ma i permessi non vengono revocati automaticamente | P1 | Webhook `charge.refunded` → `Order.status = "refunded"` → revoca accesso corso |
| **Cursor pagination** | Paginazione offset su feed/lista utenti admin; lenta con tanti dati | P1 | Sostituire `skip`/`take` con cursor-based (`where: { id: { lt: cursor } }`) |
| **Logging strutturato** | Solo `console.error`; difficile tracciare errori in produzione | P1 | Integrare un logger strutturato (Pino, Winston) con contesto (userId, requestId) |

### 🟢 Bassi

| Gap | Rischio | Priorità | Remediation |
|---|---|---|---|
| **Test di sicurezza automatizzati** | Nessun test di penetration o fuzzing nella CI | P2 | Aggiungere `npm audit` nel workflow CI, test di sicurezza con OWASP ZAP |
| **CSP headers** | Nessun Content-Security-Policy configurato | P2 | Aggiungere header CSP nel `next.config.mjs` o middleware |
| **Rate limit per IP su auth** | Il rate limiting attuale è per-endpoint, non per-IP su tentativi di login | P2 | Rate limit su `/auth/*` per IP con finestra breve (5 tentativi/min) |
| **Old avatar cleanup** | Avatar vecchi rimangono su Supabase Storage dopo il cambio | P3 | Job di cleanup o eliminazione sincrona al cambio avatar |

---

## Segnalare una Vulnerabilità

Se scopri una vulnerabilità di sicurezza, **non aprire una issue pubblica**.

Invia un'email a **security@courssy.com** con:

- Descrizione della vulnerabilità
- Passi per riprodurla
- Impatto potenziale
- Eventuali suggerimenti per la remediation

Risponderemo entro **48 ore** con una conferma di ricezione e una stima dei tempi di risoluzione.

### Safe Harbor

Chi segnala vulnerabilità in buona fede secondo questa policy:

- Non sarà soggetto ad azioni legali
- Riceverà credito pubblico (se desiderato) dopo la risoluzione
- Sarà tenuto aggiornato sullo stato della fix

Si prega di **non** esfiltrare, modificare o distruggere dati durante il test. Usare account di test quando possibile.

---

## Dipendenze e Supply Chain

- **Next.js 14+** — aggiornamenti di sicurezza tramite Dependabot/Renovate
- **Prisma 5** — migration sicure con review manuale degli SQL generati
- **DOMPurify** — sanitizzazione HTML, aggiornato all'ultima versione stabile
- **LemonSqueezy SDK/API** — aggiornato per supportare le ultime API di pagamento
- **Supabase JS SDK** — gestisce JWT verification e storage

Eseguire `npm audit` regolarmente e mantenere le dipendenze aggiornate.

---

Ultimo aggiornamento: 10 Luglio 2026
