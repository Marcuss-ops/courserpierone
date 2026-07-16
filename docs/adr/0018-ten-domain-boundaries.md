# ADR 0018 — V2 Ten-Domain Boundaries + Canonical Dependency Rule

**Status:** Accepted · 2026-07-16
**Deciders:** Platform architecture review
**Parent:** [ADR-0015 — Courssy naming canonical](0015-coursy-naming-decision.md), [ADR-0016 — Courssy monolith-modular](0016-coursy-monolith-modular.md)
**Supersedes:** ADR-0016 §b nota ("Analytics consolidato come read-model in creator-ops/")
**Implements:** V2 monolith-modular strategy §1 (canonical dependency rule + 10-domain boundaries)

> **Decision (1-line):** Courssy V2 è organizzato in **10 domini** (Identity & Access, Catalog, Learning, Community, Messaging, Discovery, Creator Operations, Automation, Commerce, **Analytics**) con la regola di dipendenza canonica **`UI/Route → Application UseCase → Domain rule → Port → Adapter`**; la comunicazione inter-dominio è consentita **solo al livello Application UseCase** (o via event grid adapter-level); ogni dominio possiede un namespace proprio in `src/domains/<domain>/`.

---

## Context

ADR-0016 (monolith-modular) ha definito **9 domini** consolidando Analytics in `creator-ops/` come read-model. La decision V2 (post-Fase 1, quando i dati di attribuzione cross-creator diventano core) **eleva Analytics a dominio separato**: l'evoluzione YouTube ingestion → conversion funnels → cohort analysis richiede ownership dedicata, non un read-model annidato dentro Creator Ops.

L'esperienza operativa dei primi 4 commit di Fase 0 (registries sprint + V1-blocker closure) ha evidenziato che **la regola di dipendenza canonica** merita una ADR dedicata, non un sotto-paragrafo di ADR-0016:

- è la **legge architetturale numero uno** del codebase V2;
- ogni contributor deve avere UNA fonte canonica da consultare;
- le eccezioni (es. ADR-0013 Template-amish direct-import) sono giustificabili solo rispetto a un documento master.

---

## Decision

### (a) I 10 domini V2

| # | Domain | Responsibility (1-line) | V2 namespace |
|---|---|---|---|
| 1 | **Identity & Access** | Auth, users, roles, permissions, `AccessGrant` come single source of truth | `src/domains/identity/` |
| 2 | **Catalog** | Products, courses, lessons, translations, asset delivery | `src/domains/catalog/` |
| 3 | **Learning** | Progress, history, completions, notes, watchlist | `src/domains/learning/` |
| 4 | **Community** | Posts, resources, future comments (V2 minimal) | `src/domains/community/` |
| 5 | **Messaging** | Conversations user-user, messages, notifications, **offer cards** (V2 MVP) | `src/domains/messaging/` |
| 6 | **Discovery** | Feed rule-based (V2 MVP), recommendations, continue-watching | `src/domains/discovery/` |
| 7 | **Creator Operations** | Creator dashboard, audience, content mgmt, inbox, creator-scoped analytics | `src/domains/creator-ops/` |
| 8 | **Automation** | Agents (draft-first V2 MVP), jobs, approvals, publishing, retry policy canonica | `src/domains/automation/` |
| 9 | **Commerce** | Prices, checkout (`Lemon Squeezy` only V2), orders, coupons, access grant admission | `src/domains/commerce/` |
| 10 | **Analytics** | **Cross-creator attribution, YouTube ingestion, conversion funnels, cohort analysis** | `src/domains/analytics/` |

> **Differenza rispetto ad ADR-0016 §b nota:** ADR-0016 ha consolidato Analytics in `creator-ops/` come read-model. **Questo ADR eleva Analytics a dominio separato V2** (`src/domains/analytics/`). Razionale: cross-creator YouTube-ingestion data + conversion attribution + cohort analysis richiedono ownership dedicata, non un accesso di Creator Ops a eventi globali.

### (b) Regola di dipendenza canonica (DIAGRAMMA)

