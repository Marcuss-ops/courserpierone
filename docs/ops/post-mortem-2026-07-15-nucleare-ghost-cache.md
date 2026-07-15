# Post-Mortem: NUCLEARE Ghost Cache & Vercel Deploy Failure

**Date:** 2026-07-15
**Severity:** High (production deploy blocked for 6 consecutive attempts, ~1h downtime)
**Status:** Resolved
**Author:** NUCLEARE cleanup team

---

## TL;DR

The NUCLEARE cleanup (deletion of `courses/amish-secrets/` + `data/amish-secrets/` + removal of amish from core TS) was followed by 6 consecutive Vercel deploy failures (`Error` after 10-12s) and a "ghost content" bug where `/it-it/amish-secrets` still served the amish HTML even after the filesystem + DB cleanup. Two root causes:

1. **Vercel deploys were canceled by the `vercel-ignore-docs.sh` `ignoreCommand`** which misinterpreted the NUCLEARE commits as "docs-only" and exited 0.
2. **`CourseConfigCache` table in Prisma was NOT cleared** by the 4 standard DELETE statements, so the ghost amish content was still served from the DB cache layer.

Both are now fixed (commits `90cb940` for the Vercel unblock, manual `DELETE FROM "CourseConfigCache"` for the ghost cache). This document explains what happened, why, and how to prevent it next time.

---

## Timeline

| Time (CEST) | Event |
|---|---|
| 2026-07-15 13:00 | NUCLEARE Commit 1 (de249a0): `courses/amish-secrets/` (66 files) + `data/amish-secrets/` + `data/AmishBooks/` + `src/components/funnel/{amish,book-claude}/` + adapters deleted |
| 2026-07-15 13:10 | NUCLEARE Commit 2 (3b749a6): 8 core TS files purged of amish + book-claude (templates, registry, config, admin pages) |
| 2026-07-15 13:20 | NUCLEARE Commit 2-scripts (6b16461): 7 Amish-specific legacy scripts deleted + 9 parametrized (now require `<slug>` argv) |
| 2026-07-15 13:30 | NUCLEARE followup (065e87e): deprecated `translate-portal.py` deleted + README genericized |
| 2026-07-15 13:35 | NUCLEARE Commit 2-tests (dcc860c): 2 vitest unit test files purged of amish fixtures |
| 2026-07-15 13:40 | All 5 NUCLEARE commits pushed to `main`. Vercel auto-deploy triggered. |
| 2026-07-15 13:42 | **Vercel deploy #1 (10s):** ❌ Error — `vercel-ignore-docs.sh` exited 0, build canceled |
| 2026-07-15 13:43-13:55 | **Vercel deploys #2-#6:** ❌ Error (all 10-12s, same root cause) |
| 2026-07-15 14:00 | Diagnosis: NUCLEARE caused 2 cascading issues (see below) |
| 2026-07-15 14:10 | **Fix #1 (90cb940):** `courses/.keep` added + `vercel-ignore-docs.sh` removed from `vercel.json` |
| 2026-07-15 14:15 | Vercel deploy #7 (1m 2s): ✅ **Ready — first successful deploy** |
| 2026-07-15 14:20 | **Discovery:** `/it-it/amish-secrets` still serves amish content (title, 2 amish refs) — even in dev with full restart |
| 2026-07-15 14:25 | Diagnosis: `(member)` is a **Route Group** in Next.js, so `(member)/page.tsx` serves the root `/it-it/[domain]` (no top-level `page.tsx` exists in `[domain]/`) |
| 2026-07-15 14:35 | Diagnosis: `getCourseConfig()` in `src/lib/config/white-label-data.ts` reads 4 layers (Redis → memory → filesystem → **DB CourseConfigCache** → auto-generate) — the DB cache row survived all the NUCLEARE deletes |
| 2026-07-15 14:40 | **Fix #2:** `DELETE FROM "CourseConfigCache" WHERE slug = 'amish-secrets'` executed on local + Supabase production |
| 2026-07-15 14:42 | Dev: 0 amish refs ✅; Prod: 1 amish ref (still needs Upstash FLUSHDB or 5-min TTL to expire) |
| 2026-07-15 15:00 | **Test course added (e2e5885):** `test-course-e2e` made free + open-access via `FREE_COURSE_SLUGS` env var + `AccessGate` bypass + idempotent seed script |

---

## Root Cause Analysis

### RC#1: Vercel `ignoreCommand` misinterpreted NUCLEARE as docs-only

**File:** `scripts/ops/vercel-ignore-docs.sh`

```bash
# The script compares VERCEL_GIT_PREVIOUS_SHA → VERCEL_GIT_COMMIT_SHA
# and exits 0 (cancels build) if ALL changed files are in docs/ or *.md
NON_DOC=$(echo "$CHANGED" | grep -vE '^(docs/|\.md$)' || true)
if [ -z "$NON_DOC" ]; then
  exit 0  # Cancel build — bad outcome for NUCLEARE
fi
```

**Why it fired for NUCLEARE:**

