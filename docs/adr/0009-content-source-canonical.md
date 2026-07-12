# ADR 0009: Content Source Canonicalization

> **Status:** Proposed
> **Date:** 2026-07-12
> **Fase:** 9 (Content sources consolidation)
> **Supersedes:** n/a
> **Related:** [docs/content-source-map.md](../content-source-map.md) (the prerequisite consumer map)

---

## 1. Context

The current content pipeline is fragmented across **4 data sources** that overlap, have inconsistent write/read authority, and force runtime writes to an ephemeral Vercel filesystem:

| # | Source | Type | Currently authoritative? |
|---|---|---|---|
| 1 | `LandingTranslation` (Prisma) | DB | **No** — zero consumers in `src/` |
| 2 | `ProductTranslation` (Prisma) | DB | Yes (admin writes) → feeds `CourseConfig` |
| 3 | `CourseConfigCache` (Prisma) | DB | Yes (read-through cache, write-coalesced) |
| 4 | `public/courses/[slug]/config.json` | FS | **Shadow DB** for visual fields missing from Prisma |
| 5 | `data/[slug]/<locale>.json` | FS | Build-time content bundle (DB-derived) |

The runtime resolution chain in `src/lib/config/white-label-data.ts:67-130` (`getCourseConfig`) is **5 steps** and includes a `fs.readFileSync` of `public/courses/.../config.json` (step 3) that **silently fails on Vercel** because the filesystem is read-only there. The function then falls through to a DB read, so the FS step is dead-on-prod. The same file is also **written at runtime** by `src/lib/config/generate-course-config.ts:189-195` (gated by `!IS_VERCEL`) and by `scripts/translate/sync-data-to-config.ts:86` and the admin "Genera config.json" button — meaning local dev accumulates drift that prod never sees.

**Goal:** strict directional flow **Database = source of truth → Cache = derivata → UI = consumers**, with `public/courses/[slug]/config.json` eliminated from the production path. No runtime FS writes. One canonical surface per concern.

---

## 2. Audit facts (consumer matrix)

The full map is in [content-source-map.md](../content-source-map.md) §1. Summary:

### 2.1 `LandingTranslation` (Prisma model, `schema.prisma:369-399`)

- Keyed by `(slug, locale)`. Flat fields: `heroTitle, heroSubtitle, heroDescription, problemText, storyText, ctaText, benefits, testimonials, faq, bonusLabel, guaranteeText`.
- **Consumers in `src/`:** **0** — verified by `grep -rn 'landingTranslation\|LandingTranslation' src/` (excluding this ADR).
- **Writers in `src/`:** **0** — no admin UI, no API route, no seed script.
- **RLS policy:** `deny_all_LandingTranslation` in `prisma/migrations/.../secure-rls.sql:64-65` — even an authenticated user cannot read it.
- **Conclusion:** **dead on arrival**.

### 2.2 `ProductTranslation` (Prisma model, `schema.prisma:64-77`)

- Keyed by `(productId, locale, section)`. Flexible section discriminator. Active sections: `problema, storia, recensioni, cta, titolo, sottotitolo, ui_all, seo_title, seo_description, og_image`.
- **Writers:** `src/app/admin/products/[id]/page.tsx`, `src/app/admin/products/new/page.tsx`, `src/app/api/products/route.ts:104,122`, `src/app/api/products/[id]/route.ts:74,101`.
- **Readers:**
  - Admin UI (re-loads on edit)
  - `src/lib/config/generate-course-config.ts:65-95` (groups by locale, builds `CourseConfig.languages[locale]`)
  - `scripts/translate/extract-locales.ts:469-471` (groups by locale, builds `data/<slug>/<locale>.json`)
- **Active status:** Yes — feeds all 3 public pages via the `CourseConfig` JSON.

### 2.3 `CourseConfigCache` (Prisma model, `schema.prisma:276-283`)

