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
    expect(keys).toContain("NEXTAUTH_SECRET");
    expect(keys).toContain("NEXTAUTH_URL");
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

  it("contains all major service keys", () => {
    const allKeys = ENV_DEFINITIONS.map((d) => d.key);
    expect(allKeys).toContain("STRIPE_SECRET_KEY");
    expect(allKeys).toContain("GOOGLE_CLIENT_ID");
    expect(allKeys).toContain("OPENAI_API_KEY");
    expect(allKeys).toContain("LEMONSQUEEZY_API_KEY");
    expect(allKeys).toContain("SUPABASE_URL");
  });
});

describe("validateEnv", () => {
  it("reports missing critical vars when none are set", () => {
    deleteEnv("DATABASE_URL");
    deleteEnv("NEXTAUTH_SECRET");
    deleteEnv("NEXTAUTH_URL");
    deleteEnv("NEXT_PUBLIC_APP_URL");
    setEnv("NODE_ENV", "test");
    resetEnvValidation();

    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.missingCritical.length).toBeGreaterThanOrEqual(1);
    expect(result.missingCritical).toContain("DATABASE_URL");
    expect(result.missingCritical).toContain("NEXTAUTH_SECRET");
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("passes when all critical vars are set", () => {
    setEnv("DATABASE_URL", "postgresql://localhost:5432/test");
    setEnv("NEXTAUTH_SECRET", "super-secret-key-1234567890");
    setEnv("NODE_ENV", "test");
    resetEnvValidation();

    const result = validateEnv();
    // NEXTAUTH_URL e NEXT_PUBLIC_APP_URL hanno defaultValue → ok anche se non impostate
    expect(result.missingCritical.length).toBe(0);
    expect(result.valid).toBe(true);
  });

  it("warns about missing required but optional vars", () => {
    setEnv("DATABASE_URL", "postgresql://localhost:5432/test");
    setEnv("NEXTAUTH_SECRET", "super-secret-key-1234567890");
    setEnv("NODE_ENV", "test");
    resetEnvValidation();

    const result = validateEnv();
    // Tutte le required hanno il flag optional=true → nessun errore
    expect(result.valid).toBe(true);
  });

  it("does not warn about vars with defaults", () => {
    setEnv("DATABASE_URL", "postgresql://localhost:5432/test");
    setEnv("NEXTAUTH_SECRET", "super-secret-key-1234567890");
    setEnv("NODE_ENV", "test");
    // Assicuriamoci che EMAIL_SERVER_HOST non sia presente
    deleteEnv("EMAIL_SERVER_HOST");
    resetEnvValidation();

    const result = validateEnv();
    // EMAIL_SERVER_HOST ha defaultValue "smtp.gmail.com" → nessun warning
    const emailWarning = result.warnings.find((w) => w.key === "EMAIL_SERVER_HOST");
    expect(emailWarning).toBeUndefined();
  });
});

describe("env proxy accessor", () => {
  it("returns default for unset vars with default values", async () => {
    // Assicuriamoci che EMAIL_SERVER_HOST non sia impostato
    deleteEnv("EMAIL_SERVER_HOST");
    const { env } = await import("./env");
    expect(env.EMAIL_SERVER_HOST).toBe("smtp.gmail.com");
  });

  it("returns undefined for optional unset vars", async () => {
    deleteEnv("STRIPE_SECRET_KEY");
    const { env } = await import("./env");
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });
});
