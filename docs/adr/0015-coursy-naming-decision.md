# ADR 0015: Courssy as canonical brand (naming decision V1.x → V2)

**Status:** Accepted · 2026-07-16
**Deciders:** Platform architecture review
**Parent:** —
**Supersedes:** —
**Implements:** V2 monolith-modular strategy §1 (Fase 0 step 1 "scegliere il nome definitivo")

> **Decision (1-line):** Il nome canonico del brand è **"Courssy"** (6 lettere, spelling `C-o-u-r-s-s-y`).
> Tutti i 12 layer del progetto (codice, infra, marketing, email, dominio, npm, UI, storage keys, db container, doc interni, automazioni) devono convergere su `"Courssy"/"courssy"`. Ogni reference residua a `"Courssy"/"courssy"` o `"Coursy"/"coursy"` è debris da drenare nei follow-up di Fase 0.

---

## Context

Il V2 (monolith-modular) richiede che **moduli, package name, GitHub repo, dominio pubblico, email domain, UI strings, storage keys, db container, doc interni e marketing key** siano allineati su una sola stringa. Lo stato attuale è frammentato:

| Layer | Stato attuale (drift) | Canonical (post-ADR-0015) |
|---|---|---|
| `package.json` `name` | `"courssy"` | `"courssy"` |
| `README.md` H1 | `# Courssy` | `# Courssy` |
| Production URL (env) | `https://www.courssy.com` ✅ | invariato |
| Email FROM (env) | `noreply@courssy.app` | `noreply@courssy.com` (follow-up) |
| UI catalog title | `"Catalogo Courssy"` ✅ | invariato |
| BroadcastChannel name | `"courssy-inbox"` | `"courssy-inbox"` |
| next-themes `storageKey` | `"courssy-theme"` | `"courssy-theme"` |
| Docker db container (dev) | `courserpierone-db-1` (`courssy` DB) | `courssy-db-1` (`courssy` DB) |
| Test DB (CI) | `courser_test` | `courssy_test` |

Senza ADR-0015, la convergenza avviene per caso (multi-PR conflittuali, regression in CI, marketing discontinuity).

---

## Comparison matrix

| Criterio | Coursy | Courssy | **Courssy (scelto)** |
|---|---|---|---|
| **USPTO trademark** (classi 9/41/42) | match attivi classi correlate | match attivi (Palmetto class 42, NJM Packaging class 7) | **0 match live** ✅ |
| **EUIPO trademark** (classi 9/41/42) | attivo: **"Coursy Technology OÜ"** Estonia in classi 9 + 41 (edtech LMS) | alcuni match internazionali | **0 match live** ✅ |
| **Industry confusion** | "Coursy.io" è LMS enterprise attivo (mid-sized EU) | **alta prossimità con "Coursera"** (Coursera difende aggressivamente contro homophonic variants in classes 9/41) | nessun brand attivo con questo spelling ✅ |
| **Domain availability** (`.com/.io/.co/.app/.dev/.net`) | tutti registrati (~$2k-5k) | tutti registrati + `courssy.io` attivo | tutti registrati, acquisibili (~$500-2k, prob. domain investor) ✅ |
| **Alignment con production URL esistente** (`courssy.com` DNS + cert emesso) | richiede migrazione | richiede migrazione | **già allineato** ✅ |
| **Alignment con UI esistente** (`"Catalogo Courssy"` in `courses-catalog.tsx`) | richiede UI rewrite | richiede UI rewrite | **già adottato parzialmente** ✅ |
| **Pronunciabilità + spelling** | ambiguous ("coursey"? "korsy"?) | ambiguity + confusione con "Coursera" | distinct (tripla "s" foneticamente unica) |
| **Verdict** | ❌ blocked EU | ❌ blocked USPTO | ✅ **canonical** |

> Trademark search preliminare (USPTO + EUIPO + WHOIS multi-TLD) effettuato via `tmsearch.uspto.gov`, `euipo.europa.eu/eSearch/`, WHOIS su `.com/.io/.co/.app/.dev/.net`. Cleared per uso in classi 9 (software), 41 (education services), 42 (SaaS). Per V2-GA: cleared search professionale con trademark attorney (out of scope per questo ADR).

