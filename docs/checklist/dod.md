# Definition of Done (DoD) — Coursy

> **Canonical reference for what "done" means on this codebase.**
>
> Per the master plan §9, a feature is **NOT** complete until all 15
> points below are checked off and zero items from the "NOT acceptable"
> list are present. This file is referenced verbatim by
> `.github/pull_request_template.md` and is the source of truth for the
> project's quality gate.
>
> **Related documents:**
> - ADR-0016 — modular monolith architecture (dependency direction)
> - `docs/adr/` — architectural decision records (point 14 below)
> - [`.github/pull_request_template.md`](../../.github/pull_request_template.md) — checkbox form of this DoD
>
> **Audience:** authors of every PR, reviewers, and AI agents proposing
> changes. The DoD is binding for new code; legacy cleanup is exempt
> only when explicitly documented in the ADR.

---

## The 15 mandatory points

### 1. User story reale
The change is anchored to a concrete user story (or a documented
operational need such as a bug, an incident post-mortem action, or a
regulatory requirement). "Refactor for cleanliness" alone is not a
user story — it must trace to a measurable improvement.

### 2. Confini e responsabilità chiari
The change respects the architectural dependency direction
(ADR-0016 §1):
```
UI / Route  →  Use case applicativo  →  Regole di dominio
            →  Contratti / Port      →  Adapter (Prisma, OpenAI, LS, email)
```
No upward dependencies, no sideways leaks between domains. New
responsibilities go into an existing domain or trigger the creation
of a new one with an ADR.

### 3. Autorizzazioni definite
Every entry point that touches user data declares its authorization
contract: who can call it, under which condition (role, grant,
ownership). Server-side enforcement is non-negotiable. UI hiding is
NOT authorization — it is presentation.

### 4. Input / output validati
All input boundaries (API routes, server actions, webhook handlers,
cron endpoints, form submissions) parse input via Zod (or equivalent)
schemas declared in `src/lib/parsers/` or domain-local validators.
All output that crosses a trust boundary is typed (branded types from
`src/lib/domain-types.ts` where applicable).

### 5. Caso d'uso applicativo
Business logic lives in a use-case function or service — NOT in
components, pages, route handlers, or SQL. The use case is pure of
`(input, deps)`, deterministic, and testable without I/O mocks beyond
the port boundary.

### 6. Test delle regole
Pure-rule logic (eligibility policies, ranking policies, retry
classifiers, state machines, validators) has unit tests covering:
- happy path
- each denial / failure branch
- boundary values (zero, max, off-by-one)
- determinism (same input → same output across runs)

### 7. Test dei permessi
Every authorization rule has a positive test (allowed principal) and
a negative test (denied principal, missing grant, wrong role). The
test must exercise the SAME code path the production request would —
a UI-hidden button is not a permission test.

### 8. Protezione contro duplicazioni
Idempotency keys, unique constraints, or single-flight guards exist
for every operation that could be re-issued (webhook handlers, retry
chains, form re-submits, agent jobs, payment intents). The guard
either rejects the duplicate explicitly or is a no-op on retry.

### 9. Query budget (no N+1)
Every repository method is **N+1-free** (zero queries inside loops;
batched via aggregate / `include` / Map lookups). This is the HARD
rule enforced by CI runtime asserts (Prisma query log assertions in
tests).

Additionally, use case implementations declare a **target query
budget** in JSDoc (typically 1–3 aggregate queries per use case)
for performance tracking. The target is a guideline, not a gate —
exceeding it triggers a review, not an automatic block. The hard
ceiling is N+1 = 0.

### 10. Eventi analytics
User-visible state changes emit analytics events with:
- a canonical event name (`snake_case`, registered in the analytics
  registry)
- typed payload schema
- the actor identity (userId, sessionId, anonymousId)
- the timestamp (server-side UTC)

No event = no measurement = no learning loop.

