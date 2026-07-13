# ADR 0010 — Two-pass gate for type-aware ESLint rule substitution

> **Status.** Accepted (post-recovery). Effective 2026-07-13.
> **Author.** Ops / dev-lead (lessons learned from C1 + C1-fixup + blanket-revert cycle this date).

## Context

The codebase carries **368 ESLint warnings** across five type-aware rules:

| Rule | Count | Tier |
| --- | --- | --- |
| `@typescript-eslint/prefer-nullish-coalescing` | 231 | warn (auto-fix `suggestion`-only) |
| `@typescript-eslint/no-unused-vars` | 63 | warn (auto-fix partial — destructured only) |
| `@typescript-eslint/no-explicit-any` | 30 | warn (NO auto-fix; manual type work) |
| `@typescript-eslint/require-await` | 22 | warn (intentional — Next.js App Router convention allows `async` without `await`) |
| `react-hooks/set-state-in-effect` | 16 | warn (NO auto-fix; React-specific rewrite) |

### Incident 2026-07-13

An attempt to clear the **prefer-nullish-coalescing** bucket via **manual regex bulk substitution** introduced compounding regressions:

1. **`npm run lint:fix`** (and direct `eslint --fix`) produced **0 file changes** because the `prefer-nullish-coalescing` rule emits `suggestion`-typed fixes only (not safe auto-fixes), since `||`→`??` is unsafe for falsy values (`""`, `0`, `false`).
2. **Manual regex pass** (filtered on inline `?.` chains) substituted `||`→`??` in 156 spots across 66 files. The LHS-types included `T | undefined`-typed values that ESLint's `recommendedTypeChecked` had flagged correctly, but TypeScript's **prior narrowing guards** in several spots had narrowed the inferred LHS type to non-nullable BEFORE the substitution line, producing **174** new TypeScript typecheck errors (`Right operand of ?? is unreachable` plus type-assignment mismatches).
3. **Surgical Node-script revert** failed mid-pipeline (escaped-quote syntax error in the heredoc).
4. **Blanket revert** (revert `?.`-chain `??` back to `||` across the codebase) surfaced **203** typecheck errors (worse than 174, because more `??`-on-narrowed-LHS errors were exposed).
5. **`git revert HEAD` + amend** the revert message, then `git pull --rebase` blocked by dirty `eslint.config.mjs`.
6. **Force-reset + force-push** (`git reset --hard <pre-C1-SHA> + git push --force-with-lease origin main`) restored the typecheck-clean baseline at the cost of forcibly overwriting the broken `e01c1ab` commit on remote.

The codebase is now back to the documented baseline (368 warnings, typecheck-clean, conventional config). The original lint-cleanup task is **fully deferred** to a second-pass that obeys this ADR's gates.

## Decision

For every future attempt to clear any of the **type-aware** ESLint rule buckets (`prefer-nullish-coalescing`, `no-unused-vars`, `no-explicit-any`, `set-state-in-effect`), the operator MUST obey a **two-pass gate** modelled on this ADR:

### Migration order (recommended)

Operators should tackle the four buckets in **easiest-first** order to minimize regression risk:

1. **C2 — `no-unused-vars`** first. Mechanical via `eslint-plugin-unused-imports` + `npm run lint:fix`. Lowest risk of regression because there's no type-narrowing interaction — unused imports are removed top-level, and ESLint's `recommendedTypeChecked` engine flags narrowing-blind cleanups elsewhere automatically.
2. **C1 — `prefer-nullish-coalescing`** second. Suggestion-only autofix (interactive via `eslint-interactive` or programmatic via `ESLint.lintFiles({ fix })`). Each suggestion must be operator-rejected if the LHS could legitimately be a falsy value (`""`, `0`, `false`).
3. **C3 — `no-explicit-any`** third. Manual type narrowing per location; cannot be auto-substituted because no fixer exists. Two-pass gate applies per location.
4. **C4 — `react-hooks/set-state-in-effect`** last. React-specific rewrite; the correct fix depends on intent (derive state in render vs `useLayoutEffect` vs remove-and-inline). No autofix, all manual.

The `require-await` bucket is intentionally left at `warn` (no action required — see `require-await` subsection below).

### Two-pass gate

1. **Pre-flight:** capture the TypeScript typecheck error baseline.

   ```bash
   npx tsc --noEmit > /tmp/tsc-before.txt 2>&1 || true
   # Capture the SET of errors (file:line: TS-error-ID), not raw output
   ```

