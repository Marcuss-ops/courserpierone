# ADR 0011: Course plugin decoupling (physical isolation)

**Status:** Accepted · 2026-07-15
**Deciders:** Platform architecture review
**Supersedes:** Implicit "data/<slug>/ + funnel/<templateId>/" layout that the codebase had since Phase 1.

---

## Context

The Courssy platform shipped V1 with **one course** (Amish Secrets — slug `amish-secrets`). During the build-out, course-specific assets accumulated at project-root paths:

| What | Where it lived (pre-ADR-0011) |
|---|---|
| 49 locale JSON bundles | `data/amish-secrets/{locale}.json` (mixed with other data dirs at root) |
| Amish-specific UI template (orchestrator + 15 section components) | `src/components/funnel/amish/**` |
| Course config (slug, template, lessons, prices, accent color) | `public/courses/amish-secrets/config.json` *(read in `white-label-data.ts` step 3)* |
| Lesson asset PDFs (eBook + checklists) | `public/courses/amish-secrets/*.pdf` *(served via CDN — **kept here**)* |
| "What courses exist?" defaults | Hardcoded `'amish-secrets'` literal in 4+ scripts (`sync-local-config.ts`, `seed-youtube-channels.ts`, `drain-nextauth-tables.ts` mentions, README) |

**Pain points** that triggered this ADR:

1. **Adding a second course** meant either editing ~5 core files (loader, scripts) or accepting per-course hoarding at the root. Both ripe for "amish as the default" drift.
2. **Discoverability** — a contributor opening the repo sees `data/amish-secrets/` and `src/components/funnel/amish/` at root level and reasonably assumes they're "core platform pieces".
3. **Marketing catalog** — there was no static "all courses this platform hosts" page; `/` was personalized DB-driven discovery only. A `/courses` index requires a registry.
4. **Audit** — no machine-checkable guarantee that every `data/<slug>/` folder has a matching `Product` row in the DB.

---

## Decision

Adopt a **plugin-folder model** with three coupled pieces:

### Layout

```
courses/                                 # NEW — course plugin folders
  <slug>/
    locales/<locale>.json                # Was: data/<slug>/<locale>.json
    components/                          # Was: src/components/funnel/<templateId>/
    config.json                          # Was: public/courses/<slug>/config.json
public/courses/<slug>/*.pdf              # UNCHANGED — served lesson assets
courses.config.ts                        # NEW at root — static COURSES[] registry
src/lib/courses/registry.ts              # DEPRECATED — temporary typed compatibility shim
src/app/courses/page.tsx                 # NEW — registry-driven /courses catalog
```

### Reader contracts

| Reader | Reads from | Why |
|---|---|---|
| `src/lib/i18n/load-locale-content.ts` | `process.cwd() + "/courses/<slug>/locales/<locale>.json"` | Locale content is the meat of a course; co-located with components. |
| `src/lib/config/white-label-data.ts` (step 3) | `process.cwd() + "/courses/<slug>/config.json"` | Config is per-course; no `public/` mirror (avoid drift, ADR §Q2 verdict). |
| `src/components/funnel/template-amish.tsx` | `@courses/amish-secrets/components` (path alias) | Switched from `./amish` after move. |

### Build & deploy contract

| Knob | Value | Why |
|---|---|---|
| `next.config.mjs` `outputFileTracingIncludes` | `'./courses/**/*.json'` | Vercel bundles these into the serverless Lambda so `fs.readFile` works at runtime. |
| `tsconfig.json` `paths` | Add `"@courses/*": ["./courses/*"]` | Lets TSX components be imported without polluting `src/`. |
| Validation | `node scripts/products/sync-local-config.ts <slug>` rejects if slug ∉ registry | Operators must declare a course in `courses.config.ts` before syncing. |
| Audit | `scripts/audit-v1-readiness.ts` checks `Product.slug == courses.config.ts slug` for every entry | Drift gate. |

### Registry contract

```ts
// courses.config.ts — the canonical list of courses this deployment hosts.
export const COURSES: CourseMeta[] = [
  { slug: "amish-secrets", ... }
];
Landing targets must always be supplied explicitly by the caller. An empty registry has no fallback landing slug.
```