```
┌───────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  ── UI / Route ──────────────────────────────────────────────────────    │
│  (Next.js page, RSC, route handler, server-component)                    │
│       │                                                                   │
│       │  può importare solo                                              │
│       ▼                                                                   │
│  ── Application UseCase ──────────────────────────────────────────────    │
│  (orchestrazione: validate input, authn, side effects,                  │
│   side-domain composition)                                               │
│       │                                                                   │
│       │  può importare solo                                              │
│       ▼                                                                   │
│  ── Domain rule ────────────────────────────────────────────────────    │
│  (pure logic, no I/O, no framework imports, branded types               │
│   + discriminated unions for invariants)                                 │
│       │                                                                   │
│       │  può importare solo                                              │
│       ▼                                                                   │
│  ── Port ───────────────────────────────────────────────────────────    │
│  (interfaccia TypeScript, contratto puro, NO implementation)             │
│       │                                                                   │
│       │  implementato da                                                 │
│       ▼                                                                   │
│  ── Adapter ────────────────────────────────────────────────────────    │
│  (Prisma, OpenAI, Lemon Squeezy, email, iframe hosting, Redis, OpenAI,  │
│   event grid, etc.)                                                     │
│                                                                           │
└───────────────────────────────────────────────────────────────────────────┘

Direzione ammessa (top-down):
  UI/Route  → Application UseCase  → Domain rule  → Port  → Adapter

Direzione VIETATA (CI fail):
  ✗ UI/Route → Adapter (mai direttamente)
  ✗ UI/Route → Domain rule (UI chiama UseCase)
  ✗ Domain rule → Application UseCase (pure logic)
  ✗ Domain rule → Adapter (no upward)
  ✗ Adapter → Application UseCase / UI/Route (no upward leak)
```

#### Regole di import (CI-enforced via eslint-plugin-import + custom rule)

| From layer → To layer | Allowed | Forbidden (unless ADR-documented exception) |
|---|---|---|
| UI/Route → Application UseCase | ✅ | — |
| UI/Route → Domain rule | ❌ | UI chiama UseCase |
| UI/Route → Port | ❌ | noleak |
| UI/Route → Adapter | ❌ | MAIdirettamente |
| Application UseCase → Domain rule | ✅ | — |
| Application UseCase → Port | ✅ | — |
| Application UseCase → Adapter | ⚠️ | eccezione solo se Adapter triviale + Port aggiunge rumore |
| Domain rule → UseCase / Port | ❌ | puro logic |
| Domain rule → Adapter | ❌ | puro logic |
| Port → Implementation | ❌ | definition only |
| Adapter → Domain rule | ✅ | legge + scrive via Domain types |
| Adapter → UseCase | ❌ | Adapter invocato da UseCase |
| Adapter → UI/Route | ❌ | no upward leak |

### (c) Comunicazione cross-domain consentita

Domini V2 **comunicano SOLO via**:

1. **Application UseCase orchestration** — un UseCase di dominio A chiama un UseCase di dominio B. Esempio:
   - `Identity` UseCase `grantAccessForPurchase(userId, productId)` chiama `Catalog` UseCase `getProductById(productId)`.
   - Cross-domain via UseCase layer, port `ProductRepository` di Catalog.

2. **Event grid adapter-level** — Adapter pubblica eventi che altri Adapter sottoscrivono. Esempi:
   - `Commerce` Adapter `webhook-lemonsqueezy` `publishEvent("OrderCompleted", payload)`.
   - `Analytics` Adapter `subscribe("OrderCompleted", handler)` per ingestion conversion funnels.
   - Disaccoppia; nessuna chiamata diretta cross-domain.

3. **Shared Kernel (console-types only)** — type definitions condivisi tra domini. Esempi:
   - `AccessGrant` type (Identity ↔ Commerce).
   - `ProductId`, `UserId` branded types.
   - Regole: solo type definitions (`src/lib/console-types/` o per-domain `*-types.ts`), MAI logica.

VIETATO:
- Sideways: `domain-X/rules/file.ts` import `domain-Y/port/file.ts` o `domain-Y/adapter/file.ts`.
- Cross-domain Adapter bypasses: `Discovery` UseCase importing `Commerce/PrismaAdapter` direttamente (anche se le porte coincidono sintatticamente — deve sempre passare via Port).
- Upward leaks: qualsiasi Adapter→UseCase, Adapter→UI/Route.

### (d) Esempio concreto: Identity ↔ Catalog

`Identity` UseCase `grantAccessForPurchase(userId: UserId, productId: ProductId)`:

| Step | Layer | Cross-domain? |
|---|---|---|
| 1. `await identityUseCase.grantAccessForPurchase(...)` | UI/Route chiama UseCase | ❌ Intra-domain |
| 2. `await catalogUseCase.getProductById(productId)` (interno) | UseCase chiama UseCase | ✅ Cross-domain via UseCase |
| 3. catalogUseCase internally: domain rule validates product published status | Domain rule | ❌ Intra-domain |
| 4. catalogUseCase calls `ProductRepository.findById(...)` via Port | UseCase chiama Port | ❌ Intra-domain |
| 5. `PrismaProductRepository.findById(...)` resolves via Prisma adapter | Adapter | ❌ Intra-domain |
| 6. Identity UseCase: domain rule validates access grant predicates | Domain rule | ❌ Intra-domain |
| 7. Identity UseCase: `await accessGrantRepository.create(...)` via Port | UseCase chiama Port | ❌ Intra-domain |
| 8. `PrismaAccessGrantRepository.create(...)` writes | Adapter | ❌ Intra-domain |

