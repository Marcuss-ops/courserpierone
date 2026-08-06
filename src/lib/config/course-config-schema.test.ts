import { describe, expect, it } from "vitest";
import { courseConfigSchema, parseCourseConfig } from "./course-config-schema";

const validConfig = {
  slug: "bundled-course",
  productId: "product-1",
  template: "lumio",
  defaultLanguage: "it",
  cover: "/cover.jpg",
  checkoutUrl: "#checkout",
  author: "Courssy",
  languages: {
    it: {
      title: "Corso",
      problem: "Problema",
      story: "Storia",
      cta: "Inizia",
      description: "Descrizione",
      ebookTitle: "Ebook",
      ebookContent: "Contenuto",
      seo: { title: "Corso", description: "Descrizione" },
    },
  },
  lessons: [
    {
      number: 1,
      id: "lesson-1",
      titles: { it: "Lezione" },
      descriptions: { it: "Descrizione" },
      videos: { it: "" },
      duration: "15:00",
    },
  ],
  ebookChapters: [{ page: 1, it: "Introduzione" }],
};

describe("courseConfigSchema", () => {
  it("parses the canonical config.json shape", () => {
    expect(parseCourseConfig(validConfig)).toMatchObject(validConfig);
  });

  it("rejects a config without required runtime fields", () => {
    const result = courseConfigSchema.safeParse({ ...validConfig, author: undefined });
    expect(result.success).toBe(false);
  });

  it("rejects invalid template identifiers", () => {
    const result = courseConfigSchema.safeParse({ ...validConfig, template: "unknown" });
    expect(result.success).toBe(false);
  });
});