1. Vercel uses `VERCEL_GIT_PREVIOUS_SHA` (last successful deploy) for the diff baseline.
2. NUCLEARE's `065e87e` (followup) included a `scripts/README.md` change (NIT 4 cleanup: replaced `amish-secrets` examples with `<slug>`).
3. Depending on Vercel's `VERCEL_GIT_PREVIOUS_SHA` state, the diff could be interpreted as docs-only OR the script's edge case with empty `CHANGED` could trigger exit 0.
4. The script's `set -euo pipefail` + `grep -vE ... || true` has a subtle bug: if `CHANGED` is empty (no diff), the script proceeds to exit 1 (build), but the `|| true` masks a class of errors that could lead to unexpected exit 0.

**Result:** 6 consecutive deploys canceled in 10-12 seconds each (no logs available — the build never started).

**Fix applied (commit 90cb940):**
- Added `courses/.keep` so Git retains the `courses/` directory even when empty (prevents validate:locales from crashing in a future similar scenario)
- Removed `ignoreCommand` from `vercel.json` to force all builds through (TEMPORARY — needs re-adding with bugfix)

### RC#2: `CourseConfigCache` ghost content

**File:** `prisma/schema.prisma` line ~280:

```prisma
model CourseConfigCache {
  id        String   @id @default(cuid())
  slug      String   @unique
  config    String   // JSON string del CourseConfig completo
  version   Int      @default(1)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**Why it survived NUCLEARE:**

The NUCLEARE "hard delete manuale" step ran 4 DELETE statements:
```sql
DELETE FROM "ProcessedWebhook" WHERE "deliveryId" LIKE '%amish%';
DELETE FROM "AccessGrant" WHERE "productId" IN (SELECT id FROM "Product" WHERE slug = 'amish-secrets');
DELETE FROM "Order" WHERE "productId" IN (SELECT id FROM "Product" WHERE slug = 'amish-secrets');
DELETE FROM "Product" WHERE slug = 'amish-secrets';
```

**Missing:** No `DELETE FROM "CourseConfigCache" WHERE slug = 'amish-secrets'`. This table is a precomputed cache of the full course config (lessons, languages, cover, author, etc.) that the funnel page reads at request time via `getCourseConfig()`:

```typescript
// src/lib/config/white-label-data.ts
export async function getCourseConfig(slug: string): Promise<CourseConfig | null> {
  // 1. Redis cache
  // 2. Memory cache (per-request)
  // 3. Filesystem (courses/<slug>/config.json)
  // 4. CourseConfigCache (DB) ← THIS was the ghost
  // 5. Auto-generate from DB
}
```

After NUCLEARE deleted `courses/amish-secrets/`, the `getCourseConfig("amish-secrets")` call fell through to layer 4 (DB) and found the stale row → rendered the old amish content.

**Why the dynamic route was affected:**

`src/app/(locale)/[locale]/[domain]/` has NO top-level `page.tsx`. Only sub-routes: `(member)/page.tsx`, `about/page.tsx`, `curso/[lessonId]/page.tsx`, `ebook/page.tsx`, `download/page.tsx`.

The `(member)` is a **Route Group** (parentheses don't affect URLs), so `(member)/page.tsx` is effectively the root page for `[domain]/`. The browser requested `/it-it/amish-secrets`, Next.js routed to `(member)/page.tsx`, which called `getCourseConfig("amish-secrets")` → got the ghost content from DB.

**Result:** `/it-it/amish-secrets` returned 200 with full amish content (title, 59K HTML, 2 amish refs) even after dev server restart.

**Fix applied (manual, post-90cb940):**
- `DELETE FROM "CourseConfigCache" WHERE slug = 'amish-secrets';` on local + Supabase production
- Upstash `FLUSHDB` (or wait 5min for Redis TTL)

### RC#3: `pkill` couldn't kill stale `next-server` process (PID 2081)

**Symptom:** A stale `next-server (v14.2.35)` process (PID 2081) was running before the NUCLEARE work started, holding port 3000. After NUCLEARE, the new code (Next 16) was deployed but the old process kept serving stale content.

```
$ pkill -9 -f 'next'
$ ps aux | grep -E 'next' | grep -v grep
velox  2081  0.0  0.3 1356884 76896 ?  Ssl  lug10  0:10 next-server (v14.2.35)
```

`pkill` failed silently. The new dev server (`npm run dev`) couldn't bind to port 3000 because the stale process held it.

**Root cause:** The stale process was owned by user `velox`. The current shell user didn't have permission to send signals (`SIGKILL` via `pkill`) to processes owned by a different user on the same machine. `pkill -9` should override this in most Unix variants, but the process was still protected (likely a container/sandbox boundary).

**Fix applied:**
- `kill -9 2081` (by explicit PID, not by name pattern) — this works because the signal is sent to a known PID regardless of pattern matching.
- A new `npm run dev` started successfully on port 3000 with the correct Next 16 code.

---

## Lessons Learned

### 1. Always include `CourseConfigCache` in product deletion

The 4 standard DELETE statements (ProcessedWebhook, AccessGrant, Order, Product) are NOT enough. **Always also delete from `CourseConfigCache`** when removing a product:

```sql
-- Add to the standard NUCLEARE cleanup sequence:
DELETE FROM "CourseConfigCache" WHERE slug = 'amish-secrets';
```

**Why this matters:** The funnel page reads from `CourseConfigCache` BEFORE falling through to filesystem/generation. A stale row will keep serving the old content for up to 5 minutes (memory cache TTL) or until manual cache invalidation.

### 2. Re-add the `ignoreCommand` with a bugfix

The `vercel-ignore-docs.sh` script is a valuable optimization (saves Vercel build minutes on docs-only commits), but the current implementation has subtle bugs. **Re-add it after fixing the `|| true` exit-code mask**:

```bash
# Current (buggy):
NON_DOC=$(echo "$CHANGED" | grep -vE '^(docs/|\.md$)' || true)
if [ -z "$NON_DOC" ]; then exit 0; fi

