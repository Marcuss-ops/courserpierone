# Courssy Roadmap — Current

> **Status:** Pre-V1 GA, **release bloccata**. La roadmap descrive priorità e criteri di uscita; non dichiara la repository production-ready senza una run CI verde verificata.
>
> Il vecchio [ROADMAP.md](../ROADMAP.md) è **DEPRECATED** (vedi banner in cima). Per la specifica MVP legacy vedi [docs/archive/MVP-SPEC-initial.md](archive/MVP-SPEC-initial.md).

---

## Status verificato

Questa sezione separa le evidenze locali dalla CI remota. L'ultimo candidato verificato localmente è `c2e0f87` (`main` locale, suite release del 2026-08-06); il branch non è stato pubblicato perché il push è stato rifiutato dal token OAuth privo dello scope `workflow`. Un controllo non eseguito o bloccato non viene interpretato come pass implicito.

### Verifica locale del candidato `c2e0f87`

| Controllo | Stato verificato | Evidenza / limite |
|---|---|---|
| `npm ci` | **PASS** | Installazione dal lockfile completata |
| Typecheck | **PASS** | `npm run typecheck` exit 0 |
| Lint | **PASS** | `npm run lint` exit 0 |
| Unit test | **PASS** | 2.041 test superati |
| `npm run check` / DoD | **PASS** | Quality gate 0 failure, 7 warning |
| Build produzione | **PASS** | `npm run build` exit 0 |
| Audit dipendenze | **PASS** | `npm audit --audit-level=high`: 0 vulnerabilità |
| Deploy-gate shape | **PASS** | Verificata solo la forma/configurazione del gate |
| Migration safety scan | **PASS** | Scanner distruttività eseguito |
| Integration test PostgreSQL | **NON ESEGUITO** | Docker/PostgreSQL non disponibili: daemon Docker non raggiungibile |
| Migration deploy reale | **NON ESEGUITO** | Richiede PostgreSQL disponibile |
| Audit v1 su database | **NON ESEGUITO** | Richiede database vuoto/copia/staging raggiungibili |
| E2E browser e SSE | **BLOCCATO** | Playwright/webserver avviati; fixture Prisma bloccate da PostgreSQL non raggiungibile |
| Gitleaks | **NON ESEGUITO** | CLI non installata localmente; nessuna conclusione sul secret scan |
| CI remota / deploy-gate del candidato | **NON VERIFICATO** | Il candidato non è stato pubblicato su GitHub |

### Ultima evidenza CI remota disponibile

La run [CI — deploy-gate #31040206880](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880), sul commit remoto `a49b8601f6113afb960a8722eed909943e7858ef`, ha riportato:

- **PASS:** security scan Gitleaks;
- **FAIL:** build, typecheck, unit test, integration PostgreSQL, migration check, E2E e deploy-gate;
- **SKIPPED:** deploy-production.

Questi risultati appartengono a quel commit remoto e non certificano né invalidano automaticamente il candidato locale `c2e0f87`. Non esiste ancora una run GitHub Actions verde per il candidato documentato qui.

**Verdetto:** la release resta **bloccata**. I gate locali superati non sostituiscono integration test, migration deploy, audit database, E2E/SSE, Gitleaks e deploy-gate remoto non eseguiti. Il deploy non deve essere dichiarato pronto finché una nuova run CI sul commit candidato non verifica esplicitamente tutti i job richiesti.

Questa tabella deve essere aggiornata quando cambia il commit verificato; non sostituisce i log GitHub Actions.

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

- **Stato:** **storicamente fallito nella CI remota del commit `a49b8601...`; superato localmente dal commit candidato `c2e0f87`** con `npm run typecheck` exit 0.
- **Perché conta:** errori in strict mode bloccano la build e possono nascondere regressioni.
- **Verify gate:** `npm run typecheck` deve terminare con exit code `0` in una run CI verde sul commit candidato.
- **Drain path:** pubblicare il candidato con un token autorizzato e verificare il job [typecheck](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880/job/92422388119) in una nuova run, senza abbassare il livello strict.

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

- `c2e0f87` — commit candidato verificato localmente: gate statici, unit, build, audit dipendenze e migration safety scan passati; PostgreSQL/Redis, migration deploy reale, audit database, E2E/SSE, Gitleaks e CI remoto non eseguiti o bloccati; push rifiutato per scope OAuth `workflow`.
- `a49b8601f6113afb960a8722eed909943e7858ef` — status verificato su [CI — deploy-gate #31040206880](https://github.com/Marcuss-ops/courserpierone/actions/runs/31040206880): security scan passata; build, typecheck, unit, integration, migration, E2E e deploy-gate falliti; deploy-production skipped.
- `cfb2d12` — `chore(dm): delete legacy /api/messages routes + shim, consolidate on /api/conversations`
- `e85c65c` — `refactor(dm): migrate ChatView to canonical /api/conversations endpoints`
- `cb9e9e4` — `perf(db): drop redundant @@index([creatorId]) covered by [creatorId, status] leftmost`
- `9f6a16db5cad21793214988ac901c96dd5dd9c56` — `docs: align roadmap with verified CI status`
