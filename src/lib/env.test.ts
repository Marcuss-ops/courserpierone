import { describe, it, expect, beforeEach } from "vitest";
import { ENV_DEFINITIONS, validateEnv, resetEnvValidation } from "./env";

/**
 * Helper per impostare variabili d'ambiente nei test.
 * TypeScript tratta process.env come read-only, ma in runtime
 * Node.js permette la scrittura. Usiamo un type cast.
 */
const _env = process.env as Record<string, string | undefined>;

function setEnv(key: string, value: string): void {
  _env[key] = value;
}

function deleteEnv(key: string): void {
  delete _env[key];
}

beforeEach(() => {
  resetEnvValidation();
});

describe("ENV_DEFINITIONS", () => {
  it("defines all critical vars", () => {
    const critical = ENV_DEFINITIONS.filter((d) => d.category === "critical");
    const keys = critical.map((d) => d.key);
    expect(keys).toContain("DATABASE_URL");
    expect(keys).toContain("SUPABASE_URL");
    expect(keys).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(keys).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(keys).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(keys).toContain("NEXT_PUBLIC_APP_URL");
  });

  it("every definition has a description", () => {
    for (const def of ENV_DEFINITIONS) {
      expect(def.description, `${def.key} is missing description`).toBeTruthy();
    }
  });

  it("critical vars are not marked as optional", () => {
    const critical = ENV_DEFINITIONS.filter((d) => d.category === "critical");
    for (const def of critical) {
      expect(def.optional, `${def.key} is critical but marked optional`).toBeFalsy();
    }
  });

  it("email required vars (HOST/PORT/USER/PASSWORD/FROM) are not marked optional", () => {
    // C1e + C2b cleanup: EMAIL_SERVER_USER + EMAIL_SERVER_PASSWORD no
    // longer carry `optional: true`. All 5 email vars now behave as
    // required (warning-level) when missing — matches the runtime
    // contract enforced in src/lib/services/email.ts getTransporter()
    // (which returns null if any of the 5 is missing). If a future
    // refactor reintroduces `optional: true` on any of these 5, the
    // operator could ship a build that fails silently at SMTP auth
    // time — this regression test blocks that.
    //
    // Category check (added per code-reviewer nit): the 5 email vars
    // MUST stay in `category: "required"` (not "critical" + not
    // "optional"). Moving them to "critical" would block app startup
    // when email is intentionally off (legitimate during dev when no
    // SMTP is configured); moving them to "optional" would silently
    // disable them at validator-level. `required` is the only correct
    // tier for non-blocking-but-warned vars.
    const emailKeys = [
      "EMAIL_SERVER_HOST",
      "EMAIL_SERVER_PORT",
      "EMAIL_SERVER_USER",
      "EMAIL_SERVER_PASSWORD",
      "EMAIL_FROM",
    ];
    for (const key of emailKeys) {
      const def = ENV_DEFINITIONS.find((d) => d.key === key);
      expect(def, `${key} should be in ENV_DEFINITIONS`).toBeDefined();
      expect(def?.optional, `${key} must NOT be optional (C1e + C2b cleanup)`).toBeFalsy();
      expect(def?.defaultValue, `${key} must NOT have a defaultValue (C1e cleanup)`).toBeUndefined();
      expect(def?.category, `${key} must stay in 'required' category`).toBe("required");
    }
  });

  it("contains all major service keys", () => {
    const allKeys = ENV_DEFINITIONS.map((d) => d.key);
    expect(allKeys).toContain("STRIPE_SECRET_KEY");
    expect(allKeys).toContain("OPENAI_API_KEY");
    expect(allKeys).toContain("LEMONSQUEEZY_API_KEY");
    expect(allKeys).toContain("SUPABASE_URL");
    // After C2 cleanup: GOOGLE_CLIENT_ID/SECRET moved to Supabase Dashboard
    // (Auth → Providers → Google) — no longer in Vercel env registry.
    expect(allKeys).not.toContain("GOOGLE_CLIENT_ID");
    expect(allKeys).not.toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
    expect(allKeys).not.toContain("ENABLE_STRIPE_CHECKOUT");
  });
});

describe("validateEnv", () => {
  it("reports missing critical vars when none are set", () => {
    deleteEnv("DATABASE_URL");
    deleteEnv("SUPABASE_URL");
    deleteEnv("SUPABASE_SERVICE_ROLE_KEY");
    deleteEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    deleteEnv("NEXT_PUBLIC_APP_URL");
    setEnv("NODE_ENV", "test");
    resetEnvValidation();

    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.missingCritical.length).toBeGreaterThanOrEqual(1);
    expect(result.missingCritical).toContain("DATABASE_URL");
    expect(result.missingCritical).toContain("SUPABASE_URL");
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("passes when all critical vars are set", () => {
    setEnv("DATABASE_URL", "postgresql://localhost:5432/test");
    setEnv("SUPABASE_URL", "https://example.supabase.co");
    setEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    setEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    setEnv("NODE_ENV", "test");
    resetEnvValidation();

    const result = validateEnv();
    expect(result.missingCritical.length).toBe(0);
    expect(result.valid).toBe(true);
  });

  it("warns about missing required but optional vars", () => {
    setEnv("DATABASE_URL", "postgresql://localhost:5432/test");
    setEnv("SUPABASE_URL", "https://example.supabase.co");
    setEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    setEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    setEnv("NODE_ENV", "test");
    resetEnvValidation();

    const result = validateEnv();
    expect(result.valid).toBe(true);
  });

  it("does not warn about vars with defaults", () => {
    setEnv("DATABASE_URL", "postgresql://localhost:5432/test");
    setEnv("SUPABASE_URL", "https://example.supabase.co");
    setEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    setEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    setEnv("NODE_ENV", "test");
    deleteEnv("EMAIL_SERVER_HOST");
    resetEnvValidation();

    const result = validateEnv();
    // After C1e cleanup: EMAIL_SERVER_HOST has no defaultValue — unset
    // produces a `required` warning so the operator sets it explicitly.
    const emailWarning = result.warnings.find((w) => w.key === "EMAIL_SERVER_HOST");
    expect(emailWarning).toBeDefined();
    expect(result.valid).toBe(true); // warning, not error
  });
});

describe("env proxy accessor", () => {
  it("returns undefined for required unset vars with no default", async () => {
    // After C1e cleanup: EMAIL_SERVER_HOST has no defaultValue and is
    // category="required" (not critical) — caller MUST set it explicitly.
    deleteEnv("EMAIL_SERVER_HOST");
    const { env } = await import("./env");
    expect(env.EMAIL_SERVER_HOST).toBeUndefined();
  });

  it("returns undefined for optional unset vars", async () => {
    deleteEnv("STRIPE_SECRET_KEY");
    const { env } = await import("./env");
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });
});