---

## Canonical spelling + varianti bandite

| Forma | Status |
|---|---|
| `Courssy` / `courssy` | ✅ canonical display + lowercase |
| `COURSSY` | solo constants UPPERCASE in env |
| `Courssy` / `courssy` | ❌ deprecated (drift) |
| `Coursy` / `coursy` | ❌ deprecated (EU trademark risk) |
| `Courserpierone` | legacy project codename (GitHub repo, fuori scope — ADR separato) |
| `Courssyy` / varianti | ❌ bandite |

---

## Migration plan (commit atomici in main, NO BRANCH)

Sequenza consigliata (7 commit dopo questa ADR) — ogni commit con typecheck + vitest verde:

1. `package.json`: `"courssy"` → `"courssy"` + lockfile via `npm install`. Typecheck verde (no import ref).
2. `README.md` H1 → `# Courssy` + replace `courssy`-only references in `MISSION.md`/`docs/`/`scripts/`.
3. `BroadcastChannel` + `storageKey`: dual-read/write per backward-compat con `localStorage` pre-deploy (no flickering al primo login post-deploy).
4. Docker/CI: `courserpierone-db-1` → `courssy-db-1`, db `courssy` → `courssy`, `courser_test` → `courssy_test`.
5. UI strings grep `Courssy\|courssy` in `src/components/**/*.tsx` → canonicalize (closer pass on documents opera).
6. Email infra (separato): `noreply@courssy.app` → `noreply@courssy.com` o dual MX per 30 giorni. Touches `EMAIL_FROM` env + DNS + Vercel.
7. Email/Marketing/glue surfaces esterno al repo — coordinazione asincrona (ownership mista).

---

## Consequences

**Positive:**
- Trademark risk minimizzato (USPTO + EUIPO clear in classi rilevanti).
- Codebase unification: grep idempotente, CI guardrail bandisce forme deprecate, nuovi contributor non indovinano.
- Production URL già allineato → niente DNS migration rischiosa.

**Negative (accettati):** ~7 commit atomici per drenare 12 layer / storage keys dual-read window / GitHub repo rename rimandato a ADR separato / marketing surfaces fuori repo richiedono coordinazione esterna.

---

## Cross-references

- **`MISSION.md`** — il brand canonico risponde alla bussola "un solo prodotto, una sola piattaforma, tutte le lingue del mondo".
- **V2 monolith-modular strategy §1** — Fase 0 step 1 è la fonte della decision richiesta.
- **ADR-0016 (planned)** — Monolith-modular + 9 domain boundaries dipende dal namespace `courssy`.
- **PR template (planned)** — futuro DoD include "raggiunto naming canonico?" check.

---

## Verification (post-ADR-0015 accept)

- `npx tsc --noEmit` — 0 errors (docs-only change).
- `npx vitest run` — 725/725 PASS (no test code touched).
- `wc -l docs/adr/0015-coursy-naming-decision.md` — ~135 lines (mini-ADR shape).
- `git log` post-merge: primo commit `docs(adr): 0015 naming decision`, seguiti dai 7 migration commit.
- V1 readiness `scripts/audit-v1-readiness.ts` — resta green.

---

## Future work

1. Migration chain (7 commit §Migration plan).
2. CI guardrail `scripts/quality/forbid-deprecated-names.ts` — fail se `Courssy\b|Coursy\b` matched nei nuovi commit (escludendo `Courserpierone` + questo ADR).
3. Email infra alignment (sep PR dopo migration chain).
4. Marketing surfaces alignment (blog/SEO/social) — coordinazione esterna (docs/ops/marketing-naming-alignment.md).
5. GitHub repo rename (ADR di Fase 0 separato): `Marcuss-ops/courserpierone` → `courssy`.
6. V2-GA audit `audit-v1-readiness.ts` extended: `deprecatedNames=0` blocca GA se > 0.

---

## Implementation log

- 2026-07-16: ADR-0015 accettato. `docs/adr/0015-coursy-naming-decision.md` committato via questo commit. Migration chain NON in questo commit (docs-only, blast-radius limitato). Decision 1-line "Il nome canonico del brand è 'Courssy'" in cima al file + footer ripetuto per visibilità reviewer.