- Keyed by `slug`. Stores `config: String` (JSON of full `CourseConfig`).
- **Writers:**
  - `src/lib/config/generate-course-config.ts:193-198` — auto-fills cache from DB on first read.
  - `scripts/products/fix-amish-template.ts:32,44` — admin one-off.
  - `scripts/products/sync-local-config.ts:30` — hydrates cache from local `config.json`.
- **Readers:**
  - `src/lib/config/white-label-data.ts:108-114` (step 4 of `getCourseConfig` chain).
- **Active status:** Yes — but it has **3 writers** when 1 (the auto-regen) would suffice.

### 2.4 `public/courses/[slug]/config.json`

- **Writers:**
  - `src/lib/config/generate-course-config.ts:189-195` (`if (!IS_VERCEL)`) — runtime auto-write
  - `scripts/translate/sync-data-to-config.ts:86` — admin one-off merge from `data/`
  - `src/app/admin/products/[id]/page.tsx:236` — "Genera config.json" button
  - `scripts/products/sync-local-config.ts:30` — reads this file → writes cache (drains the FS read)
- **Readers:**
  - `src/lib/config/white-label-data.ts:96-103` (step 3 of `getCourseConfig`, falls through silently on Vercel)
  - `src/lib/config/generate-course-config.ts:51-58` (`existingConfig` read for visual fields: `defaultLanguage, cover, authorImageUrl, storyImages, accentColor, checkoutUrl, author, ebookChapters`)
- **`public/courses/` is in `.gitignore` lines 9-10** (`public/courses/*` + `!.gitkeep`) — only `amish-secrets/` exists locally, with 11 files (mostly per-locale PDFs).
- **Conclusion:** this file is a **shadow DB** for 8 visual fields missing from `Product.*` schema. Eliminating it requires moving those fields into `Product` (Decision 2 below).

### 2.5 `data/[slug]/<locale>.json` — content bundle (NOT config)

- 49+ locale files per slug. Schema: `nav, hero, problem, story, author, modules, includes, testimonials, offer, faq, final_cta, footer, trust, audience, seo, ui`.
- **Writers:** `scripts/translate/extract-locales.ts` (DB → JSON, "extract" script).
- **Readers:** 5 server components via `loadLocaleContentSafe`/`loadLocaleContentCached` (`src/lib/i18n/load-locale-content.ts`).
- **Vercel behavior:** read-only, bundled at deploy time → effectively static.
- **Active status:** **Yes** — but it is **content** (not config) and is **derived from the DB** at build/extract time. It does not violate the SSOT principle.

---

## 3. Decisions

### Decision 1: Drop `LandingTranslation` entirely (no merge with `ProductTranslation`)

**Rationale:** `LandingTranslation` is dead. `ProductTranslation` is the live surface. They are **not parallel** in shape or in key strategy:

| Aspect | `LandingTranslation` | `ProductTranslation` |
|---|---|---|
| Key | `(slug, locale)` | `(productId, locale, section)` |
| Shape | flat fields (heroTitle, heroSubtitle, …) | section-discriminated key-value |
| Consumers | 0 | 3 (admin + 2 builders) |
| Writers | 0 | 4 (admin UI + 2 API routes) |
| RLS | `deny_all` | admin-only |

Merging the two would either (a) bloat `ProductTranslation` with 10 unused flat fields, or (b) create a hybrid that nobody can navigate. Drop is the clean call.

### Decision 2: Remove `public/courses` reads/writes — **Option A: add visual fields to `Product`**

The 8 fields currently read from `existingConfig` (`generate-course-config.ts:51-58`) but missing from `Product` are:

| Field | Type | New `Product.*` column |
|---|---|---|
| `defaultLanguage` | String | `Product.defaultLanguage` already exists (line 50) — no change |
| `cover` | String | `Product.coverUrl` already exists (line 14) — no change |
| `authorImageUrl` | String? | **add** `authorImageUrl String?` |
| `storyImages` | String[] | **add** `storyImages String?` (JSON) |
| `accentColor` | String? | **add** `accentColor String?` |
| `checkoutUrl` | String | **add** `checkoutUrl String?` |
| `author` | String | **add** `author String @default("Brand")` |
| `ebookChapters` | `{it,en,page}[]` | **add** `ebookChapters String?` (JSON) |

