#!/usr/bin/env bash
#
# scripts/ops/git-squash.sh
#
# Operator template for squashing N (≥2) consecutive commits into one,
# using the custom GIT_SEQUENCE_EDITOR pattern. Encodes the destructive
# history-rewrite approach proven in two prior in-repo rebase operations:
#
#   1. The 4-commit lint-squash (fd1c555 → 8a035c3 → 6047e57 → 4475c10
#      collapsed into one; preserved 4b3257b ADR commit on top).
#   2. The 2-commit varsIgnorePattern-squash (d862162 + bcdc47c collapsed
#      into one; preserved abb80d2 caughtErrorsIgnorePattern on top).
#
# Why a template (vs. ad-hoc one-off scripts each time):
#   - The auto-generated todo from `git rebase -i <parent>` lists EVERY
#     commit in the range, including intermediate ones the operator may
#     not have realized were in there. A naive `pick`-everything rebase
#     would re-SHA every commit in the chain, even ones the operator
#     intended to leave alone. The custom editor must match the exact
#     SHAs the operator specified and only flip those to `fixup`.
#   - The previous two in-repo operations used handwritten one-off
#     scripts that hardcoded the SHAs. That is not reusable for future
#     squashes; this template parameterizes the SHA list as `$@` args.
#   - Force-push with `--force-with-lease` is safety-critical: the lease
#     refuses if the remote moved (e.g. a parallel push). The retry loop
#     in this script honors the lease semantics.
#
# Usage:
#   # 1. Default (DRY-RUN): shows the plan, NO mutation. Exit 0.
#   scripts/ops/git-squash.sh <sha1> [sha2 sha3 ...]
#
#   # 2. Apply the rebase + amend the new commit message via $EDITOR:
#   scripts/ops/git-squash.sh --apply <sha1> [sha2 ...]
#
#   # 3. Apply + force-push (lease-safe):
#   scripts/ops/git-squash.sh --apply --push <sha1> [sha2 ...]
#
#   # 4. Provide the new message non-interactively:
#   scripts/ops/git-squash.sh --apply --message 'chore: single commit' <sha1> <sha2>
#   scripts/ops/git-squash.sh --apply --message-file /path/to/msg.txt <sha1> <sha2>
#   scripts/ops/git-squash.sh --apply --stdin <sha1> <sha2>   # pipe via stdin
#
#   # 5. Non-interactive (CI / scripted) — requires --message / --message-file / --stdin:
#   scripts/ops/git-squash.sh --apply --non-interactive --message 'chore: x' <sha1> <sha2>
#
# Safety contract:
#   - Default mode is DRY-RUN. The script prints the plan, the auto-
#     generated todo (reconstructed from `git rev-list` — does NOT start
#     a real rebase), the new commit message, the post-rebase commit-
#     graph diff, and the byte-equivalence expectation. Exit 0.
#   - `--apply` is required for any mutation. Even with `--apply`, the
#     script confirms with the operator before each destructive step
#     (rebase, amend, push). `--non-interactive` skips these prompts
#     and is intended for CI / scripted use only.
#   - `--push` is OFF by default. Even with `--apply --push`, the script
#     confirms before force-pushing.
#   - Force-push uses `--force-with-lease` (refuses if remote moved
#     unexpectedly). 5-attempt exponential backoff retry (1+2+4+8+16 = 31s
#     total). The lease semantics are preserved across retries.
#   - Pre-flight: refuses to start if there is a stale `.git/rebase-merge`
#     or `.git/rebase-apply` directory. Refuses if the working tree is
#     dirty (catches uncommitted changes that would block the rebase).
#   - Optional `--no-verify` skips the pre-flight `npx tsc --noEmit` gate.
#   - Post-rebase: verifies the working tree is byte-equivalent to the
#     pre-rebase HEAD (squashing is content-preserving; if the diff is
#     non-empty, the script refuses to push and prints a rollback hint).
#   - On any failure, the script prints a recovery hint pointing to
#     `git rebase --abort` (if mid-rebase) or `git reset --hard
#     <pre-rebase-sha>` (if post-rebase; the SHA is captured at step 1).
#   - The reflog preserves every rewritten SHA for 90 days (git default),
#     so any dropped commit is recoverable via `git reflog | grep <sha>`.
#
# Exit codes:
#   0  dry-run complete (or apply complete on success)
#   1  not in a git repository
#   2  no SHAs provided
#   3  one or more SHAs do not exist in this repo
#   4  SHAs are not a contiguous chain (parent-of-SHA[i+1] != SHA[i])
#   5  dirty working tree
#   6  stale rebase state detected
#   7  pre-flight `npx tsc --noEmit` failed
#   8  rebase itself failed (conflict, editor error, etc.)
#   9  amend failed (could not read message file / write to repo)
#   10 push failed after retry exhaustion
#   11 byte-equivalence check failed post-rebase (refuses to push)
#   12 operator declined the final confirmation
#   13 /dev/tty not available + no message provided + not --non-interactive
#   64 usage error (unknown flag, mutually-exclusive flags, --push
#      without --apply, --non-interactive without --message/stdin/file, etc.)
#
# CRITICAL: this script is EXECUTED, not sourced. Sourcing would pollute
# the operator's shell with our temp-file cleanup traps + would also
# exit early on errors (set -e) closing the operator's parent shell.
#
# Cross-refs:
#   - docs/adr/0010-lint-cleanup-type-aware-rules.md §Verification
#     pattern (the PIPESTATUS-aware tsc/eslint gate this script mirrors
#     at pre-flight + post-rebase).
#   - The two prior in-repo operations this template encodes:
#     1. lint-squash: squashed 4 commits into 1; force-pushed.
#     2. varsIgnorePattern-squash: squashed 2 commits into 1; force-pushed.

