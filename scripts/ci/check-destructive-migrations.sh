#!/usr/bin/env bash
# scripts/ci/check-destructive-migrations.sh
#
# Real-content migration safety scanner.
#
# Closes a P0 gap in the legacy `ci.yml` "Schema migration safety"
# step, which only looked at migration folder *names* for "drop" /
# "rename". A migration named `20260719_update_product/migration.sql`
# containing `DROP TABLE "X"` slipped through: its folder name did
# not match the (only) `\bdrop\b` / `\brename\b` keyword regex on
# pathnames. This script reads the actual SQL content of every
# modified migration.sql and matches against ADR 001's forbidden
# statement set.
#
# Per ADR 001 (`docs/architecture/001-db-migrations.md`), until the v2
# cutover these SQL keywords are FORBIDDEN:
#
#   * DROP COLUMN            — Regola 1 (column drop on webhook-locked tables)
#   * DROP TABLE             — fleet-wide: any DROP TABLE must clear ADR exceptions
#   * RENAME COLUMN          — Regola 1 (column rename on webhook-locked tables)
#   * RENAME TO              — ALTER TABLE ... RENAME TO ... (table rename)
#   * TRUNCATE [TABLE]       — wipes rows the webhook may replay against
#
# Allowed (operational hygiene; the historical repo DROP INDEXes
# freely per `20260712210000_drop_creator_id_index/migration.sql`):
#
#   * DROP INDEX
#   * DROP CONSTRAINT
#   * DROP VIEW / FUNCTION / TRIGGER / POLICY / EXTENSION
#   * CREATE / ALTER / ADD COLUMN / SET DEFAULT / SET NOT NULL
#
# Usage:
#   bash scripts/ci/check-destructive-migrations.sh [<sql-file>...]
#                                            # explicit list of .sql files
#   bash scripts/ci/check-destructive-migrations.sh    # auto: git diff origin/main...HEAD
#   bash scripts/ci/check-destructive-migrations.sh --self-test
#                                            # run 12 fixture cases against tmpdir
#
# Exit codes:
#   0 — no destructive SQL detected (or empty change-set)
#   1 — destructive SQL detected (with ::error:: annotations)
#
# Implementation notes:
#   - SQL comments (`--` and `/* ... */` multi-line) are stripped
#     before matching so discussing "DROP" in a comment does NOT
#     trigger. (A real DROP outside comments still triggers.)
#   - `origin/main` must be resolvable; the ci.yml typecheck job has
#     `fetch-depth: 0` so the diff is meaningful.
#   - `migration_lock.toml` is excluded by the explicit `*.sql`
#     glob; the script additionally filters by `--file` existence
#     so deleted/renamed paths don't false-positive.
#   - Fail-open semantics (mirrors legacy): empty diff = exit 0.
#     This means "git diff cannot run" → exit 0; the underlying CI
#     log will still surface the ref-not-found if applicable.

set -euo pipefail

# ── Self-test mode ────────────────────────────────────────────────
if [ "${1:-}" = "--self-test" ]; then
  TMPDIR=$(mktemp -d)
  trap 'rm -rf "$TMPDIR"' EXIT

  pass=0
  fail=0

  # `assert_exit` is intentionally written to ALWAYS return 0 even on a
  # mismatch. We rely on the $pass / $fail counters for the final tally,
  # not on the function's exit status — otherwise `set -e` would abort
  # the entire --self-test on the first mismatch, hiding subsequent
  # failures. The final RESULT: line is what callers act on.
  assert_exit() {
    local name="$1" expected="$2" got="$3"
    if [ "$expected" = "$got" ]; then
      echo "  ✓ $name (exit=$got)"
      pass=$((pass + 1))
    else
      echo "  ✗ $name (exit=$got, expected=$expected)"
      fail=$((fail + 1))
    fi
    return 0
  }

  # Helper: run the script against $1 and capture the REAL exit code
  # without `set -e` or `|| true` swallowing it. Spawning a subshell
  # with `set +e` lets us read the raw exit code; `|| true` would
  # always zero out $? and silently break the assertions.
  run_and_capture_exit() {
    (
      set +e
      bash "$0" "$1" >/dev/null 2>&1
      echo $?
    )
  }

  # CASE 1: purely additive migration → PASS
  cat > "$TMPDIR/01_additive.sql" <<'SQL'
CREATE TABLE "Foo" ("id" TEXT NOT NULL, PRIMARY KEY ("id"));
CREATE INDEX "Foo_id_idx" ON "Foo"("id");
ALTER TABLE "User" ADD COLUMN "extraField" TEXT;
ALTER TABLE "User" ALTER COLUMN "preferredLocale" SET DEFAULT 'en';
SQL
  ec=$(run_and_capture_exit "$TMPDIR/01_additive.sql")
  assert_exit "additive-only migration" "0" "$ec"

  # CASE 2: DROP COLUMN on ADR-locked table → FAIL
  cat > "$TMPDIR/02_drop_column.sql" <<'SQL'