**Why Option A over alternatives:**
- **Option B (keep FS read as meta-only in `generateCourseConfig`):** leaves the shadow DB intact. Doesn't achieve the stated goal.
- **Option C (hardcode defaults):** loses the per-product visual customization the templates rely on.
- **Option A** is the only path that achieves **pure DB SSOT** and lets us drop step 3 of `getCourseConfig` cleanly.

### Decision 3: Keep `data/[slug]/<locale>.json` as a derived build artifact

These are content bundles (not config) and they are **generated FROM the DB** by `extract-locales.ts`. They are read-only at runtime. They comply with the SSOT principle: **DB is the source, `data/` is a derived cache materialized at build time.** Migrating them to DB rows (e.g., one `ContentSection` row per key) is a **V2 candidate** — it would require schema changes and a full re-shape of the 49+ locale bundles. Out of scope for Fase 9.

---

## 4. New `getCourseConfig` chain (post-Fase 9)

| Step | Source | Type | Notes |
|---|---|---|---|
| 1 | Redis `config:{slug}` | Cache (5 min TTL) | Vercel cross-instance |
| 2 | In-memory `_memoryCache` | Cache (5 min, per-request) | Zero-touch in same lambda |
| 3 | DB `CourseConfigCache.findUnique({ where: { slug } })` | DB (authoritative) | Replaces old step 4 |
| 4 | Auto-regen `generateCourseConfig(slug)` | DB write-then-read | First-visit-after-deploy; writes cache for next read |
| Fallback | `null` | — | Product doesn't exist |

**Step removed:** old step 3 (FS read of `public/courses/.../config.json`). **Writes removed:** the `if (!IS_VERCEL)` block in `generate-course-config.ts:189-195` and the `existingConfig` read at lines 51-58.

---

## 5. Sequence (atomic commits, each pushed to `main`)

> **Rule:** never delete a model or writer until the next-layer replacement is in place. Each step must leave the repo in a buildable + test-passing state.

### Step 1 — ADR (this commit) ✅
- Add `docs/adr/0009-content-source-canonical.md` (this file).
- No code changes. No deletions.

### Step 2 — Schema expansion
- Add 5 new columns to `model Product` in `prisma/schema.prisma`: `authorImageUrl String?`, `storyImages String?`, `accentColor String?`, `checkoutUrl String?`, `author String @default("Brand")`, `ebookChapters String?`.
- Generate `prisma/migrations/YYYYMMDDHHMMSS_add_product_visual_fields/migration.sql` with `ALTER TABLE` for each.
- **Backfill** is a separate step (Step 3) — schema alone doesn't migrate data.

### Step 3 — Backfill script (one-off, idempotent)
- New `scripts/products/migrate-config-json-to-product.ts`.
- For every `Product` row, read `public/courses/<slug>/config.json` (if present locally) and copy the 5 visual fields into the new columns.
- Idempotent: re-running overwrites with the same value.
- **Must run before Step 4** — otherwise the new DB columns stay null and visual fields disappear from prod.

### Step 4 — Remove FS reads/writes (highest risk)
- `src/lib/config/white-label-data.ts`: delete step 3 (lines 96-103).
- `src/lib/config/generate-course-config.ts`:
  - Delete the `existingConfig` read at lines 51-58.
  - Delete the `if (!IS_VERCEL) { fs.writeFileSync(...) }` block at lines 189-195.
  - Update field sources to read from `Product.*` (the 5 new columns + existing `defaultLanguage` + `coverUrl`).
- `public/courses/` is already in `.gitignore` — no further action needed; the directory dies on its own.

