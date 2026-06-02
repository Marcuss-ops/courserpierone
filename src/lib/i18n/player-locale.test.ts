import { describe, it, expect } from "vitest";
import { t, playerLocale } from "./player-locale";

// ─── playerLocale data ──────────────────────────────────────
describe("playerLocale", () => {
  it("has IT translations", () => {
    expect(playerLocale["it"]).toBeDefined();
    expect(playerLocale["it"]["preview"]).toBe("Anteprima");
    expect(playerLocale["it"]["buyNow"]).toBe("Acquista Ora");
  });

  it("has EN translations", () => {
    expect(playerLocale["en"]).toBeDefined();
    expect(playerLocale["en"]["preview"]).toBe("Preview");
    expect(playerLocale["en"]["buyNow"]).toBe("Buy Now");
  });

  it("has ES translations", () => {
    expect(playerLocale["es"]).toBeDefined();
    expect(playerLocale["es"]["preview"]).toBe("Vista Previa");
    expect(playerLocale["es"]["buyNow"]).toBe("Comprar Ahora");
  });

  it("IT translations contain template placeholder {minutes}", () => {
    expect(playerLocale["it"]["previewDesc"]).toContain("{minutes}");
    expect(playerLocale["it"]["previewDesc"]).toContain("{title}");
  });

  it("EN translations contain template placeholder {minutes}", () => {
    expect(playerLocale["en"]["previewDesc"]).toContain("{minutes}");
    expect(playerLocale["en"]["previewDesc"]).toContain("{title}");
  });

  it("has all expected keys in each locale", () => {
    const expectedKeys = [
      "preview", "previewEnded", "previewDesc",
      "buyNow", "alreadyBought", "secureTransaction",
      "markComplete", "completed", "loginToComplete",
      "notes", "notesPlaceholder", "saveNotes", "notesSaved",
      "resources", "noResources", "download",
      "continueLearning", "continueSubtitle",
      "certificateReady", "certificateDesc", "downloadCertificate",
      "lessonLabel", "inProgress", "backToLanding",
      "lessons", "module", "watched",
    ];
    for (const key of expectedKeys) {
      expect(playerLocale["it"][key], `IT missing: ${key}`).toBeDefined();
      expect(playerLocale["en"][key], `EN missing: ${key}`).toBeDefined();
    }
  });
});

// ─── t() function ───────────────────────────────────────────
describe("t — translation function", () => {
  it("returns translation for existing key in IT", () => {
    expect(t("it", "preview")).toBe("Anteprima");
  });

  it("returns translation for existing key in EN", () => {
    expect(t("en", "preview")).toBe("Preview");
  });

  it("returns translation for existing key in ES", () => {
    expect(t("es", "preview")).toBe("Vista Previa");
  });

  it("returns fallback to IT for missing locale", () => {
    // Italian is the fallback in playerLocale
    expect(t("xx", "preview")).toBe("Anteprima");
  });

  it("returns key itself when key is missing in all locales", () => {
    expect(t("en", "nonexistent_key")).toBe("nonexistent_key");
  });

  it("returns key itself when locale is xx and key is missing", () => {
    expect(t("xx", "missing_key")).toBe("missing_key");
  });

  it("replaces {minutes} placeholder correctly", () => {
    const result = t("it", "previewDesc", { minutes: "10", title: "Corso Test" });
    expect(result).toContain("10");
    expect(result).toContain("Corso Test");
  });

  it("replaces {title} placeholder in EN", () => {
    const result = t("en", "previewDesc", { minutes: "5", title: "Test Course" });
    expect(result).toContain("5");
    expect(result).toContain("Test Course");
  });

  it("keeps unresolved placeholders when params missing", () => {
    const result = t("it", "previewDesc", {});
    expect(result).toContain("{minutes}");
    expect(result).toContain("{title}");
  });

  it("handles params with numbers", () => {
    const result = t("it", "previewDesc", { minutes: 15, title: "Corso" });
    // Numbers get String()'d
    expect(result).toContain("15");
  });

  it("returns fallback key for empty locale string", () => {
    expect(t("", "preview")).toBe("Anteprima");
  });

  it("returns key for empty key string but valid locale", () => {
    expect(t("en", "")).toBe("");
  });
});