ALTER TABLE "Order" DROP COLUMN "currency";
SQL
  ec=$(run_and_capture_exit "$TMPDIR/02_drop_column.sql")
  assert_exit "DROP COLUMN on Order (locked column per ADR 001)" "1" "$ec"

  # CASE 3: DROP INDEX + DROP CONSTRAINT → PASS (operational hygiene)
  cat > "$TMPDIR/03_drop_index.sql" <<'SQL'
DROP INDEX IF EXISTS "Product_creatorId_idx";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_creatorId_fkey";
SQL
  ec=$(run_and_capture_exit "$TMPDIR/03_drop_index.sql")
  assert_exit "DROP INDEX + DROP CONSTRAINT (allowed)" "0" "$ec"

  # CASE 4: DROP TABLE on a non-locked table → FAIL (ADR exceptions required)
  cat > "$TMPDIR/04_drop_table.sql" <<'SQL'
DROP TABLE IF EXISTS "Account" CASCADE;
SQL
  ec=$(run_and_capture_exit "$TMPDIR/04_drop_table.sql")
  assert_exit "DROP TABLE on non-locked table" "1" "$ec"

  # CASE 5: identifier containing "drop" → PASS (false-positive guard)
  cat > "$TMPDIR/05_false_positive.sql" <<'SQL'
ALTER TABLE "User" ADD COLUMN "dropboxUrl" TEXT;
COMMENT ON COLUMN "User"."dropboxUrl" IS 'URL pointing to a dropbox shared folder';
CREATE TABLE "rename_log" ("id" TEXT PRIMARY KEY, "old_name" TEXT, "new_name" TEXT);
SQL
  ec=$(run_and_capture_exit "$TMPDIR/05_false_positive.sql")
  assert_exit "identifier containing 'drop' (false-positive guard)" "0" "$ec"

  # CASE 6: "DROP"/"RENAME" only inside comments → PASS (false-positive guard)
  cat > "$TMPDIR/06_comment_only.sql" <<'SQL'
-- TODO: we can DROP this later once we migrate
/* discussion: RENAME COLUMN is on the table */
ALTER TABLE "User" ADD COLUMN "extra" TEXT;
SQL
  ec=$(run_and_capture_exit "$TMPDIR/06_comment_only.sql")
  assert_exit "DROP / RENAME only in comments (false-positive guard)" "0" "$ec"

  # CASE 7: RENAME COLUMN on a locked table → FAIL
  cat > "$TMPDIR/07_rename.sql" <<'SQL'
ALTER TABLE "ProcessedWebhook" RENAME COLUMN "deliveryId" TO "deliveryKey";
SQL
  ec=$(run_and_capture_exit "$TMPDIR/07_rename.sql")
  assert_exit "RENAME COLUMN on webhook-locked table" "1" "$ec"

  # CASE 8: TRUNCATE on a locked table → FAIL
  cat > "$TMPDIR/08_truncate.sql" <<'SQL'
TRUNCATE TABLE "ProcessedWebhook";
SQL
  ec=$(run_and_capture_exit "$TMPDIR/08_truncate.sql")
  assert_exit "TRUNCATE on webhook-locked table" "1" "$ec"

  # CASE 9: RENAME TO (table rename) → FAIL
  cat > "$TMPDIR/09_rename_to.sql" <<'SQL'
ALTER TABLE "OldName" RENAME TO "NewName";
SQL
  ec=$(run_and_capture_exit "$TMPDIR/09_rename_to.sql")
  assert_exit "RENAME TO (table rename)" "1" "$ec"

  # CASE 10: empty / whitespace-only file → PASS
  : > "$TMPDIR/10_empty.sql"
  ec=$(run_and_capture_exit "$TMPDIR/10_empty.sql")
  assert_exit "empty file" "0" "$ec"

  # CASE 11: lowercase `drop table` (case-insensitive check) → FAIL
  cat > "$TMPDIR/11_lowercase.sql" <<'SQL'
drop table "Account";
SQL
  ec=$(run_and_capture_exit "$TMPDIR/11_lowercase.sql")
  assert_exit "lowercase DROP TABLE (case-insensitive)" "1" "$ec"

  # CASE 12: ALTER TABLE ONLY ... DROP COLUMN (Postgres-only syntax)
  cat > "$TMPDIR/12_alter_table_only.sql" <<'SQL'
ALTER TABLE ONLY "Order" DROP COLUMN "stripeSessionId";
SQL
  ec=$(run_and_capture_exit "$TMPDIR/12_alter_table_only.sql")
  assert_exit "ALTER TABLE ONLY ... DROP COLUMN (Postgres-only)" "1" "$ec"

  echo "─────────────────────────────────────────────"
  echo "self-test: $pass pass / $fail fail"
  if [ "$fail" -gt 0 ]; then
    echo "RESULT: FAIL"
    exit 1
  fi
  echo "RESULT: PASS"
  exit 0
fi