set -euo pipefail

# ─── Usage ─────────────────────────────────────────────────────────

usage() {
  cat <<'EOF'
Usage:
  scripts/ops/git-squash.sh [options] <sha1> [sha2 sha3 ...]

  Default mode is DRY-RUN: shows the plan, exits 0, makes NO changes.

  --apply              Actually run the rebase + amend (REQUIRED for mutation).
  --push               After successful rebase, push with --force-with-lease
                       (requires --apply; lease-safe; 5-attempt retry).
  --message <text>     New commit message (skip $EDITOR). Mutually exclusive
                       with --message-file / --stdin.
  --message-file <path>  Read new commit message from <path>.
  --stdin              Read new commit message from stdin (pipe-friendly).
  --branch <name>      Branch to push (default: current branch's upstream,
                       or 'main' if no upstream).
  --non-interactive    Skip all confirmation prompts. REQUIRES --message,
                       --message-file, or --stdin. Intended for CI / scripts.
  --no-verify          Skip the pre-flight npx tsc --noEmit gate (NOT
                       recommended — only use if you know the tree is
                       type-clean and want to save the 30-60s tsc run).
  --help, -h           Show this help.

Examples:
  # Dry-run (no mutation):
  scripts/ops/git-squash.sh 8a035c3 6047e57 4475c10

  # Squash 2 commits into 1, prompt for new message via $EDITOR:
  scripts/ops/git-squash.sh --apply d862162 bcdc47c

  # Squash + force-push with a one-liner message:
  scripts/ops/git-squash.sh --apply --push --message 'chore(eslint): close gap' d862162 bcdc47c

  # Squash with a multi-line message from a file:
  scripts/ops/git-squash.sh --apply --message-file /tmp/squash-msg.txt <sha1> <sha2>

  # CI / scripted (no prompts):
  scripts/ops/git-squash.sh --apply --non-interactive --message 'chore: x' <sha1> <sha2>

Recovery:
  - If the script aborts mid-rebase, run `git rebase --abort` to return
    to the pre-rebase state. The pre-rebase SHA was captured at step 1
    and printed in the banner.
  - If the script completes but the operator wants to undo, the reflog
    preserves every rewritten SHA for 90 days. Use:
      git reflog | grep <old-sha>
      git reset --hard <old-sha-from-reflog>
  - See the docstring header for the full recovery story.
EOF
}

# ─── Single-pass flag parsing ─────────────────────────────────────

