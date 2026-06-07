/**
 * Environment Variable Validation & Type-safe Accessor
 *
 * Centralizza la definizione e validazione di tutte le variabili d'ambiente.
 * Il check viene eseguito all'import del modulo (server-side).
 *
 * Uso:
 *   import { env } from "@/lib/env";
 *   const dbUrl = env.DATABASE_URL;        // string (required)
 *   const stripeKey = env.STRIPE_SECRET_KEY; // string | undefined (optional)
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
    description: "PostgreSQL connection string per Prisma",
  },
  {
    key: "NEXTAUTH_SECRET",
    category: "critical",
    description: "Secret per crittografia sessioni NextAuth — genera con: openssl rand -base64 32",
  },
  {
    key: "NEXTAUTH_URL",
    category: "critical",
    description: "URL base dell'app (usato per callback OAuth e magic link)",
    defaultValue: "http://localhost:3000",
  },
  {
    key: "NEXT_PUBLIC_APP_URL",
    category: "critical",
    description: "URL pubblico (usato per redirect, email, magic link)",
    defaultValue: "http://localhost:3000",
  },

  // ═══ Required — necessarie per feature specifiche ═══
  {
    key: "GOOGLE_CLIENT_ID",
    category: "required",
    description: "Google OAuth Client ID",
    optional: true,
  },
  {
    key: "GOOGLE_CLIENT_SECRET",
    category: "required",
    description: "Google OAuth Client Secret",
    optional: true,
  },
  {
    key: "EMAIL_SERVER_HOST",
    category: "required",
    description: "SMTP host per invio email (magic link, conferme acquisto)",
    defaultValue: "smtp.gmail.com",
  },
  {
    key: "EMAIL_SERVER_PORT",
    category: "required",
    description: "SMTP port",
    defaultValue: "587",
  },
  {
    key: "EMAIL_SERVER_USER",
    category: "required",
    description: "SMTP username",
    optional: true,
  },
  {
    key: "EMAIL_SERVER_PASSWORD",
    category: "required",
    description: "SMTP password o App Password",
    optional: true,
  },
  {
    key: "EMAIL_FROM",
    category: "required",
    description: "Mittente delle email",
    defaultValue: "noreply@courser.app",
  },
  {
    key: "STRIPE_SECRET_KEY",
    category: "required",
    description: "Stripe secret key (sk_test_... o sk_live_...)",
    optional: true,
  },
  {
    key: "STRIPE_WEBHOOK_SECRET",
    category: "required",
    description: "Stripe webhook signing secret (whsec_...)",
    optional: true,
  },
  {
    key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    category: "required",
    description: "Stripe publishable key (pk_test_... o pk_live_...)",
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
    key: "SUPABASE_URL",
    category: "required",
    description: "Supabase project URL (per storage immagini)",
    optional: true,
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    category: "required",
    description: "Supabase service role key",
    optional: true,
  },
  {
    key: "CRON_SECRET",
    category: "required",
    description: "Secret per proteggere gli endpoint cron",
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

type ValidationResult = {
  valid: boolean;
  errors: { key: string; message: string }[];
  warnings: { key: string; message: string }[];
  missingCritical: string[];
  missingRequired: string[];
};

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
 *   env.STRIPE_SECRET_KEY       → string | undefined
 *   env.NEXT_PUBLIC_APP_URL     → string con default
 *   env.EMAIL_SERVER_HOST       → string con default "smtp.gmail.com"
 */
export const env = new Proxy(
  {} as Record<string, string | undefined>,
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

export function formatEnvStatus(result: ValidationResult): string {
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

/**
 * Stampa lo stato delle env vars su console.
 * Da chiamare all'avvio dell'app per debug.
 */
export function printEnvStatus(): void {
  const result = validateEnv();
  console.log(formatEnvStatus(result));
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
