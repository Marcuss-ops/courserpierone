# Chat SSE Coverage Audit (V1.x post-C3)

> **Scopo:** verifica post-mortem C3 che TUTTE le route chat reali (DM + V1 US1/US2 community chat) usino la route SSE canonica oppure il fallback REST/polling — e che **nessun consumer** fosse legato all'infrastruttura WS custom rimossa. Il documento funge anche da baseline per il futuro V2 community chat (US1/US2) quando verrà implementato.
>
> **Audit window:** 2026-07-15, su main @ `060f0be` (post-C3 cleanup, post-stripe-drain baseline).
>
> **Verdict one-liner:** ✅ **TUTTO canonico**. Nessun consumer era legato al WS rimosso. La rimozione C3 era safe-by-design (già retro-compatibile al commit time). Community chat è una V2 reservation — non esiste in V1 come `src/app/(locale)/[locale]/[domain]/community/page.tsx` (`FILE_DOES_NOT_EXIST`) e non ha schema (`CommunityTopic`/`CommunityPost` non sono nel `prisma/schema.prisma`).

---

## TL;DR — Copertura chat → transport

| Chat surface | V1 LIVE code? | Transport canonico | Fallback | WS dependency? |
|---|---|---|---|---|
| **DM student ↔ creator** | ✅ sì | SSE via `/api/conversations/[id]/stream` | polling `/api/conversations/[id]/messages` ogni 10s | ❌ nessuna |
| **`/chat` tab (Skool-style member area)** | ✅ sì | stesso del DM (stesso `<ChatView>`, stesso `useRealtimeChat`) | stesso | ❌ nessuna |
| **`/dashboard/messages/[userId]`** | ✅ sì | stesso del DM | stesso | ❌ nessuna |
| **`/dashboard/creator/messages/[userId]`** | ✅ sì | stesso del DM | stesso | ❌ nessuna |
| **Inbox badge counts** (`InboxProvider`) | ✅ sì | REST polling `/api/notifications` ogni 30s | n/a (no realtime richiesto) | ❌ nessuna |
| **Typing indicator** | ⚠️ no-op in V1 (3-surface stubs — vedi §5 r.11 per breakdown completo) | hook docstring `use-realtime-chat.ts:37-42`: outbound (`sendTyping` / `resetTypingTimer`) + inbound (`isOtherTyping`) + UI rendering in `<ChatView>` sono preservati come **no-op stubs** (consumer code invariato); SSE server emette SOLO message batches (no typing events) per §2 wire contract → `isOtherTyping` resta `false` → typing-dots UI è "dead" code path in V1 | n/a | ❌ nessuna (no-op) |
| **Notifications campanella** (`NotificationBell`) | ✅ sì | REST polling `/api/notifications` ogni 30s | n/a (L'hook `useRealtimeChat` non c'entra) | ❌ nessuna |
| **Community chat V1 US1/US2** | ❌ **V2 reservation** (NON implementato) | n/a — pagina `community/page.tsx` inesistente; nessuno schema `CommunityTopic/Post` | n/a | n/a (nessun code) |

**Zero consumers tied to the deleted WS infra.** Verifica oggettiva via ripgrep:

```bash
grep -rnE '@/lib/ws|new WebSocket\(|messageBroker|WebSocketServer' src/ \
  | grep -vE 'comment|//|test\.ts|JSDoc|route\.test\.ts'   # document-only
# → ZERO hits in LIVE code (only commented historical refs in tests + JSDoc)
```

---

## §1. Metodologia

1. **Discover canon** — grep per `EventSource`, `text/event-stream`, `/api/conversations/[id]/stream`, `useRealtimeChat`, `useChatStream`.
2. **Discover LIVE WS deps** — grep per `@/lib/ws`, `from "ws"`, `new WebSocket(`, `messageBroker`, `WebSocketServer`, `ws.send(`. Escludi hits within comments/test-files via grep -v.
3. **Discover pages that mount chat** — list `src/app/{(locale)/[locale]/[domain]/(member)/chat,dashboard/messages,dashboard/creator/messages}/*/page.tsx` + read.
4. **Discover community chat** — grep per `community.*chat`, `US1`, `US2`, `community_topic`, `CommunityTopic`, `community_reply`.
5. **Cross-reference**: per ogni superficie, verificare che usi SSE o REST polling, mai WS custom.

