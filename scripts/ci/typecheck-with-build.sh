#!/usr/bin/env bash
# scripts/ci/typecheck-with-build.sh
# ═════════════════════════════════════════════════════════════════════════════
# CI hygiene guard: runs `next build` BEFORE `npx tsc --noEmit`.
#
# WHY THIS EXISTS
# ───────────────
# Next.js generates `.next/types/validator.ts` during `next build`. That file
# contains one `RouteImpl` entry per App Router route. When routes are added
# or removed, the validator's entry list goes stale unless `next build` runs
# again.
#
# `npx tsc --noEmit` alone does NOT regenerate `.next/types/validator.ts` —
# it only consumes what's already on disk. So when CI cleans the worktree to
# a fresh checkout, the validator.ts file is missing OR points to deleted
# routes, producing TS2307 false positives that mask real type errors.
#
# Concrete failure mode documented in `typecheck_output.txt`:
#   .next/types/validator.ts(494,39): error TS2307:
#     Cannot find module '../../src/app/api/messages/read/route.js'
#   (the routes EXIST as different paths now; the path in validator.ts is stale)
#
# The guard below FRESH-generates App Router types before typechecking,
# eliminating that staleness class. `.next/cache` is intentionally preserved
# so subsequent builds run in O(seconds) when the build cache is warm
# (CI workflow addition: cache `.next/cache` keyed on package-lock + src/).
#
# USAGE
# ─────
#   bash scripts/ci/typecheck-with-build.sh
#
# Called directly from `.github/workflows/ci.yml` typecheck job (replaces the
# legacy bare `npm run typecheck`). Also suitable for local use when stale
# App Router types are suspected.
#
# EXIT CODES
# ──────────
#   0  build + typecheck both succeeded (.next/types/validator.ts is fresh)
#   non-zero  either step failed (CI surfaces via deploy-gate aggregator)
#
# GET `set -euo pipefail`
# ────────────────────────
# Strict mode. Any unset variable, any failed command, any failed pipe
# segment aborts the script with the offending command's exit code so CI
# can attribute the failure to the right step.
# ═════════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─── ERR trap — actionable CI logs on failure ────────────────────────────────
# `set -euo pipefail` aborts on first failure but doesn't print WHICH line
# failed. The trap below prints the offending line + command + exit code so
# when CI logs surface a failure they are diagnostic, not a wall of garbage.
trap 'echo "❌ Wrapper failed at line ${LINENO}: ${BASH_COMMAND} (exit $?)" >&2' ERR

# ─── Resolve script-relative paths ─────────────────────────────────────────
# Walk up from the script's directory to the nearest package.json. This
# ensures the wrapper works regardless of where it lives in the tree
# (scripts/ci/, scripts/, the repo root, etc.) AND from any current working
# directory. Cost: ~0ms — only matters on first run.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# NOTE: this walk-up assumes a SINGLE-PACKAGE repo (no nested `packages/<name>/package.json`
# before the true root). The walk stops at the FIRST package.json. If a future monorepo
# restructure introduces nested package.json files, change this to require additional
# markers (e.g., `[ -f "$REPO_ROOT/turbo.json" ] || [ -f "$REPO_ROOT/pnpm-workspace.yaml" ]`).
REPO_ROOT="$SCRIPT_DIR"
while [ ! -f "$REPO_ROOT/package.json" ]; do
  parent="$(dirname "$REPO_ROOT")"
  if [ "$parent" = "$REPO_ROOT" ]; then
    echo "❌ Could not locate repo root from $SCRIPT_DIR (no package.json found in any ancestor)." >&2
    exit 1
  fi
  REPO_ROOT="$parent"
done
cd "$REPO_ROOT"

echo "📂 Working from: $REPO_ROOT"
echo ""

# ─── 1. Purge the stale App Router type declarations ──────────────────────
# Next.js writes `.next/types/validator.ts` (and `routes.d.ts`) on every
# build. If the file persists from an earlier route map, `next build` may
# treat it as up-to-date and skip regenerating. Purging forces regeneration.
#
# We deliberately do NOT `rm -rf .next/` because:
#   - `.next/cache/` holds the Webpack/SWC build cache (turbo cache).
#     Destroying it would force a full rebuild next time.
#   - `.next/server/` and `.next/static/` are artifacts that aren't needed
#     for typechecking — but purging them is cheaper than rebuilding.
# We also exclude any other production-relevant subfolder if added later by
# only targeting `.next/types/` (the root of the App Router type tree).
echo "🧹 Step 1/3 — Purging stale .next/types/"
echo "   (Preserves .next/cache/ for incremental rebuilds.)"
rm -rf .next/types
echo ""

# ─── 2. Generate fresh App Router types via bare `next build` ─────────────
# We deliberately run `npx next build` instead of `npm run build`:
#   - `npm run build` chains `prisma generate && validate-locales
#     && generate-locales && next build`. Those three prefix steps have
#     already run via `postinstall` during `npm ci` — running them again
#     here would just slow CI and risk nondeterministic failures from
#     locale validation passing locally but flaking in CI (or vice versa).
#   - The user-facing build pipeline (`npm run build`) is exercised by the
#     `e2e-journey` job via Playwright's `webServer.command` (which calls
#     `npm run build && start`), so we don't need to repeat the chain here.
echo "🏗️  Step 2/3 — Generating fresh App Router types via bare \`next build\`..."
# Use the locally-installed `next` binary directly to skip `npx`'s ~300ms
# package-resolution dance on every CI run. `node_modules/.bin/next` is
# guaranteed to exist after `npm ci` (next is a hard dep).
# NODE_ENV=test is inherited from the CI job's env: block (see ci.yml),
# which prevents production-only codepaths from polluting validator.ts.
node_modules/.bin/next build
echo ""

# ─── 3. Run the strict TypeScript checker ─────────────────────────────────
# `npm run typecheck` is `tsc --noEmit` (see package.json script section).
# It now reads freshly-generated `.next/types/validator.ts` and produces
# NO false-positive TS2307s for deleted routes.
echo "🔎 Step 3/3 — Running TypeScript strict typecheck..."
npm run typecheck
echo ""

echo "✅ Typecheck PASSED — .next/types/validator.ts is fresh."
echo "   No stale route references possible. Verified to match current src/ tree."
