import fs from "fs";
import path from "path";

export interface EbookBook {
  code: string;
  label: string;
  fileName: string;
}

const BOOK_LABELS: Record<string, string> = {
  it: "Italiano",
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  "de-1": "Deutsch (Alt)",
  pt: "Português",
  pl: "Polski",
  ru: "Русский",
  tr: "Türkçe",
  id: "Bahasa Indonesia",
};

const PREFERRED_ORDER = [
  "it",
  "en",
  "es",
  "fr",
  "de",
  "de-1",
  "pt",
  "pl",
  "ru",
  "tr",
  "id",
];

function labelFor(code: string): string {
  return BOOK_LABELS[code] ?? code.toUpperCase();
}

function sortBooks(a: EbookBook, b: EbookBook): number {
  const aIndex = PREFERRED_ORDER.indexOf(a.code);
  const bIndex = PREFERRED_ORDER.indexOf(b.code);
  if (aIndex !== -1 || bIndex !== -1) {
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  }
  return a.label.localeCompare(b.label);
}

export function getAvailableEbookBooks(slug: string): EbookBook[] {
  const dir = path.join(process.cwd(), "public", "courses", slug);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((file) => file.toLowerCase().endsWith(".pdf"))
    .map((file) => {
      const code = file.replace(/\.pdf$/i, "");
      return {
        code,
        label: labelFor(code),
        fileName: file,
      };
    })
    .sort(sortBooks);
}
