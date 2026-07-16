#!/usr/bin/env bash
# Pre-commit gate runner (Courssy — meta-anti-pattern hardener).
#
# Background: in questa sessione abbiamo avuto 3 commit consecutivi
# di ship-with-RED-tsc (import invalido, narrowing TS, narrowing
# closure-pattern) tutti fix-on-fix-on-fix. La root cause non è il
# code ma il *process*: tool-side visibility (linter Radix UI) non
# flagga syntax edge-case come il tsc full-project check.
#
# Soluzione: un bash script che gira PRIMA di ogni `git commit`, esegue
# le 3 verifiche minime (typecheck, vitest, size-budget) ed exit 1 se
# una qualsiasi RED. Skip automatico opzionale con `--no-verify` su
# git commit (bypass esplicito) o env var `SHORT_CIRCUIT_PRE_COMMIT=1`.
#
# Runtime: ~10s totale per la prima run (typecheck 5s + vitest 3s +
# size-budget ms). Accettabile per un pre-commit hook.
#
# Setup (one-time):
#   ln -sf ../../scripts/ci/pre-commit-gate.sh .git/hooks/pre-commit
#   chmod +x scripts/ci/pre-commit-gate.sh
#
# Bypass (solo per wip/quick-fix):
#   git commit --no-verify                  (built-in git bypass)
#   SHORT_CIRCUIT_PRE_COMMIT=1 git commit  (gate shortcut)
#
# Husky / lint-staged wrapper: YAGNI per V1. Symlink basta.

set -euo pipefail

# ── Bypass esplicito (wip/quick-fix) ─────────────────────────────────
if [[ -n "${SHORT_CIRCUIT_PRE_COMMIT:-}" ]]; then
  echo "── Pre-commit gate SHORT-CIRCUITED (SHORT_CIRCUIT_PRE_COMMIT set) ──"
  exit 0
fi

echo "── Pre-commit gate (Courssy) ──────────────────────────────────────"
echo "Bypass: --no-verify o SHORT_CIRCUIT_PRE_COMMIT=1"

# ── [1/3] typecheck ──────────────────────────────────────────────────
echo ""
echo "[1/3] tsc --noEmit…"
npx tsc --noEmit
echo "✓ typecheck verde"

# ── [2/3] vitest ─────────────────────────────────────────────────────
echo ""
echo "[2/3] vitest run…"
npx vitest run
echo "✓ vitest verde"

# ── [3/3] file size budget (V2 domains) ─────────────────────────────
echo ""
echo "[3/3] npm run check:size…"
npm run check:size
echo "✓ size budget verde"

echo ""
echo "✓ Pre-commit gate verde — commit consentito."
