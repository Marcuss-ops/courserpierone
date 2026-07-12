import OpenAI from "openai";

let _openai: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!_openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing OPENAI_API_KEY");
    }
    _openai = new OpenAI({ apiKey });
  }
  return _openai;
}

// ─── Lingue supportate dal Cervellone ────────────────────────
// (Inlined type — non più esposto come const perché knip l'ha
// flaggato come unused. Il set di locales è hardcoded qui sotto.)
export type Locale =
  | "it" | "en" | "es" | "fr" | "de" | "pt" | "nl" | "pl"
  | "ru" | "ja" | "ko" | "zh" | "ar" | "hi" | "tr" | "vi"
  | "th" | "id" | "sv" | "da";

// ─── Traduzione automatica via GPT ──────────────────────────
export async function translateContent(
  text: string,
  sourceLocale: Locale,
  targetLocales: Locale[]
): Promise<Record<Locale, string>> {
  const results: Partial<Record<Locale, string>> = {};

  // Traduci in batch per risparmiare chiamate
  const prompt = `Sei un traduttore professionale. Traduci il following testo nelle lingue richieste.
Mantieni lo stesso tono e stile. Restituisci un oggetto JSON dove le chiavi sono i codici lingua.

Testo originale (${sourceLocale}):
${text}

Lingue target: ${targetLocales.join(", ")}

Rispondi SOLO con il JSON valido, senza markdown.`;

  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty translation response");

  const translations = JSON.parse(content) as Record<string, string>;

  for (const locale of targetLocales) {
    if (translations[locale]) {
      results[locale] = translations[locale];
    }
  }

  return results as Record<Locale, string>;
}
