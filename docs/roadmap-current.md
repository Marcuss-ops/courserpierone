# Courssy Roadmap — Current

> **Status:** Pre-V1 GA. Priorità: drenare legacy data (NextAuth tables) dal DB di produzione, stabilizzare test/typecheck suite, completare architettura DM/Conversation canonica.
>
> Il vecchio [ROADMAP.md](../ROADMAP.md) è **DEPRECATED** (vedi banner in cima). Per la specifica MVP legacy vedi [docs/archive/MVP-SPEC-initial.md](archive/MVP-SPEC-initial.md).

---

## 1. V1 blockers

> **STATUS 2026-07-16:** all 4 V1 blockers (§1.1, §1.2, §1.4, §1.5) are **CLOSED**. `npx tsx scripts/audit-v1-readiness.ts` returns GREEN. Evidence captured in commit `docs(v1): close all 4 V1 blockers per audit-v1-readiness (GREEN)`:
>
> - §1.1 Orphan Products = 0 rows. DB-direct psql `SELECT count(*) FROM "Product" WHERE "creatorId" IS NULL` → 0.
> - §1.2 NextAuth tables absent. Migration `prisma/migrations/20260712220000_drop_nextauth_models/migration.sql` applied; tables `Account` / `Session` / `VerificationToken` no longer present.
> - §1.4 SSE Stream Test Gap closed. `src/app/api/conversations/[id]/stream/route.test.ts` exists (402 lines). Vitest dispatch (`npx vitest run src/app/api/conversations/[id]/stream/route.test.ts`) → 15/15 PASS, exit 0.
> - §1.5 TypeScript baseline = 0 errors. `npx tsc --noEmit` → TSC_EXIT=0.

Questi item sono **gate strict** che impediscono il release V1.x GA. Devono essere a zero prima che il `prisma/schema.prisma` venga locked.

### 1.1 Orphan Products (`Product.creatorId IS NULL`)

- **Why it matters:** Phase 1.2 ha aggiunto `creatorId` nullable per backfill. Lo step successivo è renderlo **required + Restrict FK**: serve zero NULL rows per non rompere V1.x con il rollback di `Required` constraint.
- **Verify gate:** `npx tsx scripts/audit-v1-readiness.ts` → `orphanProducts` count deve essere `0`.
- **Drain path:** `scripts/products/backfill-primary-creator.ts` (idempotent) per assegnare ogni prodotto al primary creator.

### 1.2 Residual NextAuth Tables (`Account`, `Session`, `VerificationToken`)

- **Why it matters:** Auth ora è 100% Supabase. Le 3 tabelle NextAuth rimaste sono debito puro: occupano spazio + complicano migrations + mascherano regressioni RLS.
- **Verify gate:** `npx tsx scripts/audit-v1-readiness.ts` → somma `accountCount + sessionCount + verificationTokenCount` deve essere `0`.
- **Drain path:** Raw SQL cleanup, rimozione modelli da `prisma/schema.prisma`, migration `DROP TABLE` con FK CASCADE-aware.

### 1.4 Canonical SSE Stream Test Gap

- **Why it matters:** `src/app/api/conversations/[id]/stream/route.ts` (creato in `e85c65c`) **non ha companion test**. SSE è long-lived e complesso (heartbeat + poll + abort signal) — regressioni qui sarebbero invisibili.
- **Verify gate:** `src/app/api/conversations/[id]/stream/route.test.ts` esiste + passa in CI.
- **Drain path:** Test mirror del legacy `src/app/api/messages/stream/route.test.ts` (ora cancellato). Casi: 400 missing id, 401 anon, 403 non-member, 200 happy path + heartbeat cycle + `since` invalid.

### 1.5 TypeScript pre-existing errors (~15 baseline)

- **Why it matters:** `npm run typecheck` segnala 15 errori bloccanti in `strict mode`. Rompe DX (CI flakes), nasconde regressioni.
- **Verify gate:** `npm run typecheck` → 0 errors.
- **Drain path:** Fix specifici per `src/app/(locale)/[locale]/[domain]/download/page.tsx`, `src/app/api/access/route.test.ts`, `src/app/api/products/products.test.ts`, `src/app/dashboard/page.tsx`.

---

## 2. Post-V1

Feature esplicitamente rinviate a release successive.

### V1.1 (≤ 6 mesi)