# ── Normal mode ──────────────────────────────────────────────────
# Build FILES from either explicit args or `git diff origin/main...HEAD`.
# Use a manual loop (not `mapfile`) for broader bash portability —
# `mapfile` is bash 4+ only and macOS still ships bash 3 by default.
# Trim only `\r\n` (NOT space — a PR title `creates foo .sql` keeps spaces).
FILES=()
if [ "$#" -gt 0 ]; then
  while IFS= read -r f; do
    f="${f%%[$'\r\n']}"
    [ -n "$f" ] && FILES+=("$f")
  done < <(printf '%s\n' "$@")
else
  # Auto-detect: git diff origin/main...HEAD -- prisma/migrations/*.sql
  # Empty diff means no changed migration files; exit 0 silently.
  CHANGED=$(git diff --name-only origin/main...HEAD -- 'prisma/migrations/*.sql' 2>/dev/null || true)
  if [ -z "$CHANGED" ]; then
    echo "✓ Schema migration safety: no changed .sql files."
    exit 0
  fi
  while IFS= read -r f; do
    f="${f%%[$'\r\n']}"
    [ -n "$f" ] && FILES+=("$f")
  done < <(printf '%s\n' "$CHANGED")
fi

# Filter to currently-existing files (deleted/renamed paths skipped)
EXISTING=()
for f in "${FILES[@]}"; do
  [ -n "$f" ] && [ -f "$f" ] && EXISTING+=("$f")
done

if [ "${#EXISTING[@]}" -eq 0 ]; then
  echo "✓ Schema migration safety: no migration files to scan."
  exit 0
fi

# ── Strip SQL comments (`--` and multi-line `/* ... */`) ─────────
# awk-based state machine. Preserves line-count so grep -n output
# maps to the original line number in the file. Emits stripped SQL
# to stdout; one output line per input line (blank lines preserved).
strip_comments() {
  awk '
    BEGIN { in_block = 0 }
    {
      line = $0
      out = ""
      i = 1
      len = length(line)
      while (i <= len) {
        if (in_block) {
          c = index(substr(line, i), "*/")
          if (c == 0) { i = len + 1 }
          else { i = i + c + 1; in_block = 0 }
          continue
        }
        d = index(substr(line, i), "--")
        o = index(substr(line, i), "/*")
        if (d == 0 && o == 0) {
          out = out substr(line, i)
          i = len + 1
        } else if (d > 0 && (o == 0 || d <= o)) {
          out = out substr(line, i, d - 1)
          i = len + 1   # line comment → drop rest of line
        } else {
          out = out substr(line, i, o - 1)
          i = i + o + 1
          c = index(substr(line, i), "*/")
          if (c > 0) { i = i + c + 1 }
          else { in_block = 1 }
        }
      }
      print out
    }
    END {
      if (in_block) {
        # Unterminated /* ... — surface as a CI warning, not a hard
        # error (Prisma never emits blocks; this catches hand-edits).
        print "::warning file=" FILENAME "::unterminated /* block comment at EOF; tail content not scanned" > "/dev/stderr"
      }
    }
  '
}

# ── Detection regex ─────────────────────────────────────────────
# Word-boundary lookarounds via `(^|[^A-Za-z0-9_])...([^A-Za-z0-9_]|$)` —
# avoids reliance on GNU-only `\<\>` (BSD grep / macOS compatibility).
# Case-insensitive (`grep -i`) — Postgres SQL keywords are case-insensitive.
DESTRUCTIVE_REGEX='(^|[^A-Za-z0-9_])(DROP[[:space:]]+(COLUMN|TABLE)|RENAME[[:space:]]+(COLUMN|TO)|TRUNCATE([[:space:]]+TABLE)?)([^A-Za-z0-9_]|$)'

# ── Scan loop ────────────────────────────────────────────────────
Failed=0
scanned=0
violation_count=0
for f in "${EXISTING[@]}"; do
  scanned=$((scanned + 1))
  matches=$(strip_comments < "$f" | grep -niE "$DESTRUCTIVE_REGEX" || true)
  if [ -n "$matches" ]; then
    while IFS= read -r m; do
      lineno="${m%%:*}"
      content="${m#*:}"
      # Single annotation per match: file + line + offending line shown
      # in the message body. GitHub collapses identical-file annotations
      # into a single review annotation per line.
      echo "::error file=$f,line=$lineno::Destructive SQL: $content"
      violation_count=$((violation_count + 1))
    done <<< "$matches"
    Failed=1
  fi
done

if [ "$Failed" = "1" ]; then
  echo "::error::Destructive migration keywords ($violation_count occurrence(s) across $scanned file(s))."
  echo "::error::Forbidden until v2 per ADR 001: docs/architecture/001-db-migrations.md"
  echo "::error::If you have an RFC-approved exception, record it in the ADR 'Exceptions log' section before merging."
  exit 1
fi

echo "✓ Schema migration safety: $scanned file(s) scanned, no destructive keywords."
