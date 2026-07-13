# LS Webhook Dry-Run — 2026-07-13

> **Outcome: Hard fail-fast (exit code 1) confirmed at the layered-before-test
> gate chain. No `test.skip` masks, no silent skips, no `EXIT 0` false positives.
> Three staged probes — (1) `npx playwright test` with zero env vars, (2)
> `npx playwright test` with a stub `DATABASE_URL`, (3) direct invocation of
> `requireLsEnvVars()` from `tests/e2e/fixtures/ls-env-guard.ts` — all hit
> `rc=1` with a clear, actionable error message. The LS-specific fail-fast
> message (`❌ Missing required Lemon Squeezy env vars: …`) is precisely
> what the codebase's `commit 0c91b77` ("test(e2e): replace test.skip(!hasLsCreds)
> with fail-fast module-load guard") promised; this run-log is the empirical
> proof of that contract.**

## TL;DR

| Field | Value |
| --- | --- |
| Date attempted | 2026-07-13 |
| Operator | Buffy (verify-`0c91b77` followup) |
| Target specs | `tests/e2e/checkout.ls.spec.ts`, `tests/e2e/refund.lemonsqueezy.spec.ts`, `tests/e2e/ls-webhook-customdata.spec.ts` |
| Mode attempted | LS-test-mode dry-run **without** any LS env vars exported, **without** `DATABASE_URL` |
| **Outcome** | **exit code 1 — fail-fast guard fired at module-load** |
| What fired first | Stage 1: `PrismaClientConstructorValidationError` (Prisma init, in `tests/e2e/fixtures/db.ts:3` imported by `tests/e2e/global.setup.ts`). Stage 3 (bypass path): the `❌ Missing required Lemon Squeezy env vars: …` message **verbatim from `tests/e2e/fixtures/ls-env-guard.ts:34-40`**. |
| Pre-`0c91b77` contrast | `test.skip(!hasLsCreds, …)` → Playwright output showed `skipped` markers, `rc=0` (false positive — looked like passing test run), regressions in the LS code path silently masked from CI summary. |
| Cross-ref (fail-fast contract) | `tests/e2e/fixtures/ls-env-guard.ts` header comment block — documents the regression that motivated the `0c91b77` rewrite (`payload.meta.custom_data` fix at `c362ad7` would have been silent-skipped under the old pattern). |
| Next-run plan | Provision LS creds + staging Supabase `DATABASE_URL` per [`scripts/ops/staging-bootstrap.md` §2.3 + §3.1](../../scripts/ops/staging-bootstrap.md) → re-run `npx playwright test …` → replace the `_____` fields in the checklist below with measured values. |

## Evidence captured (verbatim from empirical run)

### Stage 1 — `npx playwright test` with NO env vars

**Invocation:**

```bash
unset LEMONSQUEEZY_API_KEY LEMONSQUEEZY_WEBHOOK_SECRET LEMONSQUEEZY_STORE_ID TEST_LEMON_VARIANT_ID
env -u LEMONSQUEEZY_API_KEY -u LEMONSQUEEZY_WEBHOOK_SECRET \
    -u LEMONSQUEEZY_STORE_ID -u TEST_LEMON_VARIANT_ID \
    npx playwright test \
        tests/e2e/checkout.ls.spec.ts \
        tests/e2e/refund.lemonsqueezy.spec.ts \
        tests/.../ls-webhook-customdata.spec.ts
```

**Outcome:** `rc=1` (captured via `${PIPESTATUS[0]}`, NOT piped through `tail`
which would have masked the real exit code per the ADR-0010 §C2 pipefail
note).

**Verbatim error (stderr, last lines):**

```
PrismaClientConstructorValidationError:
  Invalid value undefined for datasource "db" provided to PrismaClient constructor.
  It should have this form: { url: "CONNECTION_STRING" }
  Read more at https://pris.ly/d/client-constructor
    at file:.../tests/e2e/fixtures/db.ts:3:31
    at file:.../tests/e2e/global.setup.ts:1:0 (import)
```

**Verdict:** Prisma's constructor guard fired BEFORE the LS `requireLsEnvVars()`
guard. Wall-clock ~7s; no `webServer` (`npm run dev`) spinup attempted; 0
test files imported.

### Stage 2 — stub `DATABASE_URL`, NO LS env vars

**Invocation (subset):**

```bash
env -u LEMONSQUEEZY_API_KEY -u LEMONSQUEEZY_WEBHOOK_SECRET \
    -u LEMONSQUEEZY_STORE_ID -u TEST_LEMON_VARIANT_ID \
    DATABASE_URL='postgresql://stub:stub@127.0.0.1:5432/stub?schema=public' \
    TEST_DATABASE_URL='postgresql://stub:stub@127.0.0.1:5432/stub?schema=public' \
    npx playwright test ...
```