### Step 5 — Cleanup scripts
- **Delete** `scripts/translate/sync-data-to-config.ts` (its only job was merging `data/.../*.json` INTO `config.json`).
- **Delete** `scripts/products/sync-local-config.ts` (its only job was hydrating `CourseConfigCache` from local `config.json`).
- **Repurpose** `scripts/products/fix-amish-template.ts` → rename to `regenerate-cache.ts`; strip the read+write of `CourseConfigCache`, leave only the `prisma.courseConfigCache.upsert({...})` call so it becomes a pure "regenerate cache" tool.

### Step 6 — Drop `LandingTranslation`
- Remove `model LandingTranslation` from `prisma/schema.prisma` (lines 369-399).
- Generate `prisma/migrations/YYYYMMDDHHMMSS_drop_landing_translation/migration.sql` with `DROP TABLE "LandingTranslation" CASCADE;` + `DROP POLICY IF EXISTS deny_all_LandingTranslation ON "LandingTranslation";` (or equivalent — verify RLS first).
- Remove the RLS lines from `prisma/migrations/.../secure-rls.sql` if not auto-handled.
- No application code changes (zero consumers).

### Step 7 — `audit-v1-readiness.ts` update
- Add a section: `TRANSLATION TABLES` reporting `landingTranslationCount` (expected 0, table absent) + `productTranslationCount` (expected > 0).
- Confirms the cleanup landed in prod.

---

## 6. Risks and mitigations

| Step | Risk | Mitigation | Rollback |
|---|---|---|---|
| 2 | Schema migration breaks prod if columns have NOT NULL with no default | Use `String?` for all 5 (nullable); add defaults only if business requires | `prisma migrate resolve --rolled-back` + revert commit |
| 3 | Local `config.json` may be stale or missing for some products | Idempotent script + skip-and-warn for missing files; visual defaults (coverUrl, defaultLanguage) come from existing `Product.*` | Re-run script after fix; not destructive |
| 4 | Prod `CourseConfigCache` is stale or empty after deploy; first-request regen could spike DB | Vercel lambda cold-start budget; pre-warm cache via `regenerate-cache.ts` script run in CI post-deploy | `git revert` + manual cache fill |
| 4 | `existingConfig` read deletion breaks local dev if Step 3 didn't run | Document in `README.md` "Setup Rapido": `npx tsx scripts/products/regenerate-cache.ts <slug>` after clone | Local devs run script |
| 5 | `fix-amish-template.ts` rename + content change could break an admin running the old path | Announce in commit message; the script is a dev/admin tool, not a runtime path | `git revert` |
| 6 | RLS policy `deny_all_LandingTranslation` may need explicit drop before `DROP TABLE` | Migration SQL drops policy first, then table; tested on staging | Restore from PITR snapshot (`pitr-snapshots/`) |

**Overall safety net:** the `courseConfigCache.config` is a denormalized JSON. A bad regeneration is recoverable by re-running `regenerate-cache.ts`. The source rows (`Product`, `ProductTranslation`, `Lesson`, `LessonTranslation`) are never touched by this ADR's steps.

---

## 7. Out of scope (V2 candidates)

- Migrating `data/[slug]/<locale>.json` content bundles to a DB-stored content CMS (V2).
- Cache invalidation hooks: a model-level listener that calls `regenerate-cache.ts` on `Product`/`ProductTranslation` writes (V1.1 or V2).
- Per-template override files (`src/components/funnel/<name>/` static assets) — these are templates, not data.
- Removing `data/<slug>/AmishBooks` (the second data/ subdir, currently empty or dev-only).

---

## 8. Update log

- `0009-this-commit` — Initial ADR. Establishes the 6-step sequence and the SSOT/cache/data split.
- Future updates should be diff-verifiable: `grep -rn 'landingTranslation\|LandingTranslation' src/` (must stay 0) + `grep -rn 'public/courses' src/` (must stay 0 after Step 4) + `grep -rn 'prisma.courseConfigCache.upsert' src/ scripts/` (must stay in `generate-course-config.ts` + `regenerate-cache.ts` only).
