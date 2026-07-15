/**
 * Environment Variable Validation & Type-safe Accessor
 *
 * Centralizza la definizione e validazione di tutte le variabili d'ambiente.
 * Il check viene eseguito all'import del modulo (server-side).
 *
 * Uso:
 *   import { env } from "@/lib/env";
 *   const dbUrl = env.DATABASE_URL;        // string (required)
 *
 * Categorie di validazione:
 *   - critical: l'app non può funzionare senza
 *   - required: necessario per feature specifica
 *   - optional: ha un default o è opzionale
 */

// ─── Definizione degli schemi ──────────────────────────────
export interface EnvVarDef {
  key: string;
  category: "critical" | "required" | "optional" | "auto";
  description: string;
  defaultValue?: string;
  /** Feature disabilitabile (es. Supabase, OpenAI) */
  optional?: boolean;
}

export const ENV_DEFINITIONS: EnvVarDef[] = [
  // ═══ Critical — l'app non parte senza ═══
  {
    key: "DATABASE_URL",
    category: "critical",
    description: "PostgreSQL connection string per Prisma (pooled, pgBouncer port 6543 per serverless)",
  },
  {
    key: "DIRECT_URL",
    category: "optional",
    description: "PostgreSQL direct connection per Prisma migrations (non-pooled, port 5432). Opzionale — se non impostato, Prisma usa DATABASE_URL anche per le migrations.",
  },
  {
    key: "SUPABASE_URL",
    category: "critical",
    description: "Supabase project URL (per storage e auth)",
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    category: "critical",
    description: "Supabase service role key",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_URL",
    category: "critical",
    description: "Supabase project URL (public, per client auth)",
  },
  {
    key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    category: "critical",
    description: "Supabase anon key (public, per client auth)",
  },
  {
    key: "NEXT_PUBLIC_APP_URL",
    category: "critical",
    description: "URL pubblico (usato per redirect, email)",
    defaultValue: "http://localhost:3000",
  },

  // ═══ Required — necessarie per feature specifiche ═══
  // Google OAuth credentials live in Supabase Dashboard → Authentication →
  // Providers → Google (not in this Vercel env registry).
  {
    key: "EMAIL_SERVER_HOST",
    category: "required",
    description: "SMTP host per invio email (conferme acquisto). Required — set explicitly (e.g. smtp.resend.com).",
  },
  {
    key: "EMAIL_SERVER_PORT",
    category: "required",
    description: "SMTP port. Required — set explicitly (e.g. 2525 for Resend on Vercel egress).",
  },
  {
    key: "EMAIL_SERVER_USER",
    category: "required",
    description: "SMTP username. Required — set explicitly (e.g. `resend` per Resend, full email address per Gmail SMTP with App Password).",
  },
  {
    key: "EMAIL_SERVER_PASSWORD",
    category: "required",
    description: "SMTP password o App Password. Required — set explicitly (non master password; Gmail requires an App Password, Resend/SendGrid/Mailgun pass the provider API key).",
  },
  {
    key: "EMAIL_FROM",
    category: "required",
    description: "Mittente delle email. Required — set explicitly (e.g. 'Courssy <no-reply@courssy.com>').",
  },
  {
    key: "USE_ACCESS_GRANT_RESOLVER",
    category: "optional",
    description:
      "Feature flag (PR 3 of MCR) — se 'true', resolve-message-permission legge da AccessGrant.active invece di Order.status='completed'. Default 'false': Order.status resta l'autorità finché la rollout non è completa. Cadence di flip: 1d zero denies in staging → 7d monitoring in staging → flip prod → monitor 7d → rimuovere il legacy read.",
    defaultValue: "false",
    optional: true,
  },
  {
    key: "LEMONSQUEEZY_API_KEY",
    category: "required",
    description: "Lemon Squeezy API key",
    optional: true,
  },
  {
    key: "LEMONSQUEEZY_STORE_ID",
    category: "required",
    description: "Lemon Squeezy Store ID",
    optional: true,
  },
  {
    key: "LEMONSQUEEZY_WEBHOOK_SECRET",
    category: "required",
    description: "Lemon Squeezy webhook secret",
    optional: true,
  },
  {
    key: "OPENAI_API_KEY",
    category: "required",
    description: "OpenAI API key (per traduzioni automatiche)",
    optional: true,
  },
  {
    key: "CRON_SECRET",
    category: "required",
    description: "Secret per proteggere gli endpoint cron",
    optional: true,
  },
  {
    key: "ALERT_WEBHOOK_URL",
    category: "optional",
    description: "Webhook URL (Slack/Discord) per alert errori di produzione",
    optional: true,
  },

  // ═══ Optional — hanno default o non bloccanti ═══
  {
    key: "NODE_ENV",
    category: "optional",
    description: "Ambiente (development | production | test)",
    defaultValue: "development",
  },
];

// ─── Validazione eseguita all'import ───────────────────────