2. **Run:** apply the substitution. The actual mechanism depends on the rule (see Per-rule playbook below). For suggestion-only autofixes, the `eslint-interactive` CLI or a programmatic `ESLint.lintFiles({ fix: true })` Node script is required **because `eslint --fix` deliberately ignores suggestion-typed fixes**. The naive `npm run lint:fix -- --rule '{...}'` invocation pattern the original task suggested **does not work** for these rules.

3. **Post-pivot:** capture the typecheck baseline again and require **identical error set**.

   ```bash
   npx tsc --noEmit > /tmp/tsc-after.txt 2>&1 || true

   # Invariant: error set must be IDENTICAL (line numbers may shift; error IDs MUST match).
   diff \
     <(grep -oE 'error TS[0-9]+' /tmp/tsc-before.txt | sort -u) \
     <(grep -oE 'error TS[0-9]+' /tmp/tsc-after.txt | sort -u) \
     && echo "OK: typecheck error-set parity preserved" \
     || (echo "CRITICAL: regressions introduced — DO NOT COMMIT"; git reset --hard /tmp/tsc-before-baseline)
   ```

4. **Lint invariant:** `[ $lint_before_count - $lint_after_count -ge $expected_delta ]` (the rule's bucket count must drop by the expected number of substitutions; if not, the run silently no-op'd).

If either invariant fails, **DO NOT COMMIT**. Either revert (`git revert HEAD --no-edit` then amend with diagnosis) or reset to the captured pre-flight state.

### Per-rule playbook

#### C1 — `@typescript-eslint/prefer-nullish-coalescing` (231 → 0 expected)

- This rule emits **suggestion-only** autofixes (`||`→`??` is unsafe for falsy values).
- **`npm run lint:fix` / `eslint --fix` / `--fix-type suggestion` ALL produce 0 changes** in this codebase's ESLint v10 + typescript-eslint v8.60 environment (verified empirically on 2026-07-13).
- The actual fix path is via either:
  - **`npx eslint-interactive src/`** — interactive CLI; operator picks `@typescript-eslint/prefer-nullish-coalescing`, presses `<Enter>`, then `f` to apply suggestions one-by-one. Manual per-file review required.
  - **A programmatic Node script** that consumes the suggestion list from `ESLint.lintFiles({ fix }: true)` and writes fixes back, with per-line review gate.
- Expectation: 0-15% of the 231 may be REJECTED by the operator during interactive review (where the LHS could be a legitimate empty-string or zero fallback). The remaining 85%+ will land type-safely because `recommendedTypeChecked` only flags type-nullish LHS.

#### C2 — `@typescript-eslint/no-unused-vars` (63 → 0 expected)

- This rule's autofixer removes unused destructured siblings and unused imports automatically.
- The standard `npm run lint:fix` works for a subset (mostly unused vars inside function bodies).
- For unused **imports** in this codebase, install **`eslint-plugin-unused-imports`** (separate package, dedicated import-removal rule):

  ```bash
  npm install --save-dev eslint-plugin-unused-imports
  ```

  Then wire it into `eslint.config.mjs`:

  ```js
  // eslint.config.mjs (proposed addition)
  import unusedImports from "eslint-plugin-unused-imports";
  // ...
  rules: {
    "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    "unused-imports/no-unused-imports": "error",  // dedicated plugin
  }
  ```

  Then `npm run lint:fix` will mechanically remove unused imports.
- After the autofix, verify with the two-pass gate (`npx tsc --noEmit` baseline + after).
- For the residual ~5-10 cases that survive both pass paths (e.g., unused types, unused re-exports), per-file manual review.

#### C3 — `@typescript-eslint/no-explicit-any` (30 → 0 expected)

- **NO autofixer exists** for this rule (a fix cannot invent a type).
- Per-location manual type narrowing required:
  - `let payload: any` → narrowing to `unknown` + `typeof x === "..."` checks at use sites. **NOT** a safe mechanical substitution — same narrowing-risk class as C1.
  - `event: any` (e.g., in YouTube/Vimeo player SDK callbacks) → install the SDK's type package or write an `.d.ts` shim.
  - `const items: any[] = []` → narrow to `interface Item { ... }[]` or `unknown[]` + narrows per-element.
- For each substitution, the same two-pass gate (tsc baseline before/after).

#### `react-hooks/set-state-in-effect` (16 → 0 expected)