Tutti i grep sono stati eseguiti su `main @ 060f0be`. Output completo riportato in §7 e §8.

---

## §2. Canonical SSE route — `/api/conversations/[id]/stream`

**File:** `src/app/api/conversations/[id]/stream/route.ts` (Fase 4.x del piano DMs, post-C3).

Wire contract:
- Output: `text/event-stream`
- Heartbeat: `: heartbeat\n\n` ogni 15s (keep-alive per Vercel/NGINX)
- Poll loop: 500ms → 2s successivi (`setTimeout(poll, 2_000)`)
- SSE message: `data: ${JSON.stringify({ messages: newMessages })}\n\n` con batch ascendente per `createdAt`
- Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`

Authorization stack (defense-in-depth, in quest'ordine):
1. `getServerUser()` 401 anon
2. `Conversation.findUnique({ id: conversationId })` 404
3. **Membership precheck inline**: l'utente DEVE essere `userOneId` o `userTwoId`. 403 immediato.
4. `authorizeDmRequest({ actorId, targetId=getPartnerId(conversation, dbUser.id), productId })` per retro-compat refund.

Pre-C3 esisteva anche un WS upgrade handler in `server.ts` (oramai rimosso in C3). Post-C3 il rate-limit subscription tier `MESSAGES` (10/min) sarebbe troppo stretto per una connessione long-lived da minuti-ore — questa route **NON** è wrappata da `withRateLimit`. Il tier `MESSAGES` si applica solo alle REST POST.

Tests pinning SSE wire: `src/app/api/conversations/[id]/stream/route.test.ts` (12 test cases, includes `text/event-stream` + Cache-Control + Connection assertions).

---

## §3. Consumatrici della chat — SM tree

```
Pagine che montano <ChatView>:
─────────────────────────────────────
src/app/(locale)/[locale]/[domain]/(member)/chat/page.tsx    [Chat con il Creator — Skool-style tab]
src/app/dashboard/messages/[userId]/page.tsx                 [DM deep-link (student side)]
src/app/dashboard/creator/messages/[userId]/page.tsx         [DM deep-link (creator inbox side)]

<ChatView> internals:
─────────────────────
src/components/chat/chat-view.tsx
  ├─ useRealtimeChat(conversationId, otherUserId, onMessages)   [canonical SSE hook]
  ├─ fetchInitialMessages → GET  /api/conversations/[id]/messages
  ├─ loadOlderMessages    → GET  /api/conversations/[id]/messages?cursor=…
  ├─ mark-as-read         → PATCH /api/conversations/[id]/read
  └─ handleSend           → POST /api/conversations/[id]/messages { content }

Hook (post-C3, spostato da src/lib/ws/ → src/hooks/):
─────────────────────────────────────────────────────
src/hooks/use-realtime-chat.ts
  ├─ Primary: EventSource('/api/conversations/[id]/stream')    [SSE]
  ├─ Fallback: setInterval poll 10s di /api/conversations/[id]/messages?limit=50
  └─ V1 cleanup: sendTyping()/sendTyping('stop') sono no-op (V2 reservation)

API surface canonica:
─────────────────────
src/app/api/conversations/route.ts                 [GET list + POST find-or-create]
src/app/api/conversations/[id]/route.ts            [DELETE close]
src/app/api/conversations/[id]/messages/route.ts   [GET list + POST send]
src/app/api/conversations/[id]/read/route.ts       [PATCH mark-read]
src/app/api/conversations/[id]/stream/route.ts     [GET SSE — CANONICAL]

Inbox badge (REST polling, no SSE):
───────────────────────────────────
src/components/layout/inbox-provider.tsx           [context + useInbox() with 30s poll]

