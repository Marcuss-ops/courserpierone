# ADR 0016: Courssy as monolith-modular (architecture laws V2)

**Status:** Accepted · 2026-07-16
**Deciders:** Platform architecture review
**Parent:** [ADR-0015 — Courssy naming canonical](0015-courssy-naming-decision.md)
**Supersedes:** —
**Implements:** V2 monolith-modular strategy §1 (depenency rule + 9-domain map + no-anticipatory-folders + 5-commit workflow)

> **Decision (1-line):** Courssy evolve come **monolith-modular** su un singolo repository, organizzato in 9 domini (Identity, Catalog, Learning, Community, Messaging, Discovery, Creator Ops, Automation, Commerce). La dipendenza obbligatoria è **`UI/Route → Application UseCase → Domain rule → Port → Adapter`**; nessun folder anticipatorio vuoto; ogni refactor stream segue il **5-commit workflow canonico**. Microservizi e marketplace aperto sono esplicitamente **out of scope** V2.

---

## Context

Il V1.x ha costruito feature in modo incrementale (`src/app/api/`, `src/components/`, `src/lib/`) senza una mappa canonica dei **domini di business**. La conseguenza è un'architettura "feature-shaped" (le rotte e i componenti guidano il layout) invece di "domain-shaped" (i domini di business guidano il layout). Sintomi osservati:

- `src/lib/payment/lemonsqueezy.ts` (sostituito da `src/lib/commerce/payments/providers/lemonsqueezy/index.ts` durante il port-refactor) — due file per lo stesso provider.
- `src/lib/email.ts` vs `src/lib/messaging/create-message.ts` — entrambi gestiscono transazioni comunicative senza un owner chiaro.
- `src/lib/i18n/currency-map.ts` + `src/lib/i18n/email-templates.ts` (ora in `commerce/shared/email-templates.ts`) — template di email sparsi in moduli i18n.
- `src/lib/messaging/` contiene sia conversazioni user↔user sia notifications transazionali — due concetti diversi nello stesso folder.

V2 vuole invertire la rotta: ogni dominio di business è owner di una porzione di codice, e ogni porzione di codice è assegnata a un dominio. Niente microservizi (overhead operativo non giustificato da current MRR), niente marketplace API pubblica (V2 è platform-internal prima, marketplace-aperto dopo).

---

## Decision

### (a) Dependency rule

See [ADR-0018 — V2 Ten-Domain Boundaries](0018-ten-domain-boundaries.md) for the canonical 5-layer dependency rule (`UI → UseCase → Domain rule → Port → Adapter`) and the import matrix.

### (b) Domain map

See [ADR-0018 — V2 Ten-Domain Boundaries §a](0018-ten-domain-boundaries.md) for the canonical 10-domain map. ADR-0016 focuses on the modular-monolith shape, no-anticipatory-folders rule, and 5-commit workflow.

### Domain folder minimal shape (YAGNI)

Quando arriva la prima feature in un dominio, il folder segue questo layout minimale:

```
src/domains/<domain>/
  <domain>-types.ts          ← discriminated unions + branded types
  <feature-slug>.ts          ← UseCase (1 feature = 1 file al massimo),
                               oppure raggruppati per use case reale
  <feature-slug>/repository.port.ts         ← Port interface
  prisma-<feature-slug>-repository.ts       ← Adapter (Prisma impl)
  <feature-slug>.test.ts     ← unit test (caract + new behavior)
```

**Mai** creare folder che non hanno almeno un file concreto:

| Cartella | YAGNI fino a |
|---|---|
| `factories/` | 2+ factory calls concreti |
| `strategies/` | 2+ strategy implementations |
| `managers/` | 2+ managed entities |
| `helpers/` | 2+ helper functions che NON vivono già altrove |
| `models/`, `entities/`, `dtos/` | 1+ entità reale che richiede separazione |
| `services/` | sconsigliato: usare UseCase + Port invece |
| `interfaces/` | usare `Port` invece (più esplicito) |
| `utils/`, `common/`, `shared/` | sconsigliato: preferire colocazione |
| `index.ts` barrel re-export | bandito (causa N+1 import graph + tree-shaking issues) |

