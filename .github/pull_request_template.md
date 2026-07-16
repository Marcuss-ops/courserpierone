<!--
Coursy Pull Request Template
============================

This template enforces the canonical Definition of Done (DoD).
Read `docs/checklist/dod.md` BEFORE opening the PR.

Self-certification rule: every unchecked box is a promise that the
author will fix before merge. Box-checking without verification is a
violation of the DoD spirit and is itself a review-blocker.
-->

## Summary

<!-- 1-3 sentences. What does this PR do and WHY?
     Link the user story, incident post-mortem, or ADR.
     Skip the implementation details — those belong in commit messages. -->

**User story / driver:**

## Type of change

<!-- Check exactly one. Use "Other" sparingly and explain. -->

- [ ] 🐛 Bug fix (non-breaking change that fixes an issue)
- [ ] ✨ New feature (non-breaking change that adds functionality)
- [ ] 💥 Breaking change (fix or feature that changes existing behavior)
- [ ] ♻️ Refactor (no functional change, code quality / DoD improvement)
- [ ] 📚 Docs only (docs/ or .github/ change, no code touched)
- [ ] 🔧 Chore / tooling (CI, deps, scripts — no production behavior change)
- [ ] 🧪 Test only (adds or fixes tests, no production code touched)
- [ ] 🏗️ Architecture / ADR (new domain, new pattern, new dependency)

## Related

- **ADR:** <!-- link to docs/adr/NNNN-*.md or "none required" -->
- **Issue / ticket:** <!-- link or "none" -->
- **Blocks:** <!-- other PRs that depend on this, or "none" -->

---

## ✅ Definition of Done — self-certification

By opening this PR, I confirm that ALL 15 points of
[`docs/checklist/dod.md`](../docs/checklist/dod.md) are satisfied.
Reviewers: please verify, do not trust the box-checking alone.

- [ ] **1. User story reale** — change anchored to a real user story / bug / incident action
- [ ] **2. Confini e responsabilità chiari** — respects ADR-0016 dep direction; no cross-domain leaks
- [ ] **3. Autorizzazioni definite** — every entry point has a server-side authorization contract
- [ ] **4. Input / output validati** — all inputs parsed via Zod (or equivalent); outputs typed (branded types where applicable)
- [ ] **5. Caso d'uso applicativo** — business logic in a use case function, not in components / routes / SQL
- [ ] **6. Test delle regole** — pure-rule logic has unit tests (happy + each failure branch + boundary + determinism)
- [ ] **7. Test dei permessi** — every auth rule has positive + negative tests via the production code path
- [ ] **8. Protezione duplicazioni** — idempotency keys / unique constraints / single-flight guards for re-issuable ops
- [ ] **9. Query budget (no N+1)** — repo methods have a documented budget; no queries inside loops
- [ ] **10. Eventi analytics** — state changes emit canonical events with typed payload + actor + timestamp
- [ ] **11. Error logging** — every catch logs class + context + stack (dev) / redacted (prod); no silent swallows
- [ ] **12. Gestione stati parziali** — multi-step ops have explicit partial-state model (commit / rollback / in-flight / recovery)
- [ ] **13. Rimozione path precedente** — old path removed in the same commit (or tightly-coupled follow-up); no permanent dual mode
- [ ] **14. ADR della decisione architetturale** — non-trivial decisions captured in `docs/adr/NNNN-*.md`
- [ ] **15. Quality gate verde** — tsc + vitest + check:size + lint + madge --circular all green locally

---

## 🚫 Unacceptable patterns — explicit denial

I confirm NONE of the following anti-patterns are present in the new
code (or any that ARE present were pre-existing and are explicitly
out of scope for this PR, documented below):

- [ ] **A. TODO senza owner** — no `TODO` / `FIXME` without issue link + owner + target release
- [ ] **B. Doppia logica vecchia / nuova permanente** — no permanent dual code paths; old path removed or has explicit expiration
- [ ] **C. Fallback silenziosi** — no silent `?? defaultValue` without a log + analytics event
- [ ] **D. Catch generici che nascondono errori** — no empty / ignored catch blocks; every catch handles a specific class or rethrows
- [ ] **E. Retry infiniti** — all retry loops bounded (maxAttempts + backoff cap); no `while (true) { retry() }`
- [ ] **F. Query dentro loop (N+1)** — no queries inside `for` / `forEach` / `map`; batched via aggregate or `include`
- [ ] **G. UI che decide regole di business** — no authorization / eligibility / ranking / validation logic in components

**Pre-existing violations explicitly out of scope:**
<!-- "none" or list each: file:line + reason + linked issue -->

---

## 🧪 Testing

- [ ] Unit tests added / updated
- [ ] Integration tests added / updated
- [ ] Manual verification steps documented (if applicable):
  <!-- steps a reviewer can follow to see the change in action -->

**Test run results (paste locally):**

```
$ npx tsc --noEmit
$ npx vitest run
$ npm run check:size
$ npm run lint
$ npx madge --circular src/  # if touched src/ structure
```

## 📊 Risk & rollout

<!-- Migration / rollback / feature-flag plan if applicable.
     For DoD point 12 (partial states). -->

- **Migration:** <!-- "none" or describe -->
- **Rollback:** <!-- "revert PR" or describe -->
- **Feature flag:** <!-- "none" or link -->
- **Observability:** <!-- what dashboards / alerts to watch -->

## 📸 Screenshots / recordings

<!-- For UI changes only. Skip for backend / infra / docs. -->

---

## Reviewer checklist

<!-- Reviewers: please verify, not just skim. -->

- [ ] All 15 DoD points genuinely satisfied (not just box-checked)
- [ ] None of the 7 unacceptable patterns present
- [ ] Quality gate (CI) is green
- [ ] ADR exists or is unnecessary (justified)
- [ ] Test coverage adequate for the change's risk level
- [ ] Public API / schema changes are documented in CHANGELOG / ADR