- **NO autofixer.** This is a React-correctness rule that flags `useEffect(() => { setX(...) }, ...)` patterns — the correct fix depends on the intent:
  - If the setState reads from React-internal state, the fix is often: move the setState into a derived value computation (no `useEffect` needed).
  - If the setState reads from a closure or ref, the fix is often: use `useLayoutEffect` (sync, post-mount) instead of `useEffect`.
  - Sometimes the fix is "this code is wrong; remove it and inline the logic in render or event handlers".
- Per-file manual React refactor; cannot be automated.

#### `@typescript-eslint/require-await` (22 → 0)

- This bucket is **left at `warn`** deliberately per the existing convention in `eslint.config.mjs` (note: "FASE 1.9 quality gate: Next.js App Router route handlers often require `async` signatures by convention...").
- **No action required.** Do NOT attempt to "fix" these — they document a deliberate project convention.

### Recovery procedure (when invariants fail)

If a substitution introduces regressions (tsc error-set parity breaks), recover via:

```bash
# Try in order:
# 1. git revert HEAD --no-edit
#    (preferred — preserves history).
git revert HEAD --no-edit
git commit --amend -m "revert(<ad-hoc>): <rule-name> <commit-sha> introduced <N> typecheck regressions

The bulk substitution crossed TypeScript narrowing guards in <N> spots.
Restoring HEAD~1 (= pre-substitution) state via atomic revert.
See ADR 0010 for the two-pass gate to retry."
git push origin main
```

```bash
# 2. If `git revert` itself errors out mid-pipeline (as observed 2026-07-13
#    with a heredoc-EOF truncation during amend), fall through to:
git reset --hard <pre-flight-anchor-SHA>   # the SHA captured at step 1
git push --force-with-lease origin main

# 3. Anchor the recovery with a follow-up ADR note explaining WHY reset
#    was necessary over revert, so future operators understand the precedent.
```

**DO NOT** use `git reset --hard`+force-push on `main` as the default
recovery path. Revert must be tried first. Force-push is reserved for
cases where the revert itself is mechanically blocked AND the working
tree has diverged from remote. Every force-push MUST be paired with a
follow-up ADR note documenting why reset was chosen over revert.

### Alternatives considered

- **Bulk regex substitution (`sed`-style)** — rejected per the 174-error incident. Cannot see TypeScript narrowing, will produce regressions on every type-aware rule.
- **`npx eslint --fix --fix-type suggestion src/` (with the rule promoted to `error` via `--rule` override at the CLI)** — rejected per the actual incident on 2026-07-13. Empirically produces 0 file changes in this codebase's ESLint v10 + typescript-eslint v8.60 environment despite the suggestion-mode theory. The `eslint-interactive` interactive CLI or a programmatic `ESLint.lintFiles({ fix: true })` Node script is required for this rule (see C1 playbook).
- **Demote type-aware rules from `warn` to `off`** — rejected; hides developer signal so the same narrowing class sneaks back into commits without notice.
- **Just run `npm run lint:fix` and trust the autofix** — rejected per the incident; for type-aware suggestion-only rules this produces 0 changes despite `npx eslint --fix` returning exit 0.

### Consequences

- The original 368-warning lint-cleanup task is now **gated by this ADR**. Operators attempting the cleanup MUST author (or amend) this ADR with the specific rule-bucket they're tackling, the substitution mechanism, and the post-pivot verification result, before merging. **This is not optional.**
- The two-pass gate generalizes to any type-aware rule substitution, not just lint (e.g., test fixture refactors, Codemod scripts). Any code-modifying script that touches code paths with TypeScript narrowing should follow the same gate conceptually.
- The `eslint-plugin-unused-imports` dependency addition is the **only** new dev-dep anticipated by this ADR; once installed, it stays.

## References

- `eslint.config.mjs` — current canonical severity per rule.
- `src/lib/env.ts` — type-aware ESLint rule activation via `recommendedTypeChecked`.
- [TypeScript ESLint docs — `prefer-nullish-coalescing`](https://typescript-eslint.io/rules/prefer-nullish-coalescing/) — confirms suggestion-only autofix.
- [TypeScript ESLint docs — `no-unused-vars`](https://typescript-eslint.io/rules/no-unused-vars/) — confirms partial autofix on destructured siblings only.
- Incident date: 2026-07-13. Commits implicated (now overwritten on remote via force-push): `31ebfc5` (C1), `e01c1ab` (C1-fixup), `e11264b` (revert-on-revert, dropped).
- ADR supersedes the original task phrasing "atomic per-file commits using `npm run lint:fix -- --rule '{...}'` per rule group" — that pattern does not work for type-aware suggestion-only autofixes and was the root cause of the incident.