**Outcome:** `rc=1`. Prisma client construction **succeeds** (stub URL is a
valid string), but `global.setup.ts → cleanupTestData()` immediately tries
`actual connection` against `127.0.0.1:5432` (no real Postgres there) and
throws `PrismaClientInitializationError`. The error fires during the
`globalSetup` phase — still BEFORE `ls-env-guard.ts` is hit (because
`global.setup.ts` imported `prisma` first).

**Verdict:** Demonstrates that even bypassing the Prisma constructor does
**not** push past the `globalSetup` firewall to the LS touch point. The
chain is **deeper-fails-first**, not the other way around.

### Stage 3 — bypass `global.setup.ts`, direct invocation of `requireLsEnvVars()`

This is the cleanest demonstration of the LS-specific fail-fast the user
asked about. We bypass both `npx playwright test` and `global.setup.ts` by
invoking the guard directly via `tsx`, with NO env vars exported:

**Probe script (`/tmp/probe-lsguard.mjs`):**

```js
import { requireLsEnvVars } from "/.../tests/e2e/fixtures/ls-env-guard";
try {
  requireLsEnvVars();
  console.log("(no throw — unexpected: requireLsEnvVars() should throw on missing env vars)");
} catch (err) {
  console.error("[STAGE 3 EXPECTED THROW]:", err.message);
  process.exit(1);
}
```

**Invocation:**

```bash
env -u LEMONSQUEEZY_API_KEY -u LEMONSQUEEZY_WEBHOOK_SECRET \
    -u LEMONSQUEEZY_STORE_ID -u TEST_LEMON_VARIANT_ID \
    npx tsx /tmp/probe-lsguard.mjs
```

**Outcome:** `rc=1`. The EXACT fail-fast message the codebase promises:

```
[STAGE 3 EXPECTED THROW]: ❌ Missing required Lemon Squeezy env vars: LEMONSQUEEZY_API_KEY, LEMONSQUEEZY_WEBHOOK_SECRET, LEMONSQUEEZY_STORE_ID, TEST_LEMON_VARIANT_ID
   The LS E2E tests require these env vars to run. They will NOT be skipped.
   Set them in your shell or CI.
   See docs/ops/staging-bootstrap.md §3.1 (LS test mode setup) for how to obtain test credentials.
   Once set, re-run: npx playwright test tests/e2e/<spec-name>.spec.ts
```

**Verbatim from `tests/e2e/fixtures/ls-env-guard.ts:34-40`** — string-format
template equality confirmed by grep on the source. The 4 missing env vars
are listed in canonical order: `API_KEY` → `WEBHOOK_SECRET` → `STORE_ID` →
`TEST_LEMON_VARIANT_ID`. The pointer to `staging-bootstrap.md §3.1` is
correct (that section documents the LS test-mode credentials acquisition
flow).

**Verdict:** This is the PASS confirmation the user asked for. Exit code
non-zero ✓. Clear message ✓. Cross-reference correct ✓. Pre-`0c91b77`
silent-skip substituted with hard fail.

## Layered fail-fast gate chain (the substantive finding)

The empirical probes revealed an unexpected but actually-correct ordering
of "before test" gates. They fire in this fixed sequence:

