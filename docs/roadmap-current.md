# Courssy Roadmap — Current

> **Status:** Pre-V1 GA, **release bloccata**. La roadmap descrive priorità e criteri di uscita; non dichiara la repository production-ready senza una run CI verde verificata.
>
> Il vecchio [ROADMAP.md](../ROADMAP.md) è **DEPRECATED** (vedi banner in cima). Per la specifica MVP legacy vedi [docs/archive/MVP-SPEC-initial.md](archive/MVP-SPEC-initial.md).

---

## Status verificato

Questa sezione è la fonte operativa per lo stato corrente. I risultati sono riferiti al commit remoto `a49b8601f6113afb960a8722eed909943e7858ef` (`main`), verificato nella run [CI — deploy-gate #31040206880](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880). Un risultato `failure` o `skipped` non viene interpretato come pass implicito.

| Controllo | Stato verificato | Evidenza |
|---|---|---|
| Build produzione | **FAIL** | [build (production)](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880/job/92422388177) |
| Typecheck | **FAIL** | [typecheck](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880/job/92422388119) |
| Unit test | **FAIL** | [vitest](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880/job/92422388160) |
| Integration test PostgreSQL | **FAIL** | [integration-tests (postgres)](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880/job/92422388111) |
| E2E browser | **FAIL** | [e2e-journey (chrome)](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880/job/92422388194) |
| Migration check | **FAIL** | [migration-check (prisma deploy)](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880/job/92422388167) |
| Security scan | **PASS** | [security-scan (gitleaks)](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880/job/92422388030) |
| Quality gate aggregato | **FAIL** | [deploy-gate](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880/job/92422445230) |
| Deploy produzione | **SKIPPED** | [deploy-production](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880/job/92422488521) |

**Verdetto:** `main` non è verde e il deploy è correttamente rimasto bloccato. Non sono disponibili, per questo commit, evidenze CI sufficienti per dichiarare build, test, migrazioni o E2E riusciti. La security scan è l'unico controllo della tabella con esito positivo.

Per considerare la release sbloccata servono una nuova run CI verde sul commit candidato e la verifica esplicita dei job sopra indicati. Questa tabella deve essere aggiornata quando cambia il commit verificato; non sostituisce i log GitHub Actions.

---

## 1. V1 blockers

Questi item sono **gate strict** che impediscono il release V1.x GA. Le evidenze storiche non sostituiscono la verifica sul commit indicato nella sezione [Status verificato](#status-verificato).

### 1.1 Orphan Products (`Product.creatorId IS NULL`)

- **Stato:** da riverificare sul database di produzione.
- **Perché conta:** la transizione da `creatorId` nullable a required + Restrict FK richiede zero righe NULL per non rompere V1.x.
- **Evidenza storica:** un audit del 2026-07-16 riportava `orphanProducts = 0`; il dato deve essere riconfermato dopo le modifiche successive.
- **Verify gate:** `npx tsx scripts/audit-v1-readiness.ts` → `orphanProducts` deve essere `0`.
- **Drain path:** `scripts/products/backfill-primary-creator.ts` (idempotent) per assegnare ogni prodotto al primary creator.

### 1.2 Residual NextAuth Tables (`Account`, `Session`, `VerificationToken`)

- **Stato:** da riverificare sul database di produzione.
- **Perché conta:** l'autenticazione applicativa è standardizzata su Supabase Auth; eventuali tabelle NextAuth residue complicano migration e verifiche RLS.
- **Evidenza storica:** la migration `prisma/migrations/20260712220000_drop_nextauth_models/migration.sql` è presente nel repository; la sua applicazione sul database target deve essere verificata tramite migration check e introspezione.
- **Verify gate:** `npx tsx scripts/audit-v1-readiness.ts` → `accountCount + sessionCount + verificationTokenCount` deve essere `0`.
- **Drain path:** raw SQL cleanup, rimozione dei modelli da `prisma/schema.prisma`, migration `DROP TABLE` con FK CASCADE-aware.

### 1.4 Canonical SSE Stream Test Gap

- **Stato:** test presente nel tree; validazione CI corrente non riuscita.
- **Perché conta:** SSE è long-lived e complesso (heartbeat + poll + abort signal); regressioni qui devono essere visibili nei test.
- **Evidenza nel tree:** `src/app/api/conversations/[id]/stream/route.test.ts` esiste. La run CI corrente è comunque in stato failure, quindi non viene marcato come gate superato.
- **Verify gate:** il test deve essere incluso in una run Vitest verde e la suite E2E/SSE deve completare senza failure.
- **Drain path:** mantenere i casi 400 missing id, 401 anon, 403 non-member, 200 happy path, heartbeat cycle e `since` invalid.

### 1.5 TypeScript baseline

- **Stato:** **aperto**: il job `typecheck` della run verificata è fallito.
- **Perché conta:** errori in strict mode bloccano la build e possono nascondere regressioni.
- **Verify gate:** `npm run typecheck` deve terminare con exit code `0` in una run CI verde.
- **Drain path:** analizzare i log del job [typecheck](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880/job/92422388119) e correggere gli errori residui senza abbassare il livello strict.

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
| P0 | CI non verde su build, typecheck, test, migration ed E2E | Analizzare la [run CI verificata](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880), correggere le cause e ripetere tutti i gate sul nuovo commit. |
| P1 | Typecheck baseline | Fix types nei file indicati dai log CI, mantenendo `strict` e verificando `npm run typecheck`. |
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

- `a49b8601f6113afb960a8722eed909943e7858ef` — status verificato su [CI — deploy-gate #31040206880](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880): security scan passata; build, typecheck, unit, integration, migration, E2E e deploy-gate falliti; deploy-production skipped.
- `cfb2d12` — `chore(dm): delete legacy /api/messages routes + shim, consolidate on /api/conversations`
- `e85c65c` — `refactor(dm): migrate ChatView to canonical /api/conversations endpoints`
- `cb9e9e4` — `perf(db): drop redundant @@index([creatorId]) covered by [creatorId, status] leftmost`
- `9f6a16db5cad21793214988ac901c96dd5dd9c56` — `docs: align roadmap with verified CI status`
