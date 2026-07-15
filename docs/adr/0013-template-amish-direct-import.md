# ADR 0013: Template-amish direct-import workaround (deferred plugin rendering)

**Status:** Accepted · 2026-07-15
**Deciders:** Platform architecture review
**Parent:** ADR-0011 (Course plugin decoupling)
**Supersedes:** —

---

## Context

ADR-0011 established the **plugin-folder model** for course content:

```
courses/<slug>/
  locales/<locale>.json
  components/         ← course-specific renderer
  config.json
```

…with the promise that adding a new course requires **zero core-code changes** for content, locale, and config (only a registry entry in `courses.config.ts` + a `sync-local-config.ts` upsert).

For **rendering**, however, ADR-0011 sidestepped the question. The current state is:

```
src/components/funnel/
  template-amish.tsx          ← re-exports @courses/amish-secrets/components
  template-lumio.tsx          ← local renderer
  template-h612.tsx           ← local renderer
  template-horizon.tsx        ← local renderer
  template-book-claude.tsx    ← local renderer
  types.ts                    ← 5-value TemplateId (subset of CourseTemplateId)
  …/<templateId>/             ← shared subrenderers (header, footer, cta…)
```

The four "local renderer" templates ship their component tree inside `src/components/funnel/<templateId>/`. **Only amish re-exports from `@courses/amish-secrets/components`** — a hardcoded path alias to a specific plugin folder. This is the single deviation from the ADR-0011 promise.

### Why amish is the exception

| Reason | Detail |
|---|---|
| **Authoring ergonomics** | `courses/amish-secrets/components/` was developed iteratively during Amish Secrets authoring. Keeping the renderer next to `locales/*.json` and `config.json` let translators + copywriters iterate in one folder. |
| **Single course as proof-of-concept** | At ADR-0011 acceptance time, the platform shipped exactly one course (amish). The plugin-renderer promise was theoretical; the local-renderer pattern was the proven one. |
| **td-module separation not enforced** | The tsconfig `@courses/*` alias makes importing from `courses/*` syntactically cheap, so the re-export wrapper felt like a minimal adapter — but it created an implicit 1:1 binding. |

---

## Decision

We accept the workaround as-is **for V1.x** and document it explicitly here. The refactor path to a uniform renderer model is deferred until a second course ships with its own plugin-folder renderer.

### Status quo (V1.x)

- Amish renderer remains at `courses/amish-secrets/components/`.
- `src/components/funnel/template-amish.tsx` is a **single-line re-export** adapter (`export { default } from "@courses/amish-secrets/components"`) — marked with a TODO comment linking to this ADR.
- Other four templates keep their local-renderer pattern.
- `CourseTemplateId` (single source of truth, in `src/lib/courses/templates.ts`) covers the intersection plus `"default"`.

### Exit strategy (when trigger fires)

When a SECOND course ships with its own `courses/<slug>/components/` renderer, **promote the plugin-renderer model**:

1. Replace the `template-{templateId}.tsx` re-export with a generic `template-{templateId}.tsx`:
   ```ts
   export { default } from `@courses/${slug}/components`; // resolved at build time
   ```
   …or, more realistically, power the renderer swap from a per-course `templateId` field in `COURSES[]` resolved at the funnel page level (already the case for `default` via inline-JSX fallback).

2. Move the four local renderers (`template-lumio.tsx` + 3 others) OFF `src/components/funnel/` into `courses/<existing-slug>/components/` if/when their course slugs are retrofitted with plugin folders.

3. Reserve `src/components/funnel/types.ts` `TEMPLATES` map as the "switch registry" — registry-driven renderer lookup, no hardcoded `template-{templateId}.tsx` files.

4. Drop this ADR (`Status: Superseded by ADR-XXXX`) once the second course renderer comes online.

### V1.x trigger conditions (any of):

- A second course ships with its own plugin-folder renderer (forces unification).
- `courses/amish-secrets/components/` is duplicated into a second `courses/<slug>/components/` for any non-amish course.
- `git blame` shows > 50% of renderer evolution happens inside `courses/amish-secrets/components/`, proving the plugin-renderer model is mature enough.

---

## Consequences

**Positive (V1.x)**
- No rewrite cost now — the workaround is one line + a TODO comment.
- Amish authoring velocity preserved (translators + copywriters iterate in one folder).
- Documentation of the deviation is explicit, so future contributors aren't surprised by `@courses/amish-secrets/components` showing up in `src/components/funnel/`.

**Negative (deferred)**
- `src/components/funnel/template-amish.tsx` is the only file in `src/components/funnel/` that imports from `@courses/*`. This is a **boundary leak** — the directory is supposed to contain local renderers, plugin folder imports violate that contract.
- A future contributor copy-pasting `template-amish.tsx` as a starting point for `template-<newone>.tsx` will inadvertently couple another template to a plugin folder.
- TypeScript's `paths` (`@courses/*`) makes the import look ergonomic, masking the architectural debt.

**Capture in code (mitigation)**
- The TODO comment in `template-amish.tsx` explicitly links to this ADR and flags it as the single exception.
- This ADR is referenced from the file comment (so a `git grep ADR-0013` finds both sides).

---

## Verification (V1.x)

- `npx tsc --noEmit` — passes (the re-export works at type level).
- `grep -rn "@courses/" src/components/funnel/` — `template-amish.tsx` is the *only* match. Any new match is a regression and triggers a `git blame` review.
- `git log --oneline -- src/components/funnel/template-amish.tsx` — shows the TODO + ADR-0013 link commit; future merges keep the marker.

---

## Implementation log

- 2026-07-15: ADR accepted as a single-line deviation with explicit TODO marker. `CourseTemplateId` consolidated in `src/lib/courses/templates.ts` (separate refactor — centralizes the 6-value union once used in 3 places: `courses.config.ts` → `CourseMeta`, `white-label-data.ts` → `CourseConfig`, `audit-courses-drift.ts` → audit `CourseMeta`).
- Followup: when the second course ships a plugin renderer, promote Step 1 of the exit strategy.