### (c) No-anticipatory-folders rule

**Regola:** *Un folder si crea quando serve un file che vi risiede. Mai prima.*

Rationale: folder anticipatori vuoti (`factories/`, `strategies/`, `managers/`, `interfaces/`, `helpers/`) sono:
- cognitive load (nuovi contributor si chiedono "dove metto questo?")
- export bait (`export * from "./factories"` diventa la norma)
- dependencies fantasma in `package.json`
- cognitive drift (il folder cambia forma rispetto ai test)

Eccezioni accettate (in code comment + ADR cross-ref):

- `[name].test.ts` colocated con l'unit test (V1.x pattern, non V2)
- `prisma-<x>.adapter.ts` come Adapter concreto se esiste già un Port
- `port.ts` se esiste già almeno un Adapter che lo implementa

### (d) 5-commit workflow template (canonico per refactor stream)

Ogni refactor che tocca codice esistente segue questa sequenza atomica su main:

```
1. Commit caractérisation test
   → "test: caratterizzo il comportamento corrente di X (caract fixture)"
   → niente modifica al codice produzione, solo test che catturano lo status quo
   → CI verde: i test caratterizzano il comportamento attuale
   → typecheck + vitest verde

2. Commit extract without behavior change
   → "refactor: estraggo X in <domain>/<feature>.ts senza modificare il behavior"
   → il test caractérisation (commit 1) ancora passa verbatim
   → typecheck + vitest verde (zero diff nel comportamento)

3. Commit new feature
   → "feat(<domain>): nuova feature minimale basata sul contratto estratto"
   → user-facing + test di behavior
   → typecheck + vitest verde

4. Commit tests + observability
   → "test(<domain>): edge cases + observability hook (audit log, metrics)"
   → + assertions che bloccano regression
   → typecheck + vitest verde

5. Commit remove old path
   → "refactor: rimuovo il vecchio path (X) ora sostituito da <domain>/<feature>"
   → + chiusura di import rimasti, deprecation notice se ci sono consumer esterni
   → typecheck + vitest verde (i test caratterizzano + i nuovi test confermano)
```

**Esempio concreto** (riferimento per i prossimi refactor):

- Commit 1: `test(orders): caract test per helper `processOrder` (pre-refactor)` → cattura status quo.
- Commit 2: `refactor(commerce): estraggo `processOrder` in `src/domains/commerce/orders/complete-order.ts` (no behavior change)` → uso-case estratto.
- Commit 3: `feat(commerce): coupon discount field on Order completion` → nuova feature.
- Commit 4: `test(commerce): edge cases (LS rate-limit retry, idempotency under concurrent retry) + audit log hook` → test + obs.
- Commit 5: `refactor(commerce): rimuovo `src/lib/services/order-service.ts` (vecchia posizione) dopo che tutti i consumer migrano` → chiusura.

---

## Consequences

**Positive:**
- **Ownership chiaro**: ogni conflict in code review si risale a un singolo dominio; ogni regression si riproduce in un singolo test caratterization.
- **No anticipatory folders**: il codebase cresce solo quanto le feature lo richiedono. Niente 20 cartelle vuote per futuri ipotetici.
- **5-commit template riduce "rewrite-the-world" urge**: il primo commit è solo test (zero behavior change), quindi l'opzione "revert tutto" è sempre disponibile.
- **Identity & Access owner dei grants**: `AccessGrant` come single source of truth (ADR-0014 atomicity boundary) è coerente con il Domain Identity V2.

**Negative (accettati):**
- **Nessuna retrofit immediata dei file V1.x**: il refactor è incrementale. I file in `src/lib/*` migrano ai domini V2 uno alla volta seguendo il 5-commit workflow. Durante la transizione entrambi i layout coesistono.
- **Anti-barrel-rule rompe alcuni pattern V1**: `index.ts` re-export è usato in molti posti V1 per ridurre gli import path. Rimuoverli è un follow-up di Fase 0.
- **CI guardrail dipendente da `eslint-plugin-import` + custom rule**: la regola dependency rule richiede una custom ESLint rule. Non-blocking per ADR-0016 ma obbligatoria per i prossimi PR che migrano file V1 → V2.
- **9-domini è V2, non V1**: il codebase V1 continua con `src/lib/`, `src/app/`, `src/components/`. La migrazione è incrementale e dura mesi. ADR-0015 + ADR-0016 sono i due PRAMI che vincolano le scelte future.

