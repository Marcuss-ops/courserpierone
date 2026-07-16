# ADR 0017 — External Dependency Policy

- **Status:** Accepted (V2 forward-looking)
- **Date:** 2026-07-16
- **Deciders:** Engineering leadership
- **Related:** ADR-0016 (modular monolith), docs/checklist/dod.md (DoD §5)
- **Source:** Master plan §7 (Controllo delle dipendenze)

---

## Context

The Courssy platform grows. New features (feed, agents, creator studio, DM
commerce) introduce temptations to add libraries: vector DBs, agent
frameworks, message brokers, second cache layers, recommendation engines,
new ORMs. Without a written policy, dependencies accumulate, the bundle
grows, security surface increases, and the platform drifts away from its
"monolith with strong domain boundaries" architecture.

The `package.json` today already includes infrastructure for database
(@prisma/client), Redis (@upstash/redis + ioredis), auth (Supabase),
payments (@lemonsqueezy), email (nodemailer), PDF (jspdf), i18n
(next-intl), and validation (zod). That is enough for V1 + the planned
V2 features. The temptation to add MORE is real and must be resisted
by policy.

## Decision

**A new dependency may be added to `package.json` only if it passes
ALL SIX of the following gates. Any failure is a blocker; the
proposer must justify the bypass in an ADR before merging.**

### The 6 mandatory gates

1. **La platform standard non risolve.**
   The standard library, the existing platform primitives (Next.js
   App Router, Prisma, Zod, React 19, Next-intl), or a single inline
   helper (~30 LOC) cannot achieve the same outcome. If we can write
   it ourselves in a small, well-tested helper, we do.

2. **No libreria equivalente già presente.**
   We do not add a library that duplicates functionality already
   covered by another dependency. Examples of forbidden duplicates:
   - Two HTTP clients (we have `fetch` + `next-intl` patterns; no axios)
   - Two validation libs (we have zod; no joi / yup / valibot)
   - Two i18n libs (we have next-intl; no react-i18next)
   - Two test runners (we have vitest; no jest)
   - Two linters (we have eslint v10; no biome / dprint)

3. **Usata in >1 punto reale, OR risolve un problema complesso.**
   A dep that appears in exactly one file is a candidate for inline
   implementation. Exception: a dep that solves a genuinely complex
   problem (cryptography, PDF generation, payment processing) is
   acceptable even at usage count = 1, because re-implementing it
   would be a multi-week project with security risk.

4. **Manutenzione attiva (ultimo commit < 6 mesi).**
   The dep's main repository must show a commit within the last 6
   months. Archived, abandoned, or "stable but unmaintained" deps
   are rejected unless the proposer commits to maintaining a fork
   (in which case an ADR documents the fork + upgrade plan).

5. **No runtime enorme (size impact < 50KB gzip).**
   The dep must add at most ~50KB gzip to the production bundle
   (or to the server bundle, if server-only). Larger deps require
   an ADR documenting the bundle impact + lazy-loading strategy.
   This gate prevents the "small utility, 2MB transitive tree"
   trap common with date libraries, lodash, etc.

6. **No duplicazione funzionalità esistenti.**
   The dep must not re-implement functionality already in the
   platform. If a feature is achievable via Prisma + zod + a small
   helper, we do not add a dep. This is the "no reinventing
   built-ins" mirror of gate #2: gate #2 forbids duplicate DEPS,
   gate #6 forbids duplicate FUNCTIONALITY even if implemented
   differently.

### Enforcement

The 6 gates are enforced at three levels:

1. **Pull request review** (human): the `.github/pull_request_template.md`
   references this ADR; reviewers MUST verify all 6 gates before
   approving a dep change.

2. **CI gate** (`scripts/quality/check-deps.ts`): scans `package.json`
   + `package-lock.json` + `src/` import usages. Flags deps with
   ≤ 1 usage point as "candidate-to-remove". Wired into the
   `quality-gate` CI job as step (i), informational only (does
   NOT block the merge on first land — gives the team a clear
   signal without the cost of a failed CI on every V2 day 1).

3. **Quarterly audit** (process): once per quarter, run
   `npm run check:deps` and review the output. Deps flagged for
   2 consecutive quarters without justification are removed.

### V2 "no" list (explicit exclusions)

The following dep categories are explicitly REJECTED for V2, per
master plan §7:

| Category | Why excluded | What to do instead |
|---|---|---|
| Vector database | Premature. The feed does not need embeddings yet. Rule-based ranking is the V1 path. | Postgres `pg_trgm` or hand-rolled cosine sim for V3 if needed |
| Agent framework | Premature. Phase 5 ships the agent REGISTRY (pure TS, no runtime). No agent EXECUTION framework yet. | Plain Node.js + OpenAI SDK. Compose workflows with `await` |
| Message broker | Premature. Postgres LISTEN/NOTIFY + Redis pub/sub cover V2 needs. | Postgres LISTEN/NOTIFY for cross-process events |
| Second cache layer | Forbidden. We already have Redis (Upstash + ioredis). Adding memcached or another Redis is duplication. | Single Redis cluster with logical DBs |
| Recommendation library | Premature. Phase 1 ships rule-based ranking (deterministic, testable). ML-based recs come in V3+. | Hand-rolled scoring functions + SQL aggregates |
| New ORM | Forbidden. Prisma is the platform standard. No Drizzle, TypeORM, Kysely, etc. | Prisma raw SQL for queries Prisma's query builder can't express |

## Consequences

### Positive

- **Bundle discipline**: no surprise megabytes added by transitive
  dep chains.
- **Security surface**: fewer deps = fewer CVEs to monitor.
- **Architecture integrity**: the V2 "no" list prevents the gradual
  drift from "modular monolith" to "distributed services stack".
- **Auditability**: `check:deps` provides a single source of truth
  for "which deps are we actually using and why".

### Negative

- **Slower feature velocity**: some features that would be 1-line
  with a library require a custom implementation. We accept this
  trade-off.
- **Build-vs-buy pressure**: every "we could just add X" suggestion
  triggers a 6-gate check + possibly an ADR. This is intentional
  friction.
- **Quarterly review burden**: a human must review the `check:deps`
  output each quarter. Estimate: ~30 minutes per quarter.

### Neutral

- The `check:deps` script itself is a NEW piece of code in the
  quality namespace. It is a small, isolated dependency (only
  uses Node.js built-ins) and does not introduce new external
  deps — so the 6 gates do not apply to it retroactively.

## References

- Master plan §7 (Controllo delle dipendenze)
- ADR-0016 §1 (architectural dependency direction UI → UseCase → Domain → Port → Adapter)
- `docs/checklist/dod.md` (DoD §5 "caso d'uso applicativo" — applies to deps too)
- `scripts/quality/check-deps.ts` (the enforcement script)
- `package.json` (the canonical dep list, governed by this policy)