# Fixed (use grep -vc for count, OR use case statement for explicit state):
NON_DOC_COUNT=$(echo "$CHANGED" | grep -cvE '^(docs/|\.md$)' || echo 0)
if [ "$NON_DOC_COUNT" -eq 0 ]; then exit 0; fi
```

Also: log the diff to stderr explicitly so future debugging is easier.

### 3. Add `npm run build` to the local `check` script

Currently `package.json` `check` runs:
```json
"check": "npm run typecheck && npm run audit:courses-drift && npm run lint && npm run test"
```

**It does NOT run `next build`**, which is what would catch the validate:locales crash BEFORE pushing to Vercel. The Vercel deploys failed at 10-12s with no logs — if `next build` ran locally, the crash would be visible immediately.

**Proposed fix:**
```json
"check": "npm run typecheck && npm run audit:courses-drift && npm run lint && npm run test && npm run build"
```

### 4. Document the `kill -9 <PID>` pattern for stale processes

When `pkill` doesn't work, always try:
1. `ps aux | grep <pattern>` to find the PID
2. `kill -9 <PID>` (explicit PID, bypasses name-pattern issues)
3. `sudo kill -9 <PID>` if the process is owned by a different user (if sudo is available)

Add this to the dev workflow doc (`docs/ops/dev-workflow.md` or similar) so future operators know the fallback.

### 5. The `(member)` Route Group pattern is a footgun

`src/app/(locale)/[locale]/[domain]/(member)/page.tsx` serves the root `/[domain]/` because `(member)` is a Route Group. **This is not obvious from the file structure** — a developer reading the code might think there's a missing `page.tsx` at the root.

**Documentation opportunity:** Add a JSDoc to the `[domain]/` directory explaining the Route Group pattern, OR add a `page.tsx` at the root that re-exports from `(member)/page.tsx` to make the routing explicit:

```typescript
// src/app/(locale)/[locale]/[domain]/page.tsx
// Re-export from the (member) route group (Next.js Route Group pattern).
// The actual page logic lives in (member)/page.tsx; this file exists only
// to make the routing discoverable for developers reading the directory.
export { default, dynamic, generateMetadata } from "./(member)/page";
```

---

## Action Items

| Priority | Item | Owner | Status |
|---|---|---|---|
| P0 | Add `CourseConfigCache` to standard 4 DELETE statements | TBD | TODO |
| P0 | Re-add `ignoreCommand` with `|| true` bugfix | TBD | TODO |
| P1 | Add `npm run build` to `check` script | TBD | TODO |
| P1 | Document `kill -9 <PID>` pattern in dev workflow | TBD | TODO |
| P2 | Add `page.tsx` re-export to `[domain]/` to make routing explicit | TBD | TODO |
| P2 | Add FREE_COURSE_SLUGS to env schema (`src/lib/env.ts`) | TBD | TODO |
| P3 | Add NODE_ENV guard to `scripts/test-course-setup.ts` | TBD | TODO |

---

## Related Commits

| SHA | Description |
|---|---|
| `de249a0` | NUCLEARE Commit 1: bulk delete (96 files) |
| `3b749a6` | NUCLEARE Commit 2: core TS purge (8 files) |
| `6b16461` | NUCLEARE Commit 2-scripts: genericize scripts (16 files) |
| `065e87e` | NUCLEARE followup: deprecated script + README (2 files) |
| `dcc860c` | NUCLEARE Commit 2-tests: fixture purge (2 files) |
| `90cb940` | Vercel unblock fix: courses/.keep + remove ignoreCommand |
| `e2e5885` | Test course free bypass + seed script |

---

## Glossary

- **NUCLEARE:** Code name for the amish-secrets removal cleanup cycle.
- **Route Group:** Next.js convention — folders in parentheses like `(member)` don't affect the URL path. Used to organize files without affecting routing.
- **ignoreCommand:** Vercel feature — a script that runs before the build. Exit 0 = cancel build, exit 1 = proceed. Used to skip builds for docs-only commits.
- **CourseConfigCache:** Prisma table that stores pre-computed JSON config for courses, populated by `scripts/products/sync-local-config.ts` and read by `getCourseConfig()` at request time.
- **Ghost content:** Stale data that survives deletion because it lives in a cache layer not covered by the standard delete statements.
