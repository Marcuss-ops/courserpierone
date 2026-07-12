#!/usr/bin/env bash
# scripts/ops/vercel-ignore-docs.sh
#
# Vercel `ignoreCommand` for `vercel.json`.
#
# Contract:
#   - Exit 0  → Vercel cancels the build.
#   - Exit 1  → Vercel proceeds with the build.
#
# Logic:
#   - Compare HEAD~1..HEAD; collect changed files via `git diff --name-only`.
#   - Filter OUT files that live under `docs/` OR end in `.md`.
#   - If every changed file is a doc, cancel the build (exit 0).
#   - Otherwise proceed with the build (exit 1).
#
# Edge cases handled:
#   - First deploy (no HEAD~1) → proceed (exit 1). Build is required on
#     the inaugural commit; nothing in HEAD history to compare against.
#   - Empty diff (e.g. force-rebuild of an unchanged commit) → proceed
#     (exit 1). Defensive; should be unreachable in normal Vercel flow.
#
# Compatibility:
#   - bash ≥ 4 (Vercel build env ships bash 5).
#   - `set -euo pipefail` → strict mode; any unhandled error aborts the script.
#   - The `grep -vE` filter uses `|| true` so a zero-match response code 1
#     does not abort under `pipefail`.
#
# Reference (Vercel):
#   https://vercel.com/docs/projects/git-configuration#ignore-a-build
#   > "If the ignoreCommand exits with code 0, the build will be canceled."

set -euo pipefail

# 1. Get the list of files changed between the previous and current deploy.
#    Vercel exposes the authoritative deploy SHAs as env vars:
#      - VERCEL_GIT_PREVIOUS_SHA = last successfully deployed commit
#      - VERCEL_GIT_COMMIT_SHA   = commit being built right now
#    Locally (no Vercel env vars) we fall back to HEAD~1..HEAD.
#    On a true first-ever commit (no HEAD~1), the git diff errors → proceed.
PREV_SHA="${VERCEL_GIT_PREVIOUS_SHA:-HEAD~1}"
CURR_SHA="${VERCEL_GIT_COMMIT_SHA:-HEAD}"
if ! CHANGED=$(git diff --name-only "$PREV_SHA" "$CURR_SHA" 2>/dev/null); then
  echo "::notice::vercel-ignore-docs: cannot diff $PREV_SHA..$CURR_SHA — proceeding with build"
  exit 1
fi

# 2. Empty diff (rare) → proceed with build.
if [ -z "$CHANGED" ]; then
  echo "::notice::vercel-ignore-docs: empty diff — proceeding with build"
  exit 1
fi

# 3. Find changed files that are NOT in docs/ and do NOT end in .md.
#    The alternation `^(docs/|\.md$)` matches:
#      - any path starting with `docs/` (covers docs/**/*.md, docs/**/*.tsx
#        if a future doc sample file ever lands there, etc.)
#      - any path ending with `.md` (covers top-level *.md like README.md,
#        ROADMAP.md, MISSION.md)
#    `grep -vE` inverts the match → only NON-doc changes survive.
#
#    TRADE-OFF note (rename to docs/): if a code file is renamed into
#    docs/ in a single commit, `git diff` reports only the new path, so
#    the build is skipped. The PREVIOUS production binary keeps serving
#    until a subsequent non-doc commit forces a rebuild that picks up
#    the rename. This is per the user's directive (treat the whole docs/
#    directory as docs) and bounded — any non-doc change corrects it.
NON_DOC=$(echo "$CHANGED" | grep -vE '^(docs/|\.md$)' || true)

if [ -z "$NON_DOC" ]; then
  COMMIT_SHORT=$(git rev-parse --short "$CURR_SHA")
  echo "::notice::vercel-ignore-docs: skipping Vercel build for commit ${COMMIT_SHORT} (docs-only changes)"
  echo "Changed files (all docs):"
  echo "$CHANGED" | sed 's/^/  /'
  exit 0
fi

# 4. At least one non-doc change → proceed with build.
echo "::notice::vercel-ignore-docs: non-doc changes detected — proceeding with build"
echo "Non-doc files:"
echo "$NON_DOC" | sed 's/^/  /'
exit 1
