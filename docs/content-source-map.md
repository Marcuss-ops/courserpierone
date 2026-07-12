# Content Source Map

> **Status:** Pre-cleanup inventory. Single source of truth for which content surface reads what.
>
> This file is the **prerequisite** for any cleanup on `LandingTranslation` / `CourseConfigCache` / locale JSONs. Future audits can compare repo grep results against this map to detect drift.

This document traces 4 distinct **data sources**, 6 **templates**, and 3 **public pages** that read from those sources, in **precedence order**. It also enumerates dead-on-arrival models and the cleanup implications.

---

## 1. Data sources (4)

### 1.1 `ProductTranslation` (Prisma model)

| Aspect | Value |
|---|---|
| Contains | Section-keyed semantic segments (`problema`, `storia`, `recensioni`, `cta`, `titolo`, `sottotitolo`) per `(productId, locale, section)` |
| Schema | `prisma/schema.prisma` model `ProductTranslation` |
| Written by | Admin UI (`src/app/admin/products/[id]/page.tsx`, `src/app/admin/products/new/page.tsx`) |
| Read by | **Admin UI only** — `src/app/admin/products/[id]/page.tsx:64,104,145,153,154,171,177`, `src/app/admin/products/new/page.tsx:58` |
| Read on public pages | **NEVER** |
| Status | Live (admin-scoped) |

### 1.2 `LandingTranslation` (Prisma model)

| Aspect | Value |
|---|---|
| Contains | Flat landing strings (`heroTitle`, `heroSubtitle`, `heroDescription`, `problemText`, `storyText`, `ctaText`, `benefits`, `testimonials`, `faq`, `bonusLabel`, `guaranteeText`) per `(slug, locale)` |
| Schema | `prisma/schema.prisma` model `LandingTranslation` (lines ~245-275) |
| Written by | No active writer (presumably a historic DB-seed/import script) |
| Read by | **ZERO** — confirmation: `grep -rn 'LandingTranslation' src/` returns 0 hits (verified during this audit) |
| Status | **Dead model** — top cleanup candidate |

### 1.3 `CourseConfigCache` (Prisma model)

| Aspect | Value |
|---|---|
| Contains | Full `CourseConfig` JSON snapshot per `slug` (prerendered by `generateCourseConfig`) |
| Schema | `prisma/schema.prisma` model `CourseConfigCache` (lines ~178-185) |
| Written by | `scripts/fix-amish-template.ts:32,44`, `scripts/products/sync-local-config.ts:30`, `src/lib/config/generate-course-config.ts:193`, **and** auto-populated by `getCourseConfig` step 5 → 4 fallback |
| Read by | `src/lib/config/white-label-data.ts:108` (step 4 of `getCourseConfig` chain) |
| Status | Live (highest-write-frequency source) |

### 1.4 Public JSON files (`public/courses/[slug]/config.json` + `data/[slug]/[locale].json`)

| Aspect | Value |
|---|---|
| Contains (config.json) | Full `CourseConfig` — slug, template, lessons, languages, prices, accent color, etc. |
| Contains (data/[slug]/[locale].json) | 49+ locale bundles per slug — `nav`, `hero`, `problem`, `story`, `author`, `modules`, `includes`, `testimonials`, `offer`, `faq`, `final_cta`, `footer`, `trust`, `audience`, `seo`, `ui` |
| Written by | `scripts/translate/extract-locales.ts` (regenerates from input data), `scripts/translate/sync-data-to-config.ts:86` (writes config.json), `scripts/products/copy-pdfs.ts`, `src/lib/config/generate-course-config.ts:189` (writes `courseDir/config.json`), admin "Genera config.json" button in `src/app/admin/products/[id]/page.tsx:236` |
| Read by | `src/lib/config/white-label-data.ts:96` (step 3 of `getCourseConfig` chain) + `src/lib/i18n/load-locale-content.ts` (loadLocaleContentSafe + loadLocaleContentCached) |
| Status | Live (filesystem-bound — deployment requires rebuild to push data/ updates to Vercel) |

---

## 2. Templates (4 + fallback)

> **Templates are pure render components.** They do NOT add any of their own data-source reads. Every data the template renders is handed to it via the orchestrator page (`[domain]/page.tsx`) as a `templateData` prop + a flattened `localeContent` merged into `ui.labels`. The template's own job is layout/props-only mapping.