---

## Cross-references

- **[ADR-0015 — Courssy naming canonical](0015-courssy-naming-decision.md)** — il namespace V2 è `courssy/<domain>`. ADR-0015 fissa che la stringa canonica è "Courssy".
- **[ADR-0014 — Atomicity boundary for Order+AccessGrant](0014-atomicity-boundary.md)** — `Order` ↔ `AccessGrant` è canonicalmente in `src/domains/commerce/orders/` + `src/domains/identity/access-grants/` V2.
- **[ADR-0013 — Template-amish direct-import workaround](0013-template-amish-direct-import.md)** — esempio canonico di "eccezione documenta". Ogni leak boundary futuro deve avere ADR analogo.
- **[ADR-0011 — Course plugin decoupling](0011-course-plugin-decoupling.md)** — il pattern plugin-folder per `courses/<slug>/` è ortogonale ai domini V2: i plugin di course restano dove sono, ma i domain types che li descrivono vivono in `src/domains/catalog/`.
- **[docs/architecture/001-db-migrations.md](../architecture/001-db-migrations.md)** — la migration policy vincola il DBA-side dei 9 domini (in particolare Commerce + Identity dove `Order` + `AccessGrant` sono il cuore del write-path).
- **[ARCHITECTURE.md](../../ARCHITECTURE.md)** — snapshot del V1.x stack. V2 refactor avviene sotto questo snapshot senza sostituirlo retroattivamente.

---

## Verification

- `npx tsc --noEmit` — 0 errors (ADR = docs-only, nessun type impact).
- `npx vitest run` — 725/725 PASS (no test code modified).
- `npm run lint` — 0 errors / 0 warnings (no source touched).
- `wc -l docs/adr/0016-courssy-monolith-modular.md` — mini-ADR shape (~200 LOC).
- Nuova feature V2 (es. feed MVP Fase 1) si appoggia su questo ADR + ADR-0015 per i namespaces.

---

## Future work

1. **CI guardrail dependency rule**: implementare custom ESLint rule (basata su `eslint-plugin-import` + `dependency-cruiser`) che fallisce la build se un layer importa da uno "sbagliato" secondo la matrice di §a. Blocker per il primo refactor V1.x → V2.
2. **Migrazione incrementale V1.x lib → V2 domains**: refactor `src/lib/payment/*`, `src/lib/messaging/*`, `src/lib/supabase/*` verso `src/domains/{commerce,messaging,identity}/` seguendo 5-commit template. ~15-20 commit in main, Ognuno con test caratterization.
3. **`src/lib/i18n/` resta come shared infra** (non è un dominio V2 — è port-anchored locale/currency resolution). Documentare in ADR-0017 (planned).
4. **Anti-barrel-rule enforcement**: rimuovere `index.ts` re-export sparsi (es. `src/components/index.ts`). Segue lo stesso 5-commit workflow.
5. **Discovery feed MVP** (Fase 1) come primo feature V2: usa questo ADR + ADR-0015 per namespace + dependency rule. ADR-0018 (planned) documenterà il primo feature ship-to-prod V2.

6. **Microservizi V3+ (marker)**: post-V2-GA revisit se MRR × X giustifica service-deploy separato; il 9-domain boundary già canonico agevola il refactor quando arriva.

---

## Implementation log

- 2026-07-16: ADR-0016 accettato. `docs/adr/0016-courssy-monolith-modular.md` committato via questo commit. Decision 1-line "Courssy è monolith-modular con dependency rule UI→UseCase→Domain→Port→Adapter + 9-domain map + no-anticipatory-folders + 5-commit workflow" in cima.
- Follow-up: implementare custom ESLint dependency-cruiser rule (Future work §1) — blocca il primo refactor V1 → V2.
- Follow-up: Migration chain (Future work §2) pianificata ma NON in questo commit. Ogni migration sarà un set di 5 commit canonici.