The registry in `courses.config.ts` is the single source of truth for:

- **Marketing catalog** (`/courses` page iterates `ACTIVE_COURSES`).
- **YouTube attribution defaults** (`scripts/db/seed-youtube-channels.ts` iterates `COURSES[]` to generate one channel per `(course, locale)`.
- **Performance-script defaults** (`scripts/products/sync-local-config.ts <slug>` throws if slug ∉ registry)
- **DB seeding** (`sync-local-config.ts` upserts both `Product` and `CourseConfigCache` rows from the on-disk `courses/<slug>/config.json` and `COURSES[]` metadata).

`src/lib/courses/registry.ts` remains only as a temporary compatibility shim for
legacy imports; new consumers must import the canonical root registry directly.

### "Drop a new course" recipe (the success criterion)

1. Create folder `courses/<new-slug>/{locales/<locale>.json, components/index.tsx, config.json}` mirroring the amish layout.
2. Append a `CourseMeta` entry to `COURSES` in `courses.config.ts`.
3. Run `npx tsx scripts/products/sync-local-config.ts <new-slug>` (upserts `Product` + `CourseConfigCache` in DB).
4. `git add . && git commit && git push`. **Zero changes to core loader, scripts, config files.**

---

## Consequences

**Positive**

- New contributor opens the repo → course-specific files live under `courses/<slug>/` instead of being scattered across `data/` and `src/components/funnel/`.
- `courses.config.ts` is the **only** place that lists what courses the platform offers — no more grepping for `'amish-secrets'` literals.
- `/courses` static catalog ships to the edge before any DB connectivity — survives transient DB outages.
- `git mv` preserves file history for the decoupled Amish subtree (50 locale JSONs + ~16 TSX components).
- CI audit (`scripts/audit-v1-readiness.ts`) catches registry ↔ DB ↔ filesystem drift before deploy.

**Negative**

- 11 files moved / 8 files updated / 4 files new in one commit (= the single ADR-driven commit). Future contributors learning git blame need both old and new paths.
- `next.config.mjs` trace config is more restrictive (`*.json` only) — accidental addition of `*.tsx` under `courses/` would NOT be bundled to Lambda (but won't break anything because TSX is compiled by webpack/turbopack regardless).
- Removed `scripts/products/fix-amish-template.ts` previously existed with literal amish name; that script was already removed in the cleanup sweep (commit history confirms).

---

## Alternatives considered (and rejected)

**A. Status quo (no moves)** — future courses = `data/<slug2>/` + `funnel/<slug2>/` + scripts hardcoded. **Rejected:** ongoing "amish-as-default" drift.

**B. Plugin folder, no registry** — same as decision but no `COURSES[]`; rely on filesystem-only. **Rejected:** still need a registry somewhere for the marketing catalog + YouTube defaults; doing it statically is cheaper than a DB query at edge.

**C. Sub-app routing (per-course Next.js subdomain)** — `amish.courssy.com` as a fully isolated subdeploy. **Rejected:** over-engineered for V1; re-evaluate when courses > 5 or one course needs a fundamentally different runtime.

---

## Verification

- `npx tsc --noEmit` — 0 errors.
- `npm run validate:locales` (now reads `courses/<slug>/`) — passes.
- `npm run build` — bundles `./courses/**/*.json` to Lambda (visible in `.next/standalone`).
- `GET /it/amish-secrets` — landing renders (course URL is unchanged — only the file paths moved).
- `GET /courses` — registry catalog renders.
- `npx tsx scripts/products/sync-local-config.ts` (no arg) — fails fast with usage error.
- `npx tsx scripts/db/seed-youtube-channels.ts` — generates channels for every course in `COURSES[]`.

---

## Implementation log

- 2026-07-15: ADR accepted; folder relocations complete; new files written; existing scripts refactored to consume the registry; existing loader + tsconfig + next.config updated; config.json source-of-truth moved out of `public/courses/` (no mirror); `git mv` preserved blame history.