| Template ID | Orchestrator file path | Sections consumed (shared/) | Notes |
|---|---|---|---|
| `lumio` | `src/components/funnel/lumio/index.tsx` (re-exported from `template-lumio.tsx`) | SharedStory, SharedLessons, SharedTestimonials, SharedCTA, SharedProblem, LanguageAlert | Warm cream sunset gradient |
| `h612` | `src/components/funnel/h612/index.tsx` (`template-h612.tsx`) | SharedStory, SharedTestimonials, SharedProblem | Dark monochrome serif |
| `horizon` | `src/components/funnel/horizon/index.tsx` (`template-horizon.tsx`) | SharedStory, SharedLessons, SharedTestimonials | Airy atmospheric |
| `amish` | `src/components/funnel/amish/index.tsx` (`template-amish.tsx`) | Uses `useAmishI18n` + its own section components | Warm orange + Playfair serif |
| `book-claude` | `src/components/funnel/book-claude/` | its own section components | EBook-focused variant |
| `default` (fallback) | Inline JSX inside `[domain]/page.tsx` (bottom DEFAULT TEMPLATE section) | None — hand-rolled minimal | Used when `data.template` is unrecognized |

**Selector:** The orchestrator page dispatches to a template via `switch (data.template)` based on `data.template` field of the resolved `CourseConfig` (line ~303-313 of `[domain]/page.tsx`).

---

## 3. Public pages (3) — read precedence order

### 3.1 `LocaleLandingPage` — `/[locale]/[domain]`

- **File:** `src/app/(locale)/[locale]/[domain]/page.tsx`
- **Role:** Public funnel landing — dispatches to one of the 4 templates based on `CourseConfig.template`.