### 11. Error logging
Every catch block logs the error with:
- the error class + message
- the operation context (use case name, input shape, correlation id)
- the user-visible fallback (what the UI shows)
- the stack trace (only in dev / staging, redacted in prod)

Silent catches (`catch {}`) are forbidden (see unacceptable list).

### 12. Gestione degli stati parziali
Multi-step operations have an explicit partial-state model:
- what is committed at each step
- what is rolled back on failure
- what is observable to the user during the in-flight state
- how the system recovers on retry

The state model is documented in the use case JSDoc.

### 13. Rimozione del path precedente
When introducing a new code path (refactor, new API, new schema),
the old path is removed in the SAME commit (or in a tightly-coupled
follow-up commit before the new path ships to prod). "Dual mode
old + new" is temporary and tracked with an expiration date or
explicit deletion commit. Permanent dual-mode is forbidden.

### 14. ADR della decisione architetturale
Any non-trivial architectural decision (new domain, new pattern,
breaking change, new external dependency, new trust boundary) is
captured as an ADR in `docs/adr/NNNN-title.md` BEFORE or IN the
same commit as the implementation. The ADR records: context,
decision, consequences, alternatives considered.

### 15. Quality gate verde
Before marking the PR ready for review, the author has run locally:
- `npx tsc --noEmit`
- `npx vitest run`
- `npm run check:size` (file budget)
- `npm run lint`
- (when applicable) `npx madge --circular src/`

CI must reproduce the same green status. A red CI is an automatic
block, regardless of review approval.

---

## NON accettabili (zero tolerance)

The following patterns are forbidden in new code. A PR that introduces
any of them MUST be revised before merge, regardless of functional
correctness.

| # | Anti-pattern | Why it's forbidden |
|---|---|---|
| A | **TODO senza owner** | Untracked work rots. Every TODO must reference an issue, an ADR, or a named author + target release. |
| B | **Doppia logica vecchia / nuova permanente** | Drift risk: two code paths diverge over time, doubling the maintenance and testing burden. Use a single source of truth; remove the old path in the same commit. |
| C | **Fallback silenziosi** | Hides bugs. If a fallback is necessary (e.g., graceful degradation), it MUST log a warning + emit an analytics event so the issue is visible. |
| D | **Catch generici che nascondono errori** | `catch (e) {}` or `catch (e) { /* ignore */ }` swallows actionable errors. Either handle the specific error class, rethrow, or log + emit. |
| E | **Retry infiniti** | Exponential backoff with a bounded max-attempts is mandatory. Infinite loops starve the worker pool and hide rate-limit / quota issues. |
| F | **Query dentro loop (N+1)** | A known performance killer. Use a single aggregate query (Prisma `groupBy`, `findMany` with `include`, batched lookups via Map). Document the budget in the use case. |
| G | **UI che decide regole di business** | Authorization, eligibility, ranking, and validation belong to the use case / domain layer. The UI consumes the result; it does not produce it. Hidden checks in components are a maintenance trap and a security risk. |

---

## Enforcement

This DoD is enforced by:
1. **`.github/pull_request_template.md`** — author self-certifies all 15
   points + explicitly denies the 7 unacceptable patterns.
2. **CI** — typecheck, vitest, lint, file size, circular dependency
   gates reproduce the author's claim of green.
3. **Reviewer responsibility** — at least one reviewer confirms the
   DoD is genuinely satisfied, not just box-checked. Box-checking
   without verification is itself a violation of the DoD spirit.

## Exceptions

An exception to any DoD point MUST be:
- documented inline in the PR description with the reason,
- recorded as a follow-up issue (or ADR if architectural),
- time-bounded (an explicit "remove this exception by YYYY-MM-DD").

Permanent exceptions are not permitted. If an exception is permanent,
the DoD itself needs revising (which is itself an ADR).

---

**Last updated:** 2026-07-16
**Source:** Master plan §9 (Definition of Done obbligatoria)
**Binding for:** all new code on `main`