- **Strict creator-product scoping DB-level** — transizione da app-layer permission checks a query strict / Postgres RLS per garantire che un creator possa leggere/mutare SOLO i propri `Product` rows.
- **Formalize admin CLI scripting** — `scripts/admin-promote.ts` (role promotion) e altri operator script. Sostituisce `npx tsx -e "..."` injections.
- **Audit logging (`AuditEvent` table)** — log structured di role changes + admin overrides per security trailing.
- **Per-severity alert routing** — split di `ALERT_WEBHOOK_URL` in `P0` / `P1` / `P2` webhooks per ridurre Slack noise da CI fail cosmetici.

### V2 (≤ 12 mesi)

- **Soft-archive products** — da `CASCADE` su Conversation.delete a **RESTRICT** + flag `archivedAt`. Protegge historical DMs quando un creator dismette un corso legacy.
- **Multi-creator associations (M:N)** — sostituzione di `Product.creatorId` (1:1) con junction table `ProductCreator` per supportare co-authored courses e revenue sharing complessi.

---

## 3. Tech debt (ordine priorità)

| Priority | Item | Action |
|---|---|---|
| P0 | Flaky rate-limit assertions (~3 fail in route.test.ts) | Tests expect HTTP 500 ma il rate-limiter risponde 429. Update assertions a `expect(res.status).toBe(429)`. |
| P1 | Typecheck baseline ~15 errors | Fix types in `download/page.tsx` (legacy i18n keys), `access/route.test.ts`, `products.test.ts`, `dashboard/page.tsx`. |
| P1 | Comment-only `@/api/messages` refs in helper modules | `use-realtime-chat.ts` line 64, `find-or-create-conversation.ts` line 6, `broker.ts` line 76, `broadcast.ts` line 43, `chat-view.tsx` line 70, `inbox-provider.tsx` line 28, `creator-inbox.tsx` line 44, `create-message.ts` lines 8/11. Tag con `(legacy removed in cfb2d12)` o converti a canonical refs. |
| P2 | Manual PITR workflow via Supabase dashboard | La CLI Supabase non ha parity per `pitr restore --to-new-project`. Documenta UI-automation o un wrapper script. |
| P2 | Hardcoded admin role promotions | `npx tsx -e "prisma.user.update(...)"` injections per promuovere admin. Sostituire con `scripts/admin-promote.ts`. |
| P3 | Commented-out placeholder test data in fixtures | Alcuni _test.ts_ hardcodano userId/email specifici anziché factory-builder. Refactor con `tests/_factories/`. |

---

## 4. Esplicitamente fuori scope

Feature **deliberatamente non pianificate** in V1.x. Se richieste, refer to these architectural constraints:

- **In-house video hosting/encoding.** Ci appoggiamo interamente a YouTube unlisted URLs (`LessonTranslation.videoUrl`). Build/store/serve HLS/DASH è troppo costoso, complesso, e a vantaggio competitivo zero per una piattaforma di corsi digitali.
- **Custom OAuth providers / password reset.** NextAuth è deprecato qui. Supabase Auth esclusivo (Magic Link + Google). No Apple/GitHub/Facebook fino a domanda esterna massiva. No custom login views on top of Supabase.
- **Multi-tenancy / marketplace.** L'app serve una singola azienda che vende prodotti localizzati diversi. NON è una piattaforma per esterni che lanciano storefront indipendenti.
- **Tax/VAT computation on-platform.** Gestito **off-platform** via Lemon Squeezy Merchant of Record. Il `Order` table si aspetta net/gross totals strettamente dal webhook del vendor.
- **SCORM / xAPI compliance.** V1.x serve solo direct video deliverability, non enterprise LMS interoperability.
- **AI adaptive content.** No course ordering basato su performance, no quiz/assessment engines. V1 è video + DM puro.
- **Mobile-native apps.** PWA è il commitment max (fatto lazy). Niente React Native né iOS/Android dedicati.

---

## Update log

- `cfb2d12` — `chore(dm): delete legacy /api/messages routes + shim, consolidate on /api/conversations`
- `e85c65c` — `refactor(dm): migrate ChatView to canonical /api/conversations endpoints`
- `cb9e9e4` — `perf(db): drop redundant @@index([creatorId]) covered by [creatorId, status] leftmost`
- (this commit) — `docs: archive obsolete MVP-SPEC, drop stale TECH-STACK, rewrite ROADMAP, refresh README`