Risultato: 1 cross-domain communication (Identity UseCase → Catalog UseCase). 0 sideways leaks.

### (e) Migration impact (deferred to existing ADRs)

La migrazione concreta dai file V1 (`src/lib/*`, `src/components/*`) ai namespace `src/domains/<domain>/*` segue il **5-commit workflow template** definito in **ADR-0016 §d**. NON duplicato qui per evitare ridondanza.

---

## Consequences

**Positive:**
- **Communication graph canonica**: ogni dominio ha una direzione top-down chiara; nuovi contributor capiscono "dove metto questo codice" in pochi minuti.
- **Analytics elevation**: cross-creator YouTube ingestion + conversion attribution hanno ownership dedicata, non più read-model annidato in Creator Ops.
- **CI-enforced**: `eslint-plugin-import` + custom rule verifica automaticamente il layer graph. Una nuova violazione diventa un red CI gate (qualify-gate job, ADR-0016 §Future §1).
- **Single canonical reference**: la regola di dipendenza è in UN solo posto. Le eccezioni (ADR-0013 Template-amish) citano esplicitamente questo ADR come rule base.

**Negative (accettati):**
- **Migration cost**: i file V1 in `src/lib/*` vanno migrati ai domini V2 uno per uno (ADR-0016 §d 5-commit workflow). Stimato 12-18 mesi per chiudere completamente.
- **Cross-domain UseCase composition**: invece di chiamare direttamente una funzione, si orchestrano UseCase. Esempio: `await identityUseCase.grantAccessForPurchase(...)` chiama internamente `await catalogUseCase.getProductById(productId)`. Più verboso ma testabile + dependency-injection-friendly.
- **Analytics namespace vuoto a Fase 1**: prima dell'attivazione di `src/domains/analytics/` (cross-creator features V2), il folder rimane empty. Accettato per esplicitare l'intent; "no anticipatory folders" rule (ADR-0016 §c) si applica al primo commit di carving.

---

## Cross-references

- **[ADR-0015](0015-coursy-naming-decision.md)** — nome canonico `Courssy`; tutti i domini V2 vivono sotto namespace `courssy`.
- **[ADR-0016](0016-coursy-monolith-modular.md)** — 9-domain map precedente (parent), 5-commit workflow template, dependency rule (questo ADR lo eleva a decision di primo livello).
- **[ADR-0017](0017-dependency-policy.md)** — `npm run check:deps` per manifest-vs-lockfile drift (co-applicable a questo ADR's layer graph via dual enforcement).
- **Master-plan §1** — origine del 10-domain map (pre-ADR-0016 listato 10 domini, ADR-0016 ridotto a 9 consolidando Analytics).
- **Domain folder minimal shape** — ADR-0016 §b.

---

## Verification (post-ADR-0018 accept)

- `git log` post-merge: quinto ADR dopo 0015/0016/0017 → `docs(adr): 0018 ten-domain boundaries` commit su `main`.
- `cat docs/adr/0018-ten-domain-boundaries.md | wc -l` — atteso ~280 linee (mini-ADR shape).
- `grep -c 'src/domains/' docs/adr/0018-ten-domain-boundaries.md` — atteso ≥10 (uno per dominio).
- `npm run check:hotspots` — il primo posto dove cercare file che violano il layer graph (citati in cima alla loro categoria `refactor_obbligatorio`).
- ESR (custom eslint rule) — esposto come §Future §1.

---

## Future work

1. **ESLint custom rule ESR-0018**: verifica che nessun file in `src/domains/<domain>/<domain>-types.ts` (o port/adapter) importi Adapter di un altro dominio. Failure mode: dependency rule layer-graph violation.
2. **Per-domain ADRs**: Identity ADR-0019, Catalog ADR-0020, ecc. — drill-down per ogni dominio con composition interna.
3. **Cross-domain SLO**: `Identity → Catalog` UseCase dipendenza deve avere SLO ≤ 50ms p95 (V2 post-attivazione).
4. **V3 future**: evolutionary review per aggiungere `Community comment threading` o altre verticali separate (ADR-0019-b).
5. **ADR replacement**: se V2 evolve a V3, questo ADR viene marcato `Status: Superseded` da nuova top-level ADR (probabile ADR-0025+).

---

## Implementation log

- 2026-07-16: ADR-0018 accettato. `docs/adr/0018-ten-domain-boundaries.md` committato via questo commit. Decision 1-line "10 domini V2 + regola di dipendenza canonica UI → UseCase → Domain → Port → Adapter + comunicazione cross-domain solo via UseCase / event grid" in cima al file + footer ripetuto per visibilità reviewer.