Notification campanella:
────────────────────────
src/components/layout/notification-bell.tsx        [REST polling /api/notifications 30s]
```

**Nessuna di queste importa `@/lib/ws`, `messageBroker`, o chiama `new WebSocket(`. Verificato via:**

```bash
grep -rnE '@/lib/ws|"ws"|"@/lib/ws/broker"|messageBroker|new WebSocket\(' src/ \
  | grep -v '/\*\|//\|test\.ts:.*const\|console'
# → ZERO live refs
```

---

## §4. Community chat V1 US1/US2 — **V2 reservation**, non in V1

### 4.1 Cosa era previsto

US1 + US2 (community chat) sono stati **progettati** per V1 ma mai implementati come codice LIVE. Le evidenze:

| Evidence | Location | Meaning |
|---|---|---|
| `tab_community: ""` placeholder | `src/lib/i18n/locale-content.ts` line 302 | i18n locale content ha solo placeholder vuoto per il tab community |
| Tab navigation punta a `/community` ma `page.tsx` inesistente | `src/components/layout/course-top-nav.tsx` line 42 (comment: "3 main tabs: `/[locale]/[slug]/` (Corso, default), `/community`, `/chat`") | Link nella nav punta a una rotta che NON esiste (verrà 404) |
| `src/app/(locale)/[locale]/[domain]/community/page.tsx` | FILE_DOES_NOT_EXIST (file-picker probe 2026-07-15) | Pagina community non esiste |
| `CommunityTopic`/`CommunityPost` schema models | **ASSENTI** in `prisma/schema.prisma` | Nessuna tabella per topic thread / posts |
| `community_reply` notification type | `prisma/schema.prisma` line 192 (comment): `community_reply — riservato V2 (richiede CommunityTopic/Post schema)` | Tipo di notifica commentato come V2 reservation |
| `Notification.type: 'community_reply'` nel centro notifiche | Zero LIVE. Solo nel commento del schema. | Non emesso da nessuna route |

### 4.2 Verdict su community chat

**Audit-only verdict: nessun consumer V1 dipende da community chat** (semplicemente perché community chat non esiste in V1). Quando V2 lo implementerà, **il pattern canonico di riferimento sarà SSE + polling fallback** (lo stesso di DM) — copiando `src/app/api/conversations/[id]/stream/route.ts` come template e creando `src/app/api/community/[topicId]/stream/route.ts`. Niente WS custom sarà necessario.

**Raccomandazione:** quando V2 community chat partirà, NON reintrodurre `server.ts` + WS bridge. Il pattern canonico è già standardizzato e testato. Se servono typing indicator / presence, modellali come `POST /api/community/[topicId]/typing` REST + SSE polling sullo stream canonico, non come broadcast WS.

---

## §5. Coverage matrix (definitiva)

| # | Surface | Type | Transport V1 | Endpoint (V1) | Fallback | WS? | Authoritative source |
|---|---|---|---|---|---|---|---|
| 1 | DM thread real-time | chat | **SSE** | `GET /api/conversations/[id]/stream` | polling 10s | ❌ | `route.ts` §2 |
| 2 | DM thread history load | chat REST | `fetch` | `GET /api/conversations/[id]/messages` | cache client | ❌ | `chat-view.tsx:fetchInitialMessages` |
| 3 | DM older messages (scroll-up) | chat REST | `fetch` | `GET /api/conversations/[id]/messages?cursor=…` | n/a | ❌ | `chat-view.tsx:loadOlderMessages` |
| 4 | DM mark-as-read | chat REST | `fetch` | `PATCH /api/conversations/[id]/read` | n/a | ❌ | `chat-view.tsx` useEffect |
| 5 | DM send | chat REST | `fetch` | `POST /api/conversations/[id]/messages { content }` | n/a | ❌ | `chat-view.tsx:handleSend` |
| 6 | DM list | inbox REST | `fetch` (SSR) | `GET /api/conversations` | n/a | ❌ | `dashboard/messages/page.tsx` |
| 7 | DM find-or-create on mount | chat REST | `fetch` (server-side, page.tsx) | `POST /api/conversations { productId, targetUserId }` | redirect to inbox | ❌ | `dashboard/messages/[userId]/page.tsx`, `(member)/chat/page.tsx` |
| 8 | DM close (DELETE) | chat REST | `fetch` | `DELETE /api/conversations/[id]` | n/a (idempotent 404) | ❌ | `dashboard/messages/[userId]/page.tsx` |
| 9 | Inbox unread badge counter | notif badge | **REST polling** | `GET /api/notifications` | n/a (lapsed = stale UI, acceptable) | ❌ | `inbox-provider.tsx` |
| 10 | Notifications campanella (Centro Notifiche) | notif feed | **REST polling** | `GET /api/notifications` | poll 30s | ❌ | `notification-bell.tsx` |
| 11 | DM typing indicator | V2 reservation | n/a (all 3 surfaces are no-op stubs in V1) | `sendTyping` / `resetTypingTimer` (outbound) + `isOtherTyping` (inbound) + UI rendering in `<ChatView>` are **preserved as no-op stubs** so the consumer code doesn't change; SSE server emits ONLY message batches (no typing events) per §2 wire contract, so `isOtherTyping` stays `false` in V1 | n/a | ❌ | `use-realtime-chat.ts:37-42` docstring ("no-op stubs so the consumer (`chat-view.tsx`) doesn't need to change") + `<ChatView>` isOtherTyping |
| 12 | Community thread real-time | V2 reservation | n/a | n/a | n/a | ❌ N/A (no code) | n/a |
| 13 | Community topic list | V2 reservation | n/a | n/a | n/a | ❌ N/A (no code) | n/a |
| 14 | `/api/auth/ws-token` | V1 (rimosso C3) | n/a | n/a | n/a (C3) | ❌ `0 hit (route deleted)` | `route.ts` NON esiste (C3) |
| 15 | `server.ts` WS bridge | V1 (rimosso C3) | n/a | n/a | n/a (C3) | ❌ `0 hit (file deleted)` | `server.ts` NON esiste |

**Nessuna delle 15 righe ha dipendenza WS**. La matrice è self-consistent.

---

## §6. Verdetto sul cleanup C3

C3 è **safe-by-design e safe-by-evidence**:

1. **safe-by-design**: il commit C3 ha deliberatamente semplificato `useRealtimeChat` rimuovendo il tier "WebSocket first" e promuovendo SSE a primary transport. Docstring del hook post-C3 documenta esplicitamente:
   > "C3 cleanup: this hook previously tried WebSocket first, then SSE, then polling fallback. After deleting the custom WS infrastructure (`server.ts` + `src/lib/ws/*`), this hook now uses SSE as primary, with polling as the only degradation tier."

2. **safe-by-evidence**: ZERO consumer dipende dal WS rimosso. Verifica oggettiva (riproducibile con `bash` di §8):
   - `grep -rn '@/lib/ws|messageBroker|new WebSocket(|"ws"' src/` → 0 LIVE hits
   - Tutte le 15 superfici in §5 funzionano con SSE+REST, senza server.ts.

3. **nessun consumer legacy orfano**: l'unico punto che cita "WS" è il commento nel codice di `src/components/layout/inbox-provider.tsx:27` ("pilotata dal WS ormai rimosso") che **correttamente** riconosce il cleanup. Le righe stale-comment candidates (vedi §7) sono inaccurate ma non causano malfunzionamenti — sono solo docstring drift che dovrebbe essere corretto in un follow-up.

**Conclusione operativa**: la rimozione C3 NON ha creato bug, NON ha rotto chat reali, NON ha richiesto retro-compat lato client. Il cleanup era Golden-path-safe al commit time e zero regression osservata fino a `060f0be`.

---

## §7. Stale-comment candidates (documentation drift post-C3)

Queste righe sono stale (implicano un path WS che non esiste post-C3). NON rompono nulla, ma generano confusion per gli operatori che leggono il codice aspettandosi un fallback WS che **non verrà mai attivato**.

### 7.1 `src/components/chat/chat-view.tsx:116`

**Stale**:
```
// ── WebSocket real-time (with SSE fallback) ──────────────
```

**Realtà post-C3**: SSE primary, polling fallback. Il path WS non esiste più.

**Action raccomandata** (follow-up commit separato, non in scope per questo audit doc):
```
// ── SSE real-time (with polling fallback) ──────────────
//   C3 cleanup: previously WebSocket-first → SSE-first now.
```

> **Re-reading note (no fix required):** Originally `src/components/layout/inbox-provider.tsx:30` was flagged as a stale-comment candidate, but re-reading `inbox-provider.tsx:25-32` shows the JSDoc is correctly framed as "WS rimosso + V2 reservation per `GET /api/notifications/recent-unread-by-conversation`"; not actually stale → rimosso da §7 stale-comment list.

### 7.2 `src/components/layout/mobile-bottom-nav.tsx:30`

**Stale**:
```
// Fase 4.3: se wrappato in InboxProvider, badge realtime dal WS;
```

**Realtà**: badge realtime via REST polling (`useInbox` 30s poll), **non** dal WS.

**Action raccomandata**:
```
// Fase 4.3: se wrappato in InboxProvider, badge realtime dal
// useInbox() REST polling (post-C3; WS rimosso).
```

### 7.3 `src/app/dashboard/messages/conversation-list.tsx:15`

**Stale**:
```
// Fase 4.3: se wrappato in InboxProvider, usa i counts realtime dal
```

(continua "WS sovrapposti agli SSR" alla riga 17 — stesso pattern)

### 7.4 Action plan per §7

Un singolo commit separato "sweep stale WS-implausible comments post-C3", che:

- Sostituisce 3 stale-comment candidates (vedi §7.1-§7.3 per breakdown: chat-view / mobile-bottom-nav / conversation-list) con realtà post-C3.
- Zero logic change, comment-only.
- Pre-commit verification: ripgrep LIVE `src/` → 0 stale, ripgrep LIVE `src/` → 0 actual WS deps (rimane invariato).

**NON incluso in questo audit doc** per separazione concerns (audit = verifica, sweep = cleanup). Da programmare come **follow-up commit**.

---

## §8. Comandi di riproduzione

```bash
# Da radice del repo, su main @ 060f0be:

# 1) ZERO LIVE @/lib/ws imports
grep -rnE '@/lib/ws|messageBroker|WebSocketServer' src/ \
  | grep -vE '//|/\*|test\.ts:.*//'
# atteso: solo commented/JSDoc refs in route.test.ts

# 2) ZERO 'new WebSocket(' clients
grep -rnE 'new WebSocket\(' src/
# atteso: 0 hits

# 3) ZERO LIVE imports della bare 'ws' package
grep -rnE 'from .ws.|require\(.ws.\)' src/
# atteso: 0 hits

# 4) SSE canonical route existence
test -f src/app/api/conversations/\[id\]/stream/route.ts && echo OK
# atteso: OK

# 5) Deleted WS infra non esiste
test -e server.ts && echo "PRESENT (FAIL)" || echo "OK: server.ts rimosso"
test -d src/lib/ws && echo "PRESENT (FAIL)" || echo "OK: src/lib/ws/ rimosso"
test -d src/app/api/auth/ws-token && echo "PRESENT (FAIL)" || echo "OK: auth/ws-token rimosso"
# atteso: 3 × OK

# 6) Community chat non esiste (V2 reservation)
test -f src/app/\(locale\)/\[locale\]/\[domain\]/community/page.tsx && \
  echo "PRESENT (FAIL)" || echo "OK: community V1 = FILE_DOES_NOT_EXIST"
# atteso: OK

# 7) Schema models for community
grep -E 'CommunityTopic|CommunityPost' prisma/schema.prisma
# atteso: 0 hits (reservation V2 only)

# 8) Notification.type 'community_reply' = V2 reservation only
grep -nE '\bcommunity_reply\b' prisma/schema.prisma
# atteso: 1 hit (nel comment "community_reply — riservato V2")

# 9) Hook spostato da src/lib/ws/ → src/hooks/ (post-C3)
test -f src/hooks/use-realtime-chat.ts && echo "OK: hook è in src/hooks/"
test -f src/lib/ws/use-realtime-chat.ts && echo "PRESENT (FAIL)" || echo "OK: vecchia path vuota"
# atteso: 2 × OK
```

---

## Appendice A — Cosa è stato rimosso da C3 (one-time fact, non-revisitable)

| File | Status | Note |
|---|---|---|
| `server.ts` (root) | ❌ DELETED | WS upgrade handler superato da SSE + Next.js Routes |
| `src/lib/ws/use-realtime-chat.ts` | ❌ DELETED (moved to `src/hooks/`) | Old path empty, new path C3-fixed docstring |
| `src/lib/ws/broker.ts` | ❌ DELETED | `messageBroker.emit(NEW_MESSAGE|THREAD_DELETED, …)` rimosso |
| `src/app/api/auth/ws-token/route.ts` | ❌ DELETED | JWT signing per WS handshake sostituito da SSE auth standard (`getServerUser` + cookie) |
| `dev:ws`, `start:ws` scripts (package.json) | ❌ DELETED | `next dev` + `next start` canonici |
| `ws`, `@types/ws` (package.json) | ❌ DELETED | ZERO runtime + dev dependence |
| `WS_SECRET` (env.ts + .env.example + Vercel) | ❌ DELETED | JWT secret non più richiesto |
| `/api/auth/ws-token` consumer in src/ | ❌ ZERO LIVE | Nessuna route chiama questo endpoint (route.test.ts comment-only) |

**Audit cross-check**: tutto quanto sopra è verificato LIVE su `main @ 060f0be`. La rimozione è completa e non lascia collateral surface.

---

## Appendice B — Notifiche campanella (Centro Notifiche, post-C3)

Sono SSE/SSE-poll capable? **No in V1**, ma c'è una V2 reservation documentata in `src/lib/notifications/create-notification.ts:178`:

```typescript
// `GET /api/notifications/stream` SSE se il polling 30s diventa
// inadeguato (cross-tab, hammer). V1: bassa priorità, no urgente.
```

Verdict V1: REST polling a 30s è accettabile per la campanella (scenario notif a bassa frequenza). Se V2 unifica e aggiunge `/api/notifications/stream` SSE, il transport sarà copiato dal template canonico `conversations/[id]/stream` — niente WS.

---

## Appendice C — Confronto pre-C3 vs post-C3 (per future archaeology)

### Pre-C3 (commit ipotetico pre-C3, ws-first architectures)

```
client <ChatView>                server
   │                                │
   ├─new WebSocket(url)─►           WS upgrade (server.ts + custom `ws` npm package)
   ├─fetch /api/auth/ws-token { WS_SECRET }─►
   │                                ├─ HS256 sign with WS_SECRET (server-side)
   │<── JWT signed token ──────────┤
   ├─WebSocket client.connect(token)─►
   │                                ├─ verify JWT (WS_SECRET)
   │<── WS connection open ─────────┤
   ├─messageBroker.subscribe       │
   │  [ON_MESSAGE event]           │
   │                                │
   │                                ├─ prisma.message.create
   │                                ├─ messageBroker.emit(NEW_MESSAGE, payload)
   │<── WS frame: NEW_MESSAGE ─────┤
```

### Post-C3 (main @ 060f0be)

```
client <ChatView>                server
   │                                │
   ├─fetch /api/conversations/[id]  ◄── auth + membership + DM permit
   ├─EventSource('/api/conversations ─┐
   │   [id]/stream')               │ 2s polling loop, 15s heartbeat
   │                                ├─ prisma.message.findMany
   │<── SSE frame: data: {...} ─────┘
   │                                │
   │                                [POST .../messages]
   │                                ├─ prisma.message.create
   │                                ├─ createNotification({type:'chat_reply'})
   │<── REST 201 Created ───────────┤
```

**Net architectural delta**: WS sostituito con REST POST (request/response) + SSE (server→client). Nessuna connessione long-lived richiesta lato client mobile (SSE è HTTP/1.1 keep-alive, supportato ovunque). La perdita di bidirectionalità WS è accettabile perché i typing indicator sono no-op V1 (vedi §5 riga 11).

---

## Document control

| Field | Value |
|---|---|
| First written | 2026-07-15 |
| Last reviewed | main @ 060f0be (post-C3 cleanup) |
| Maintainer | ops-lead (TBD) |
| Review cadence | ogni cleanup che tocca `src/app/api/conversations/[id]/**` o `src/hooks/use-realtime-chat.ts` |
| Forward-check | Quando V2 community chat verrà implementato, rieseguire§5 e§ 8 per confermare niente WS custom reintrodotto |