| Step | Source | Type | Where in code | Notes |
|---|---|---|---|---|
| 1 | Redis cache `config:{slug}` | CACHE (cross-instance, 5 min TTL) | `src/lib/config/white-label-data.ts:72-75` | Requires Upstash/Redis env. Best on Vercel production. |
| 2 | In-process `_memoryCache` | CACHE (per-request, 5 min) | `src/lib/config/white-label-data.ts:78-81` | Zero-touch between requests in same lambda. |
| 3 | File system `public/courses/{slug}/config.json` | FILE (local-dev only) | `src/lib/config/white-label-data.ts:96-103` | Read-only on Vercel runtime — fails silently, falls through to step 4. |
| 4 | DB `CourseConfigCache.findUnique({ where: { slug } })` | DB (Postgres) | `src/lib/config/white-label-data.ts:108-114` | Authoritative on Vercel. |
| 5 | Auto-generate `generateCourseConfig(slug)` from DB | DB write-then-read | `src/lib/config/white-label-data.ts:120-127` | First-visit-after-deploy: hydrates step 4 for next read. |
| Fallback | `notFound()` 404 | — | `src/lib/config/white-label-data.ts` returns null | When all 5 steps miss + DB-autogen fails (e.g. slug doesn't exist). |
| Six | `loadLocaleContentSafe(domain, currentLocale)` | FILE (bundled at build) | `[domain]/page.tsx` line ~178 | Reads `data/[slug]/[locale].json` → falls back through `locale`, language code, default. Flat-merged into `ui.labels`. |

### 3.2 `ProductPortalPage` — `/[locale]/[domain]/portal`

- **File:** `src/app/(locale)/[locale]/[domain]/portal/page.tsx`
- **Role:** Post-purchase hub — gated entry to video lessons + eBook. Mirrored landing-page reads + creator/owner lookup.

| Step | Source | Type | Where in code | Notes |
|---|---|---|---|---|
| 1-5 | Same `getCourseConfig(domain)` chain as LocaleLandingPage | CACHE → FILE → DB → AUTO | `src/lib/config/white-label-data.ts:67-130` | Identical 5-step precedence. |
| 6 | `loadLocaleContentCached(domain, lang)` | CACHE + FILE (`load-locale-content.ts`) | `[domain]/portal/page.tsx` line ~76 | Redis-cached variant of step 6 above. |
| 7 | `getDmContext(domain, isAuthed)` | DB (read-only) | `src/lib/messaging/get-dm-context.ts` | Fetches creator + product for the "Contatta il creator" button. |
| 8 | `AccessGate` wrapper | AUTH GATE | `src/components/course/access-gate.tsx` | Wraps the entire page; checks Order.completed for product. |

### 3.3 `CoursePage (lesson)` — `/[locale]/[domain]/curso/[lessonId]`

- **File:** `src/app/(locale)/[locale]/[domain]/curso/[lessonId]/page.tsx`
- **Role:** Single-lesson viewer with sidebar lesson-list + video player.

| Step | Source | Type | Where in code | Notes |
|---|---|---|---|---|
| 1-5 | Same `getCourseConfig(domain)` chain | CACHE → FILE → DB → AUTO | `src/lib/config/white-label-data.ts:67-130` | Identical to landing. |
| 6 | `loadLocaleContentSafe(domain, lang)` | FILE (`load-locale-content.ts`) | `[domain]/curso/[lessonId]/page.tsx` line ~84 | Same as landing step 6. |
| 7 | `course.lessons[].videos[locale]` | (resolved from `CourseConfig` JSON) | Inline in page | The video URL is keyed by locale via `LessonConfig.videos`. **Transitive upstream note:** `videos[locale]` is ultimately rooted in `LessonTranslation.videoUrl` rows via the `generateCourseConfig(slug)` auto-generator (step 5). JSON edits are valid, but `LessonTranslation` is the canonical write source — don't rely on JSON-only edits when cleaning up. |
| 8 | `getDmContext(domain, isAuthed)` | DB (read-only) | `src/lib/messaging/get-dm-context.ts` | Same DM-button helper. |
| 9 | `AccessGate` wrapper | AUTH GATE | `src/components/course/access-gate.tsx` | Same as portal. |

---

## 4. Cross-cutting Readers Table

| Reader | Reads | From | Precedence |
|---|---|---|---|
| LocaleLandingPage orchestrator (`[domain]/page.tsx`) | `CourseConfig` + `LocaleContent` | Redis, Mem, FS, DB cache, FS-bundle | 1-2 cache → 3-5 DB-chained → 6 build-bundle FS |
| ProductPortalPage orchestrator (`portal/page.tsx`) | `CourseConfig` + `LocaleContent` + DM context + order check | Same + Redis-cached locale variant | 1-5 → 6 (cached) → 7 (DB) → 8 (gate) |
| CoursePage (lesson) orchestrator (`curso/[lessonId]/page.tsx`) | `CourseConfig` + `LocaleContent` + DM context + order check | Same | 1-5 → 6 → 7 (video) → 8 (DB) → 9 (gate) |
| Admin products list page (`src/app/admin/page.tsx`) | Product list via Prisma | DB | Direct query |
| Admin products edit page (`src/app/admin/products/[id]/page.tsx`) | `ProductTranslation` (sections per locale) | DB | Direct query |
| Admin product new page (`src/app/admin/products/new/page.tsx`) | `ProductTranslation` (sections per locale) | DB | Direct query |
| `generateCourseConfig` script (`src/lib/config/generate-course-config.ts`) | (writer) | DB rows → JSON payload | DB-derived |
| `sync-data-to-config` script (`scripts/translate/sync-data-to-config.ts`) | (writer) | `data/[slug]/[locale].json` aggregator → `public/courses/.../config.json` | FS aggregator → FS writer |
| `fix-amish-template` script (`scripts/fix-amish-template.ts`) | `CourseConfigCache` + `Product` | DB read + write | Direct DB |
| `sync-local-config` script (`scripts/products/sync-local-config.ts`) | `CourseConfigCache` + local `config.json` | DB write + FS read | DB writer (hydrates from FS source) |

---

## 5. Dead models / YAGNI

- **`LandingTranslation`** — entirely dead on arrival. Model defined in `prisma/schema.prisma`, ZERO consumers in `src/`. Drop in a follow-up cleanup commit (also gate via `scripts/audit-v1-readiness.ts` semantics — possibly promote to a TechDebt item in `docs/roadmap-current.md`).
- **Per-template I/O greps:** Each template file under `src/components/funnel/<name>/` was verified to not call any of the canonical source readers (`getCourseConfig`, `prisma.product.findUnique`, etc.) directly. Templates are render-only.
- **`ProductTranslation` public irrelevance:** §1.1 confirms admin-only. **Safely ignored** for any public-feature work.

---

## 6. Implications for future cleanup

- ✅ **Touching `LandingTranslation` = safe.** Zero readers to break. Drop the model + migration + DB table.
- ⚠️ **Touching `ProductTranslation` = dangerous for Admin.** Even though it's not on the public path, removing it breaks the admin products section edit flow.
- ⚠️ **Touching `CourseConfigCache` = careful.** Changes here MUST update `src/lib/config/white-label-data.ts` + `src/lib/config/generate-course-config.ts` + the 3 admin sync scripts (`fix-amish-template.ts`, `sync-local-config.ts`, `sync-data-to-config.ts`) in lockstep.
- ✅ **Adding a new locale safely = add a JSON file in `data/[slug]/[locale].json`.** `loadLocaleContentSafe` flat-merges into `ui.labels` automatically; no code change required.
- 🚨 **Inlining `getCourseConfig` body = HIGH RISK.** All 3 public pages route through this function + 3 scripts. Bypassing any step removes the local-dev → Vercel graceful degradation.

---

## 7. Update log

- **Initial draft:** this commit. Establishes the map as a prerequisite for any `LandingTranslation` / `CourseConfigCache` cleanup.
- Future updates should diff-verify against source-code grep before merging:
  - `grep -rn 'LandingTranslation' src/` (must stay 0)
  - `grep -rn 'getCourseConfig\|loadLocaleContent\|loadLocaleContentCached\|getDmContext\|AccessGate' src/` (must stay consistent with map)
  - `grep -rn 'prisma.productTranslation\|prisma.landingTranslation\|prisma.courseConfigCache' src/` (must match §1 listings)