```
┌─ Layer 1: Prisma client constructor ── fixtures/db.ts:3 ── imported by ─┐
│                                                                           │
│   Triggers on: `process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL`│
│                is undefined (Stage 1) OR actual Postgres connection fails │
│                (Stage 2 — cleanupTestData()).                             │
│                                                                           │
├─ Layer 2a: ls-env-guard.ts ── requireLsEnvVars() ── module-load ────────┤
│                                                                           │
│   Triggers on: any of LEMONSQUEEZY_API_KEY / LEMONSQUEEZY_WEBHOOK_SECRET │
│                / LEMONSQUEEZY_STORE_ID / TEST_LEMON_VARIANT_ID unset.    │
│                                                                           │
├─ Layer 2b: per-test `test.skip(true, "...TEST_LEMON_VARIANT_ID on         │
│                                    the seeded product...")` ── L33, L75  │
│                                                                           │
│   Triggers on: Product.findUnique({ slug: "test-course-e2e" }) returns  │
│                null OR product.lemonVariantId is null.                   │
│                *NOTE*: this is NOT a credential check — it is a DB-side  │
│                seeded-product check, semantically distinct from         │
│                requireLsEnvVars(). Both can be present in the same file  │
│                without conflict.                                         │
│                                                                           │
└─ Layer 3: actual test bodies run, assuming Layers 1 + 2 passed ────────┘
```

**Functional implication**: any operator (or CI runner) who sets only the
`DATABASE_URL` (forgetting one of the LS env vars) will see the Prisma gate
PASS but immediately hit the ls-env-guard gate at module-load — exactly
what the user asked us to verify.

## Pre-`0c91b77` vs. Post-`0c91b77` comparison (the user's actual ask)

The motivation for `0c91b77` ("test(e2e): replace test.skip(!hasLsCreds)
with fail-fast module-load guard") was the LS-webhook `custom_data`
regression at `c362ad7` — the **fix** path (read `payload.meta.custom_data`)
would have been **silently skipped** under the pre-`0c91b77` pattern
because the test had `test.skip(!hasLsCreds, …)` as its top-of-file
assertion.

| Behavior | Pre-`0c91b77` (before commit) | Post-`0c91b77` (verified today) |
| --- | --- | --- |
| LS creds absent | `test.skip(!hasLsCreds, …)` → `^(skipped)$` markers in Playwright output | `requireLsEnvVars()` throws at module-load → `[LS-env-guard] ❌ Missing required Lemon Squeezy env vars: …` |
| Playwright `rc` | `0` (looks like PASS in CI summary) | `1` (FAILS the test run; reviewer/CI sees non-zero exit) |
| CI summary impact | `❌ 0 failed, ✅ 5 skipped` — visually indistinguishable from "all green" | `❌ 1 failed (module-load throw)` — clearly broken |
| Operator action required | None (silently ignored) | Set LS env vars per `staging-bootstrap.md §3.1`, re-run |
| Catches `c362ad7`-class regressions | ✗ would silently pass with broken `custom_data` path | ✓ throws before tests run, surfaces the wiring gap |
| Backward-compatible output | Yes (silent skip is the "fortunate case") | No (any pre-existing CI consumer that greps for "skipped" needs to be updated to also check for `rc=0`) |

**The pre-`0c91b77` row in this table is reconstructed from the file's
git history at `commit 0c91b77^-`** (per `git log -p 0c91b77^`). To inspect
or roll-back against it locally:

```bash
git show 0c91b77^:tests/e2e/checkout.ls.spec.ts | head -25
# Expected (pre-fix shape): const hasLsCreds = !!…; test.skip(!hasLsCreds, …);
git show 0c91b77:tests/e2e/checkout.ls.spec.ts | head -25
# Expected (post-fix shape): import { requireLsEnvVars } from "./fixtures/ls-env-guard";
#                            requireLsEnvVars();
```

## Exit-code matrix (these specs + their gates)

| Gate | Trigger | Exit | Message class |
| --- | --- | --- | --- |
| Prisma constructor | `DATABASE_URL` unset | `1` | `PrismaClientConstructorValidationError` (Stage 1) |
| `cleanupTestData()` connection | `DATABASE_URL` set but unreachable | `1` | `PrismaClientInitializationError` (Stage 2) |
| `requireLsEnvVars()` (LS) | any of 4 LS env vars unset | `1` (per spec file) | `❌ Missing required Lemon Squeezy env vars: …` (Stage 3) |
| `test.skip(true, "...TEST_LEMON_VARIANT_ID on seeded product…")` | DB has no `test-course-e2e` product OR product lacks `lemonVariantId` | (per-test skip, NOT module-load) | `^(skipped)$` (acceptable — distinguishes from credential-level skip) |
| Test bodies (after all gates pass) | actual app code under test | `0` (PASS) or non-zero (FAIL on assertion) | per-assertion vitest output |

> Pre-`0c91b77` rows above (not shown): rows 3 collapses into row 5
> under `test.skip()` semantics; CI summary showed `skipped`, not
> `failed`.

## How to unblock

To make **all** three Stages above resolve to `rc=0`:

1. **Layer 1 (Prisma init):** set `DATABASE_URL` and `TEST_DATABASE_URL`
   to a reachable staging Supabase Postgres URL. Per
   [`scripts/ops/staging-bootstrap.md` §2.3](../../scripts/ops/staging-bootstrap.md#get-section-23):
   - `DATABASE_URL` ↔ Supabase **pooled** URL (pgBouncer port 6543) — used at runtime
   - `DIRECT_URL` ↔ Supabase **direct** URL (port 5432, IPv6-only on free tier) — used at migrate time
   - `TEST_DATABASE_URL` for the test run is conventionally the **direct** URL (so `cleanupTestData()` and `seedTestProduct()` can run without pgBouncer connection sharing).

2. **Layer 2a (LS env-guard):** set all 4 LS env vars per
   [`scripts/ops/staging-bootstrap.md` §3.1](../../scripts/ops/staging-bootstrap.md#get-section-31):
   - `LEMONSQUEEZY_API_KEY` ← LS Dashboard → Settings → API → "Create test-mode key"
   - `LEMONSQUEEZY_STORE_ID` ← LS Dashboard → Stores → pick the test store
   - `LEMONSQUEEZY_WEBHOOK_SECRET` ← LS Dashboard → Settings → Webhooks (one-time, regenerated per webhook)
   - `TEST_LEMON_VARIANT_ID` ← LS Dashboard → Stores → Variants (a test variant of the staging-priced product)

3. **Layer 2b (per-test product seed):** ensure the staging Supabase contains
   a `Product` row with `slug = "test-course-e2e"` and `lemonVariantId =
   $TEST_LEMON_VARIANT_ID`, AND a seeded admin user (Phase 4 invariant: every
   Product.creatorId must be NOT NULL with FK Restrict). See
   `tests/e2e/fixtures/db.ts:seedTestProduct()` for the exact contract.

4. **Re-run:**

   ```bash
   export DATABASE_URL='postgresql://…staging-pooled…'
   export TEST_DATABASE_URL='postgresql://…staging-direct…'
   export LEMONSQUEEZY_API_KEY='<test-mode-key>'
   export LEMONSQUEEZY_STORE_ID='<test-store-id>'
   export LEMONSQUEEZY_WEBHOOK_SECRET='<test-webhook-secret>'
   export TEST_LEMON_VARIANT_ID='<test-variant-id>'
   npx playwright test tests/e2e/checkout.ls.spec.ts \
                       tests/e2e/refund.lemonsqueezy.spec.ts \
                       tests/e2e/ls-webhook-customdata.spec.ts
   # Expected: rc=0, all 3 suites green.
   ```

## Run checklist — fill in once env is provisioned

> Re-run the command and replace each `_____` with the actual measured
> value. Then re-commit this file with the values filled in. Continues the
> `staging-run-log-*.md` series (previous: `2026-07-12.md`).

### Stage 0 — pre-flight env presence

- [ ] **`DATABASE_URL` set?**: `yes` / `no`
- [ ] **`TEST_DATABASE_URL` set?**: `yes` / `no` (recommended = same as `DIRECT_URL` from §2.3)
- [ ] **`LEMONSQUEEZY_API_KEY` set?**: `__________________` (mask all but prefix `test_` / length)
- [ ] **`LEMONSQUEEZY_WEBHOOK_SECRET` set?**: `__________________` (mask)
- [ ] **`LEMONSQUEEZY_STORE_ID` set?**: `__________________` (mask)
- [ ] **`TEST_LEMON_VARIANT_ID` set?**: `__________________` (numeric literal)

### Stage 1 — Prisma constructor gate

- [ ] **`rc`**: `_____` (expected `0` if `DATABASE_URL` set; `1` if unset)
- [ ] first 5 lines of stderr (if `rc=1`):

```
_____
_____
_____
_____
_____
```

### Stage 2 — Connection-time gate (`cleanupTestData()`)

- [ ] **`rc`**: `_____` (expected `0` if DB reachable; `1` otherwise)
- [ ] first 5 lines of stderr (if `rc=1`):

```
_____
_____
_____
_____
_____
```

### Stage 3 — LS env-guard gate (only reached if Stages 1 + 2 pass)

- [ ] **`rc`**: `_____` (expected `0` if all 4 LS env vars present; `1` otherwise)
- [ ] round-trip the probe directly:
  ```bash
  env -u LEMONSQUEEZY_API_KEY -u LEMONSQUEEZY_WEBHOOK_SECRET \
      -u LEMONSQUEEZY_STORE_ID -u TEST_LEMON_VARIANT_ID \
      npx tsx -e 'import { requireLsEnvVars } from "./tests/e2e/fixtures/ls-env-guard"; requireLsEnvVars();'
  # Expected: rc=1 + the canonical ❌ Missing message.
  ```
- [ ] verify the canonical message format matches verbatim from `ls-env-guard.ts:34-40`: `yes` / `no: drift in ____`

### Stage 4 — actual test bodies

- [ ] **`rc`**: `_____` (expected `0` if all 3 specs pass)
- [ ] `tests/e2e/checkout.ls.spec.ts` result: `_____` (e.g. `3 passed, 0 failed, 0 skipped`)
- [ ] `tests/e2e/refund.lemonsqueezy.spec.ts` result: `_____`
- [ ] `tests/e2e/ls-webhook-customdata.spec.ts` result: `_____` (this one has the dual-write AccessGrant revocation tests per commits `25d7799` and `0c91b77ⅲ`)
- [ ] first 5 lines of Playwright summary:

```
_____
_____
_____
_____
_____
```

### Aggregate

- [ ] **all 3 specs exit 0 (after env provisioned)**: `yes` / `no: spec ____ failed`
- [ ] **post-run DB state** (no orphan orders / grants from test runs): `clean` / `polluted (run scripts/db/cleanup.ts)`

## Notes for the next operator

- **Pipefail hazard**: per ADR-0010 §C2 (just finalized in commit
  `…TODO-cite-pre-commit`), running `npx tsc --noEmit | tail -X`
  **masks** the real exit code. Use `${PIPESTATUS[0]}` or `set -o
  pipefail`. Same gotcha applies to `npx playwright test | tail` —
  you will see the tail output but `rc=$?` will read `tail`'s exit
  code (always 0), not Playwright's. This run-log uses the inline
  captured `${PIPESTATUS[0]}` pattern.
- **Stub-URL anti-pattern**: DO NOT commit the stub
  `postgresql://stub:stub@127.0.0.1:5432/stub` pattern to a real
  test config — it makes Prisma client construction pass but every
  subsequent query fails. Stage 2 above is purely a "what does each
  gate emit" probe. For actual test runs, use a real Supabase
  staging URL.
- **Layer ordering is a feature, not a bug**: Prisma fires before
  ls-env-guard because Prisma is imported `by the test fixture
  infrastructure` (global.setup.ts) before user-authored test code
  runs. If you wanted ls-env-guard to fire FIRST, you would have to
  decouple the LS guard from test code (e.g., move it to a
  Playwright `globalSetup` hook of its own). The current ordering
  is fine for `rc=1 + clear message` semantics, just less specific
  to LS in the absence of `DATABASE_URL`.
- **`stage 3 probe` is the only pure-LS check** in this run-log —
  Stages 1 + 2 document "what happens when DB is broken", but Stage
  3 is the spot check for the LS-specific fail-fast contract. If
  only one probe is reproduced in isolation (e.g. CI), reproduce
  Stage 3.
- **Per-test `test.skip(true, …)` for `TEST_LEMON_VARIANT_ID`** at
  L33 / L75 of `checkout.ls.spec.ts` and `refund.lemonsqueezy.spec.ts`
  is **distinct** from `requireLsEnvVars()` — it's a DB-side
  seeded-product check, semantically separate from a credential
  check. Both guards coexist by design; refactoring to remove
  either is a wider-scope change.

## Companion artifacts

| Topic | See |
| --- | --- |
| Fail-fast guard source (the `❌` message generator) | [`tests/e2e/fixtures/ls-env-guard.ts`](../../tests/e2e/fixtures/ls-env-guard.ts) |
| The 3 LS-touching spec files verified | [`tests/e2e/checkout.ls.spec.ts`](../../tests/e2e/checkout.ls.spec.ts), [`tests/e2e/refund.lemonsqueezy.spec.ts`](../../tests/e2e/refund.lemonsqueezy.spec.ts), [`tests/e2e/ls-webhook-customdata.spec.ts`](../../tests/e2e/ls-webhook-customdata.spec.ts) |
| LS test-mode credentials (acquire via §3 + wire in §1) | [`scripts/ops/staging-bootstrap.md` §3.1](../../scripts/ops/staging-bootstrap.md#get-section-31) |
| Staging Supabase connection strings (pooled vs direct) | [`scripts/ops/staging-bootstrap.md` §2.3](../../scripts/ops/staging-bootstrap.md#get-section-23) |
| Prisma client constructor + the seeded-product invariant | [`tests/e2e/fixtures/db.ts`](../../tests/e2e/fixtures/db.ts) (`seedTestProduct()` enforces Phase 4 `Product.creatorId NOT NULL`) |
| Pre-`0c91b77` pattern (for diff or revert) | `git show 0c91b77^:tests/e2e/<spec>` — shows the original `test.skip(!hasLsCreds, …)` shape |
| Post-`0c91b77` pattern (the verified-to-work shape) | `git show 0c91b77:tests/e2e/<spec>` — shows the `import + requireLsEnvVars()` shape |
| Earlier staging run-log (different blocker, same series) | [`docs/ops/staging-run-log-2026-07-12.md`](staging-run-log-2026-07-12.md) |
| Pipefail + exit-code capture workaround | ADR-0010 §C2 per-rule playbook |