interface ValidationResult {
  valid: boolean;
  errors: { key: string; message: string }[];
  warnings: { key: string; message: string }[];
  missingCritical: string[];
  missingRequired: string[];
}

let _cachedResult: ValidationResult | null = null;

/**
 * Resetta la cache di validazione (utile nei test).
 */
export function resetEnvValidation(): void {
  _cachedResult = null;
}

/**
 * Valida TUTTE le variabili d'ambiente definite.
 * Viene chiamata automaticamente all'import del modulo.
 * Può essere richiamata manualmente per refresh.
 *
 * NOTA: non blocca l'esecuzione in produzione per variabili
 * opzionali — logga warning invece di crashare.
 */
export function validateEnv(): ValidationResult {
  // In ambiente test, resetta sempre la cache per test isolati
  if (process.env.VITEST === "true") {
    _cachedResult = null;
  }
  if (_cachedResult) return _cachedResult;

  const errors: { key: string; message: string }[] = [];
  const warnings: { key: string; message: string }[] = [];
  const missingCritical: string[] = [];
  const missingRequired: string[] = [];

  for (const def of ENV_DEFINITIONS) {
    const value = process.env[def.key] ?? "";

    // Se il valore è impostato, va bene
    if (value.length > 0) continue;
    // Se c'è un default di fallback, va bene
    if (def.defaultValue) continue;

    // Valore mancante e senza default — segnala
    if (def.category === "critical") {
      missingCritical.push(def.key);
      errors.push({
        key: def.key,
        message: `[CRITICAL] ${def.key} non impostata! ${def.description}.\n    Aggiungila in .env o imposta la var d'ambiente.`,
      });
    } else if (!def.optional) {
      missingRequired.push(def.key);
      warnings.push({
        key: def.key,
        message: `[REQUIRED] ${def.key} non impostata. ${def.description}.\n    La feature corrispondente potrebbe non funzionare.`,
      });
    }
  }

  _cachedResult = {
    valid: missingCritical.length === 0,
    errors,
    warnings,
    missingCritical,
    missingRequired,
  };

  return _cachedResult;
}

// ═══ Type-safe Env Accessor ═════════════════════════════════

/**
 * Type-safe accessor alle variabili d'ambiente.
 *
 * Esempi:
 *   env.DATABASE_URL            → string (crasha se mancante in produzione)
 *   env.NEXT_PUBLIC_APP_URL     → string con default
 *   env.EMAIL_SERVER_HOST       → string (required; nessun default — C1e cleanup)
 *   env.EMAIL_SERVER_USER       → string (required; nessun default — C2b cleanup)
 *   env.EMAIL_SERVER_PASSWORD   → string (required; nessun default — C2b cleanup)
 *   env.EMAIL_FROM              → string (required; nessun default — C1e cleanup)
 */
const _envTarget: Record<string, string | undefined> = {};

export const env = new Proxy(
  _envTarget,
  {
    get(_target, prop: string) {
      const def = ENV_DEFINITIONS.find((d) => d.key === prop);
      const value = process.env[prop];

      if (value && value.length > 0) return value;
      if (def?.defaultValue) return def.defaultValue;
      if (def?.optional) return undefined;

      // Critical o required non presenti
      if (def?.category === "critical") {
        if (process.env.NODE_ENV === "production") {
          throw new Error(
            `[env] Variabile critica "${prop}" non impostata! ` +
              `${def.description}. Aggiungila nelle variabili d'ambiente.`
          );
        }
        console.warn(`[env] ⚠️  "${prop}" non impostata. ${def.description}`);
      }
      return undefined;
    },
  }
);

// ─── Utility: formato leggibile ────────────────────────────

function formatEnvStatus(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════════");
  lines.push("  ENVIRONMENT VARIABLES STATUS");
  lines.push("═══════════════════════════════════════════");

  if (result.valid && result.warnings.length === 0) {
    lines.push("  ✅ All critical and required variables set.");
  }

  for (const err of result.errors) {
    lines.push(`  ${err.message}`);
  }

  for (const warn of result.warnings) {
    lines.push(`  ${warn.message}`);
  }

  if (result.valid) {
    lines.push("═══════════════════════════════════════════");
    lines.push("  ✅ System check passed.");
  } else {
    lines.push("═══════════════════════════════════════════");
    lines.push(`  ❌ ${result.missingCritical.length} critical vars missing — app may not work correctly.`);
    if (result.missingRequired.length > 0) {
      lines.push(`  ⚠️  ${result.missingRequired.length} required vars missing — some features disabled.`);
    }
  }

  return lines.join("\n");
}

// ═══ Esegui validazione all'import ═══════════════════════
// Questo blocco viene eseguito quando il modulo viene importato.
// In produzione, logga solo se ci sono problemi.
const _initialResult = validateEnv();
if (!_initialResult.valid || _initialResult.warnings.length > 0) {
  const isBuild =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NODE_ENV === "test";
  if (!isBuild) {
    console.log(formatEnvStatus(_initialResult));
  }
}
