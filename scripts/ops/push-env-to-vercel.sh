#!/usr/bin/env bash
# =============================================================================
# scripts/ops/push-env-to-vercel.sh
# =============================================================================
# Pusha TUTTE le env var da .env a Vercel Production via CLI.
# Idempotente: se una var esiste già con stesso valore, skip.
# Se esiste con valore diverso → aggiorna (env rm + env add).
#
# Uso:
#   ./scripts/ops/push-env-to-vercel.sh              # push effettivo
#   ./scripts/ops/push-env-to-vercel.sh --dry-run    # mostra cosa farebbe
#   ./scripts/ops/push-env-to-vercel.sh --verify     # mostra solo env esistenti su Vercel
#
# Prereq:
#   - .env presente nella root del progetto
#   - Vercel CLI loggato (npx vercel login) OPPURE VERCEL_TOKEN env var
# =============================================================================

set -euo pipefail

DRY_RUN=false
VERIFY_ONLY=false
for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --verify) VERIFY_ONLY=true ;;
    *) echo "Unknown arg: $arg"; exit 1 ;;
  esac
done

# ── 1. Carica .env ──────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "❌ .env non trovato nella root del progetto"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

# ── 2. Lista env var da pushare ─────────────────────────────────
# Ogni riga: "VAR_NAME|comment"
VARS=(
  "DATABASE_URL|Supabase DB pooled (port 6543)"
  "DIRECT_URL|Supabase DB direct (port 5432)"
  "SUPABASE_URL|Supabase project URL (server)"
  "NEXT_PUBLIC_SUPABASE_URL|Supabase project URL (browser)"
  "NEXT_PUBLIC_SUPABASE_ANON_KEY|Supabase anon JWT (browser-safe)"
  "SUPABASE_SERVICE_ROLE_KEY|Supabase service role JWT (server-only, full privilege)"
  "NEXT_PUBLIC_APP_URL|Dominio produzione (https://www.courssy.com)"
  "CRON_SECRET|Secret per /api/cron/* e /api/diagnose-oauth"
  "LOG_ERROR_SECRET|Secret per error sink server-side"
  "NEXT_PUBLIC_LOG_ERROR_SECRET|Same as LOG_ERROR_SECRET (client-visible OK)"
  "WS_SECRET|Secret per WebSocket auth (manca in .env.example!)"
  "LEMONSQUEEZY_API_KEY|Lemon Squeezy Live API key"
  "LEMONSQUEEZY_STORE_ID|Lemon Squeezy Live Store ID"
  "LEMONSQUEEZY_WEBHOOK_SECRET|Lemon Squeezy webhook signing secret"
  "EMAIL_SERVER_HOST|Resend SMTP host (smtp.resend.com)"
  "EMAIL_SERVER_PORT|Resend SMTP port (587 — or 2525 if blocked)"
  "EMAIL_SERVER_USER|Resend SMTP user (resend)"
  "EMAIL_SERVER_PASSWORD|Resend SMTP password (= API key)"
  "EMAIL_FROM|Courssy <no-reply@your-domain.com>"
  # GOOGLE_CLIENT_ID/SECRET removed in C2 cleanup — they live in Supabase
  # Dashboard → Authentication → Providers → Google, NOT in this Vercel
  # env registry.
  "KV_REST_API_URL|Upstash Redis REST URL"
  "KV_REST_API_TOKEN|Upstash Redis REST Token"
  "REDIS_URL|Upstash Redis ioredis TCP (fallback)"
)

# ── 3. Verifica-only mode ───────────────────────────────────────
if [ "$VERIFY_ONLY" = true ]; then
  echo "🔍 Env var su Vercel Production:"
  echo "================================"
  npx vercel env ls 2>&1 | sed -n '/Production/,$p' | head -60
  exit 0
fi

# ── 4. Push loop ────────────────────────────────────────────────
echo "🚀 Push di ${#VARS[@]} env var a Vercel Production"
echo "================================================"
if [ "$DRY_RUN" = true ]; then
  echo "(DRY RUN — nessuna modifica)"
fi
echo

ADDED=0
SKIPPED=0
UPDATED=0
FAILED=0

for entry in "${VARS[@]}"; do
  IFS='|' read -r name comment <<< "$entry"
  value="${!name:-}"

  if [ -z "$value" ]; then
    printf "  ⏭  %-32s (empty in .env, skipped)\n" "$name"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  if [ "$DRY_RUN" = true ]; then
    printf "  [DRY] %-32s = %s\n" "$name" "${value:0:40}..."
    continue
  fi

  # Prova ad aggiungere (Vercel CLI restituisce errore se esiste già)
  if echo "$value" | npx vercel env add "$name" production >/dev/null 2>&1; then
    printf "  ✅ %-32s added\n" "$name"
    ADDED=$((ADDED + 1))
  else
    # Esiste già → prova a rimuovere + ri-aggiungere (update)
    if npx vercel env rm "$name" production -y >/dev/null 2>&1; then
      if echo "$value" | npx vercel env add "$name" production >/dev/null 2>&1; then
        printf "  🔄 %-32s updated\n" "$name"
        UPDATED=$((UPDATED + 1))
      else
        printf "  ❌ %-32s FAILED (re-add)\n" "$name"
        FAILED=$((FAILED + 1))
      fi
    else
      printf "  ❌ %-32s FAILED (rm)\n" "$name"
      FAILED=$((FAILED + 1))
    fi
  fi
done

# ── 5. Summary ──────────────────────────────────────────────────
echo
echo "================================================"
if [ "$DRY_RUN" = true ]; then
  echo "DRY RUN finito. Rimuovi --dry-run per pushare davvero."
else
  echo "Riepilogo:"
  echo "  ✅ Aggiunte nuove: $ADDED"
  echo "  🔄 Aggiornate:     $UPDATED"
  echo "  ⏭  Skip (vuote):  $SKIPPED"
  echo "  ❌ Fallite:        $FAILED"
  echo
  if [ $FAILED -gt 0 ]; then
    echo "⚠️  Alcune env var non sono state pushate. Controlla:"
    echo "  - .env è completo e valido?"
    echo "  - npx vercel login è stato fatto?"
    echo "  - VERCEL_TOKEN è settato? (per auth non-interattiva)"
    exit 1
  fi
  echo "✅ Tutte le env var sono ora su Vercel Production"
  echo
  echo "Prossimi step:"
  echo "  npx vercel env ls              # verifica"
  echo "  npx vercel --prod              # redeploy"
  echo "  curl -sS https://www.courssy.com/api/health | jq   # smoke test"
fi