IS_APPLY=false
IS_PUSH=false
IS_NON_INTERACTIVE=false
NO_VERIFY=false
MESSAGE_MODE=""     # "text" | "file" | "stdin" | ""
MESSAGE_TEXT=""
MESSAGE_FILE=""
PUSH_BRANCH=""
SHAS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply)
      IS_APPLY=true
      shift
      ;;
    --push)
      IS_PUSH=true
      shift
      ;;
    --non-interactive)
      IS_NON_INTERACTIVE=true
      shift
      ;;
    --no-verify)
      NO_VERIFY=true
      shift
      ;;
    --message)
      [[ $# -ge 2 ]] || { printf '\n❌ --message requires a value\n' >&2; exit 64; }
      MESSAGE_MODE="text"
      MESSAGE_TEXT="$2"
      shift 2
      ;;
    --message-file)
      [[ $# -ge 2 ]] || { printf '\n❌ --message-file requires a value\n' >&2; exit 64; }
      MESSAGE_MODE="file"
      MESSAGE_FILE="$2"
      shift 2
      ;;
    --stdin)
      MESSAGE_MODE="stdin"
      shift
      ;;
    --branch)
      [[ $# -ge 2 ]] || { printf '\n❌ --branch requires a value\n' >&2; exit 64; }
      PUSH_BRANCH="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    -*)
      printf '\n❌ Unknown flag: %s\n' "$1" >&2
      usage
      exit 64
      ;;
    *)
      SHAS+=("$1")
      shift
      ;;
  esac
done

# ─── Cross-flag validation ─────────────────────────────────────────

if [[ "$IS_PUSH" == true && "$IS_APPLY" != true ]]; then
  printf '\n❌ --push requires --apply (otherwise we would push without verifying the rebase).\n' >&2
  usage
  exit 64
fi

if [[ "$IS_NON_INTERACTIVE" == true && "$MESSAGE_MODE" == "" ]]; then
  printf '\n❌ --non-interactive requires --message, --message-file, or --stdin.\n' >&2
  usage
  exit 64
fi

# ─── Pre-flight: git repo ──────────────────────────────────────────

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  printf '\n❌ Not in a git repository. Run from the project root.\n' >&2
  exit 1
fi

PROJECT_ROOT="$(git rev-parse --show-toplevel)"
cd "$PROJECT_ROOT"

# ─── Pre-flight: SHA count ─────────────────────────────────────────

if [[ ${#SHAS[@]} -lt 2 ]]; then
  printf '\n❌ At least 2 SHAs are required (one to survive, ≥1 to absorb).\n' >&2
  printf '   Got: %d SHA(s).\n' "${#SHAS[@]}" >&2
  usage
  exit 2
fi

# ─── Helpers ───────────────────────────────────────────────────────

banner() {
  local label="$1"
  printf '\n\033[1;36m═══════════════════════════════════════════════════════════════\n'
  printf '══ %s\n' "$label"
  printf '══ %s\n' "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  printf '\033[0m\n'
}

ok_or_exit() {
  local label="$1"
  local rc="$2"
  local code="${3:-1}"
  if [[ "$rc" -ne 0 ]]; then
    printf '\n\033[1;31m❌ %s failed with exit code %s\033[0m\n' "$label" "$rc" >&2
    printf '   See recovery instructions in the docstring header.\n' >&2
    exit "$code"
  fi
}

# confirm: prompt the operator for y/n. Falls back to auto-yes when
# IS_NON_INTERACTIVE is true. Falls back to error when /dev/tty is
# unavailable AND non-interactive is not set.
confirm() {
  local prompt="$1"
  local default="${2:-N}"

  if [[ "$IS_NON_INTERACTIVE" == true ]]; then
    printf '\n[non-interactive] %s → auto-YES\n' "$prompt"
    return 0
  fi

  if [[ ! -t 0 && ! -r /dev/tty ]]; then
    printf '\n❌ /dev/tty is not available and --non-interactive was not set.\n' >&2
    printf '   Either run interactively, or pass --non-interactive\n' >&2
    printf '   (which requires --message / --message-file / --stdin).\n' >&2
    exit 13
  fi

  local yn
  local yn_label
  if [[ "$default" == "Y" ]]; then
    yn_label="[Y/n]"
  else
    yn_label="[y/N]"
  fi
  printf '\n\033[1;33m%s %s: \033[0m' "$prompt" "$yn_label"
  read -r yn </dev/tty
  yn="${yn:-$default}"
  case "${yn,,}" in
    y|yes) return 0 ;;
    *)     return 1 ;;
  esac
}

# ─── Pre-flight: SHAs exist + form a chain ────────────────────────

banner "Pre-flight: validate SHAs"

# Normalize every SHA to its full 40-char form. We do this in a fresh
# array (NORMALIZED) to avoid the broken bash parameter-expansion
# pattern `SHAS=("${SHAS[@]/$old/$new}")` which corrupts array elements
# when $old is a prefix of $new (e.g. short SHA matches inside long SHA).
NORMALIZED=()
for sha in "${SHAS[@]}"; do
  if ! git cat-file -t "$sha" >/dev/null 2>&1; then
    printf '\n❌ SHA %s does not exist in this repo.\n' "$sha" >&2
    printf '   Tip: use `git log --oneline -20` to find the right SHAs.\n' >&2
    exit 3
  fi
  NORMALIZED+=("$(git rev-parse "$sha")")
done
SHAS=("${NORMALIZED[@]}")

# Chain validation: SHAS[0] is the survivor (oldest in the chain the
# user wants to squash); SHAS[1..N-1] are absorbed by it. The order
# MUST be oldest → newest. We verify parent(SHAS[i+1]) == SHAS[i].
for i in $(seq 0 $((${#SHAS[@]} - 2))); do
  expected_parent="${SHAS[$i]}"
  actual_parent="$(git rev-parse "${SHAS[$((i+1))]}^" 2>/dev/null || true)"
  if [[ -z "$actual_parent" || "$actual_parent" != "$expected_parent" ]]; then
    printf '\n❌ SHAs are not a contiguous chain.\n' >&2
    printf '   Expected parent of %s to be %s, got %s.\n' \
      "${SHAS[$((i+1))]:0:12}" \
      "${expected_parent:0:12}" \
      "${actual_parent:0:12}" >&2
    printf '   Tip: SHAs must be in oldest → newest order. Use\n' >&2
    printf '        git log --oneline -10\n' >&2
    printf '   to find the chain.\n' >&2
    exit 4
  fi
done

printf '✓ %d SHAs form a contiguous chain\n' "${#SHAS[@]}"
for sha in "${SHAS[@]}"; do
  subject="$(git log -1 --format='%s' "$sha")"
  printf '  • %s  %s\n' "${sha:0:12}" "$subject"
done

# ─── Auto-detect parent (rebase upstream) ─────────────────────────

REBASE_UPSTREAM="$(git rev-parse "${SHAS[0]}^" 2>/dev/null || true)"
if [[ -z "$REBASE_UPSTREAM" ]]; then
  printf '\n❌ Cannot find parent of first SHA (%s). It may be a root commit.\n' \
    "${SHAS[0]:0:12}" >&2
  printf '   The script refuses to rebase the root of the repo.\n' >&2
  exit 4
fi
printf '✓ Rebase upstream (parent of first SHA): %s\n' "${REBASE_UPSTREAM:0:12}"

# ─── Pre-flight: clean working tree ────────────────────────────────

if ! git diff --quiet HEAD 2>/dev/null || \
   ! git diff --cached --quiet HEAD 2>/dev/null; then
  printf '\n❌ Working tree has uncommitted changes.\n' >&2
  printf '   Stash, commit, or discard before running this script.\n' >&2
  printf '   `git status` for the offending files.\n' >&2
  exit 5
fi
printf '✓ Working tree clean\n'

# ─── Pre-flight: no stale rebase state ────────────────────────────

GIT_DIR="$(git rev-parse --git-dir)"
if [[ -d "$GIT_DIR/rebase-merge" || -d "$GIT_DIR/rebase-apply" ]]; then
  printf '\n❌ Stale rebase state detected:\n' >&2
  [[ -d "$GIT_DIR/rebase-merge" ]] && printf '   • %s/rebase-merge\n' "$GIT_DIR" >&2
  [[ -d "$GIT_DIR/rebase-apply" ]] && printf '   • %s/rebase-apply\n' "$GIT_DIR" >&2
  printf '   Recover via:\n' >&2
  printf '     git rebase --abort  # if a rebase is in progress\n' >&2
  printf '     # or, if --abort errors out (rare):\n' >&2
  printf '     rm -rf %s/rebase-merge %s/rebase-apply\n' "$GIT_DIR" "$GIT_DIR" >&2
  exit 6
fi
printf '✓ No stale rebase state\n'

# ─── Pre-flight: typecheck (PIPESTATUS-aware per ADR 0010) ─────────

if [[ "$NO_VERIFY" == false ]]; then
  banner "Pre-flight: typecheck (npx tsc --noEmit)"
  if ! npx tsc --noEmit > /tmp/git-squash-tsc.out 2>&1; then
    printf '\n❌ npx tsc --noEmit failed. Refusing to rewrite history on a broken type tree.\n' >&2
    printf '   See /tmp/git-squash-tsc.out for the full error list.\n' >&2
    printf '   Pass --no-verify to skip this gate (NOT recommended).\n' >&2
    exit 7
  fi
  printf '✓ tsc clean (npx tsc --noEmit exit 0)\n'
else
  printf '⚠️  --no-verify: skipping tsc gate (operator override)\n'
fi

# ─── Capture pre-rebase state ─────────────────────────────────────

PRE_REBASE_HEAD="$(git rev-parse HEAD)"
printf '✓ Pre-rebase HEAD: %s\n' "${PRE_REBASE_HEAD:0:12}"

# ─── Generate the auto-editor script ──────────────────────────────
#
# The auto-generated todo from `git rebase -i <parent>` will list every
# commit in [parent, HEAD]. We sed-transform only the SHAs the operator
# specified: SHAS[0] stays `pick` (survivor), SHAS[1..N-1] become
# `fixup` (absorbed). All other commits (intermediates, post-chain)
# stay `pick` and are preserved as-is (with new SHAs from the parent
# change, which is the standard rebase -i behavior).
#
# The script lives in a temp file we chmod +x so the heredoc-fed
# content can run via GIT_SEQUENCE_EDITOR=<path>. The trap below
# ensures cleanup on any exit path.

AUTO_EDITOR="$(mktemp -t gitsquash-editor-XXXXXX.sh)"
AUTO_MSG="$(mktemp -t gitsquash-msg-XXXXXX.txt)"
trap 'rm -f "$AUTO_EDITOR" "$AUTO_MSG"' EXIT INT TERM

# Build the sed transformer. Each substitution is line-anchored
# (`^pick <sha> `) so we never accidentally match a commit subject
# that happens to contain the SHA as a substring. We mark only the
# absorbed SHAs (SHAS[1..N-1]); SHAS[0] keeps its default `pick`
# (no sed entry needed — leaving it untouched is the desired behavior).
{
  printf '#!/usr/bin/env bash\n'
  printf '# Auto-generated GIT_SEQUENCE_EDITOR for git-squash.sh\n'
  printf '# Marks SHAS[1..N-1] as `fixup` (absorbed into SHAS[0]).\n'
  printf '# All other lines are left untouched (preserved as `pick`).\n'
  printf 'sed -i.bak \\\n'
  for i in $(seq 1 $((${#SHAS[@]} - 1))); do
    sha="${SHAS[$i]}"
    printf '  -e "s/^pick %s /fixup %s /" \\\n' "$sha" "$sha"
  done
  printf '  "$1"\n'
  printf 'rm -f "$1.bak"\n'
} > "$AUTO_EDITOR"
chmod +x "$AUTO_EDITOR"

printf '\n✓ Auto-generated editor written to %s\n' "$AUTO_EDITOR"
printf '  — marks %d of %d SHAs as fixup (1 survivor + %d absorbed)\n' \
  "$(( ${#SHAS[@]} - 1 ))" "${#SHAS[@]}" "$(( ${#SHAS[@]} - 1 ))"

# ─── Build the new commit message template ────────────────────────

if [[ "$MESSAGE_MODE" == "text" ]]; then
  printf '%s\n' "$MESSAGE_TEXT" > "$AUTO_MSG"
elif [[ "$MESSAGE_MODE" == "file" ]]; then
  if [[ ! -f "$MESSAGE_FILE" ]]; then
    printf '\n❌ --message-file %s does not exist.\n' "$MESSAGE_FILE" >&2
    exit 64
  fi
  cp "$MESSAGE_FILE" "$AUTO_MSG"
elif [[ "$MESSAGE_MODE" == "stdin" ]]; then
  cat > "$AUTO_MSG"
else
  # Default: open $EDITOR with a template. Strip `#`-prefixed lines
  # (the "Original commits" comment header) before the amend so they
  # don't leak into the final commit message.
  if [[ "$IS_NON_INTERACTIVE" == true ]]; then
    printf '\n❌ --non-interactive requires --message, --message-file, or --stdin.\n' >&2
    exit 64
  fi
  {
    printf '%s\n' "$(git log -1 --format='%s' "${SHAS[0]}")"
    printf '\n'
    printf '# Original commits being squashed (delete this comment before saving):\n'
    for sha in "${SHAS[@]}"; do
      subject="$(git log -1 --format='%s' "$sha")"
      printf '#   • %s  %s\n' "${sha:0:12}" "$subject"
    done
  } > "$AUTO_MSG"
  printf '\nOpening $EDITOR (%s) with the message template.\n' "${EDITOR:-vi}"
  printf 'Edit + save + quit to continue. Lines starting with # are\n'
  printf 'auto-stripped before the amend (so the comment header above\n'
  printf 'does not leak into the final commit message).\n'
  if [[ -z "${EDITOR:-}" ]]; then
    EDITOR=vi
    export EDITOR
    printf '⚠️  $EDITOR unset; defaulting to vi.\n'
  fi
  "$EDITOR" "$AUTO_MSG"
fi

# Strip any # comment lines (defensive: the operator might have left
# the "Original commits" header in the edited buffer). Git's commit
# message format treats # as a comment, so this is safe.
if [[ "$MESSAGE_MODE" != "stdin" ]]; then
  TMP_STRIPPED="$(mktemp -t gitsquash-stripped-XXXXXX.txt)"
  grep -v '^[[:space:]]*#' "$AUTO_MSG" > "$TMP_STRIPPED" || true
  # Preserve trailing newline if the original had one
  if [[ -s "$AUTO_MSG" && -s "$TMP_STRIPPED" ]]; then
    if [[ "$(tail -c1 "$AUTO_MSG")" == "" ]] && [[ "$(tail -c1 "$TMP_STRIPPED")" != "" ]]; then
      printf '\n' >> "$TMP_STRIPPED"
    fi
  fi
  mv "$TMP_STRIPPED" "$AUTO_MSG"
  trap 'rm -f "$AUTO_EDITOR" "$AUTO_MSG" "$TMP_STRIPPED"' EXIT INT TERM
  rm -f "$TMP_STRIPPED"
fi

# ─── Dry-run: show the plan ───────────────────────────────────────

banner "Plan (DRY-RUN unless --apply is set)"

printf 'Rebase range:\n'
printf '  upstream (parent of first SHA):  %s\n' "${REBASE_UPSTREAM:0:12}"
printf '  first SHA (survivor, → pick):    %s\n' "${SHAS[0]:0:12}"
for i in $(seq 1 $((${#SHAS[@]} - 1))); do
  printf '  absorbed SHA (→ fixup):          %s\n' "${SHAS[$i]:0:12}"
done

# Reconstruct the auto-generated todo (safely, WITHOUT running a real
# rebase). We use `git rev-list --topo-order --reverse` to enumerate
# the commits in chronological order, then build the same todo git
# would generate. The reconstruction is content-equivalent to what
# `git rebase -i` would emit at the start of the rebase.
printf '\nAuto-generated todo (reconstructed from `git rev-list`; sed will transform SHAS[1..N-1] to fixup):\n'
PREVIEW_TODO="$(mktemp -t gitsquash-preview-XXXXXX.txt)"
trap 'rm -f "$AUTO_EDITOR" "$AUTO_MSG" "$PREVIEW_TODO"' EXIT INT TERM
for sha in $(git rev-list --topo-order --reverse "$REBASE_UPSTREAM..$PRE_REBASE_HEAD"); do
  subject="$(git log -1 --format='%s' "$sha")"
  is_specified=false
  for s in "${SHAS[@]}"; do
    if [[ "$s" == "$sha" ]]; then
      is_specified=true
      break
    fi
  done
  if [[ "$is_specified" == true && "$sha" != "${SHAS[0]}" ]]; then
    printf 'fixup %s %s\n' "$sha" "$subject" >> "$PREVIEW_TODO"
  else
    printf 'pick  %s %s\n' "$sha" "$subject" >> "$PREVIEW_TODO"
  fi
done
cat "$PREVIEW_TODO"

printf '\nNew commit message (the --amend will set this on the squashed commit):\n'
printf -- '----------------------------------------\n'
cat "$AUTO_MSG"
printf -- '----------------------------------------\n'

# Show what will change in the working tree (should be empty for a
# content-preserving squash, but explicit is better than implicit).
printf '\nExpected post-rebase working-tree diff vs pre-rebase HEAD (should be EMPTY):\n'
if git diff --quiet "$PRE_REBASE_HEAD" HEAD 2>/dev/null; then
  printf '  (no diff to compute — pre-rebase HEAD == current HEAD)\n'
else
  printf '  ⚠️  pre-rebase HEAD already differs from current HEAD (rebase already in progress?)\n'
fi

printf '\nCumulative diff of the squashed chain (REBASE_UPSTREAM..PRE_REBASE_HEAD):\n'
git diff --stat "$REBASE_UPSTREAM..$PRE_REBASE_HEAD" | tail -20

printf '\nExpected post-rebase state:\n'
printf '  • HEAD is rewritten to a NEW SHA (parent changed → SHA changes).\n'
printf '    The new SHA cannot be predicted in advance.\n'
printf '  • The squashed commit retains the subject from SHAS[0] (or your\n'
printf '    edited message if --message / --message-file / --stdin / $EDITOR was used).\n'
printf '  • All other commits in [upstream, HEAD] are preserved as `pick`,\n'
printf '    with NEW SHAs (standard rebase -i SHA-rewrite behavior).\n'
printf '  • Working tree is BYTE-EQUIVALENT to the pre-rebase state\n'
printf '    (squashing is content-preserving; the script verifies this).\n'

printf '\nReflog recovery hint (always available, 90-day window):\n'
printf '  git reflog | grep %s\n' "${SHAS[0]:0:12}"
printf '  git reset --hard <old-sha-from-reflog>   # to undo\n'

# ─── Exit early if dry-run (default) ───────────────────────────────

if [[ "$IS_APPLY" != true ]]; then
  banner "DRY-RUN complete (no mutation, no push)"
  printf 'Re-run with --apply to perform the rebase.\n'
  printf 'Add --push (with --apply) to also force-push the result.\n'
  exit 0
fi

# ─── Apply: confirm before rebase ─────────────────────────────────

banner "APPLY mode — confirm each step before continuing"

if ! confirm "About to run 'git rebase -i $REBASE_UPSTREAM' with the auto-editor above. Continue?"; then
  printf '\nAborted by operator.\n'
  exit 12
fi

# ─── Apply: rebase ────────────────────────────────────────────────

banner "Step 1/3: git rebase -i $REBASE_UPSTREAM"

if ! GIT_SEQUENCE_EDITOR="$AUTO_EDITOR" git rebase -i "$REBASE_UPSTREAM"; then
  rc=$?
  printf '\n\033[1;31m❌ git rebase -i failed (exit code %s)\033[0m\n' "$rc" >&2
  printf '   This is unusual for a fixup-only rebase (no content changes).\n' >&2
  printf '   Most common cause: a mid-rebase conflict or an editor error.\n' >&2
  printf '\nRecovery:\n' >&2
  printf '   1. Inspect the state:  git status\n' >&2
  printf '   2. If mid-rebase:      git rebase --abort   # to return to pre-rebase\n' >&2
  printf '   3. If post-rebase:     git reset --hard %s   # the SHA captured at step 1\n' \
    "${PRE_REBASE_HEAD:0:12}" >&2
  printf '   4. Reflog (90-day):    git reflog | grep %s\n' "${PRE_REBASE_HEAD:0:12}" >&2
  exit 8
fi
printf '✓ rebase complete\n'

POST_REBASE_HEAD="$(git rev-parse HEAD)"

# ─── Verify: byte-equivalence ──────────────────────────────────────

banner "Step 1.5/3: verify byte-equivalence (squash is content-preserving)"

if ! git diff --quiet "$PRE_REBASE_HEAD" HEAD 2>/dev/null; then
  printf '\n\033[1;31m❌ Working tree changed unexpectedly during the rebase.\033[0m\n' >&2
  printf '   Pre-rebase HEAD:  %s\n' "$PRE_REBASE_HEAD" >&2
  printf '   Post-rebase HEAD: %s\n' "$POST_REBASE_HEAD" >&2
  printf '   Diff (should be empty):\n' >&2
  git diff --stat "$PRE_REBASE_HEAD" HEAD >&2
  printf '\n   Refusing to push. Investigate the diff above.\n' >&2
  printf '   Recovery:  git reset --hard %s\n' "${PRE_REBASE_HEAD:0:12}" >&2
  exit 11
fi
printf '✓ Working tree byte-equivalent to pre-rebase HEAD\n'

# ─── Apply: amend with new message ────────────────────────────────

banner "Step 2/3: git commit --amend (set new commit message)"

if ! git commit --amend -F "$AUTO_MSG"; then
  rc=$?
  printf '\n\033[1;31m❌ git commit --amend failed (exit code %s)\033[0m\n' "$rc" >&2
  printf '   The rebase already completed; the message did not update.\n' >&2
  printf '   Recovery:  git reset --hard %s   # to undo the rebase\n' \
    "${PRE_REBASE_HEAD:0:12}" >&2
  exit 9
fi
printf '✓ amend complete\n'

POST_AMEND_HEAD="$(git rev-parse HEAD)"
printf '  New HEAD: %s\n' "${POST_AMEND_HEAD:0:12}"
printf '  Subject:  %s\n' "$(git log -1 --format='%s' HEAD)"

# ─── Apply: push (only if --push) ─────────────────────────────────

if [[ "$IS_PUSH" != true ]]; then
  banner "✅ Re-write complete (no push; --push not set)"
  printf 'The rebase + amend succeeded. To push:\n'
  printf '  git push --force-with-lease origin %s\n' \
    "${PUSH_BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
  printf '\nReflog recovery (90-day window):\n'
  printf '  git reflog | grep %s\n' "${PRE_REBASE_HEAD:0:12}"
  exit 0
fi

banner "Step 3/3: git push --force-with-lease"

# Resolve the branch to push
if [[ -z "$PUSH_BRANCH" ]]; then
  PUSH_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
  # If no upstream, fall back to 'main'
  if ! git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    PUSH_BRANCH="main"
  fi
fi

if ! confirm "About to FORCE-push to origin/$PUSH_BRANCH with --force-with-lease. The lease will refuse if the remote moved. Continue?"; then
  printf '\nPush aborted by operator. Local rebase is complete and recoverable via reflog.\n'
  printf '  git push --force-with-lease origin %s   # when ready\n' "$PUSH_BRANCH"
  exit 12
fi

# 5-attempt exponential backoff retry loop honoring --force-with-lease.
# Total max wait: 1+2+4+8+16 = 31s. Force-pushes should succeed first
# try; the retry loop handles transient network/lease contention only.
PUSH_ATTEMPTS=5
PUSH_DELAY=1
for attempt in $(seq 1 "$PUSH_ATTEMPTS"); do
  if git push --force-with-lease origin "$PUSH_BRANCH"; then
    printf '✓ push complete (attempt %d/%d)\n' "$attempt" "$PUSH_ATTEMPTS"
    break
  fi
  rc=$?
  if [[ $attempt -eq $PUSH_ATTEMPTS ]]; then
    printf '\n\033[1;31m❌ push failed after %d attempts (final exit %s)\033[0m\n' \
      "$PUSH_ATTEMPTS" "$rc" >&2
    printf '   Most common cause: the lease was refused (remote moved unexpectedly).\n' >&2
    printf '   Check `git fetch origin && git log origin/%s -5` to see the divergence.\n' \
      "$PUSH_BRANCH" >&2
    printf '   Recovery: rebase onto the latest origin/%s and re-run this script.\n' \
      "$PUSH_BRANCH" >&2
    exit 10
  fi
  printf '  push attempt %d failed (exit %s); retrying in %ss...\n' \
    "$attempt" "$rc" "$PUSH_DELAY"
  sleep "$PUSH_DELAY"
  PUSH_DELAY=$((PUSH_DELAY * 2))
done

# ─── Final summary ────────────────────────────────────────────────

banner "✅ Re-write + push complete"

printf 'Pre-rebase HEAD:  %s\n' "${PRE_REBASE_HEAD:0:12}"
printf 'Post-rebase HEAD: %s\n' "$(git rev-parse --short HEAD)"
printf 'Remote:           origin/%s\n' "$PUSH_BRANCH"
printf 'Working tree:     byte-equivalent to pre-rebase ✓\n'
printf '\nRecovery (90-day reflog window):\n'
printf '  git reflog | grep %s\n' "${PRE_REBASE_HEAD:0:12}"
printf '  git reset --hard <old-sha-from-reflog>   # to undo the push\n'
printf '\nDone.\n'
