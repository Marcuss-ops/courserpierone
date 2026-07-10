import { NextRequest, NextResponse } from "next/server";
import { getOpenAI, type Locale, translateContent } from "@/lib/openai";
import { apiErrorResponse } from "@/lib/errors";

/**
 * POST /api/translate
 *
 * Traduce sezioni multiple di una landing page in più lingue.
 * Usa getOpenAI() da @/lib/openai per il client condiviso.
 *
 * Per traduzioni di singoli testi, usa direttamente translateContent() da @/lib/openai.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sourceLocale, targetLocales, sections } = body as {
      sourceLocale: Locale;
      targetLocales: string[];
      sections: Record<string, string>;
    };

    if (!sourceLocale || !targetLocales?.length || !sections) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Prepara il blocco di testo da tradurre
    const sectionsToTranslate = Object.entries(sections)
      .filter(([, value]) => value.trim() !== "")
      .map(([key, value]) => ({ key, text: value }));

    if (sectionsToTranslate.length === 0) {
      return NextResponse.json({ error: "No text to translate" }, { status: 400 });
    }

    // Per batch di sezioni multiple, usiamo un prompt specializzato
    // (diverso da translateContent() che traduce un singolo testo)
    const prompt = `Sei un traduttore professionale specializzato in marketing e vendite online.
Traduci le seguenti sezioni di una landing page nelle lingue richieste.

IMPORTANTE:
- Mantieni lo stesso tono persuasivo e coinvolgente
- Adatta le espressioni alla cultura di destinazione
- Non tradurre nomi propri di prodotti
- Restituisci un oggetto JSON valido

Sezione source (${sourceLocale}):
${JSON.stringify(sectionsToTranslate, null, 2)}

Lingue target: ${targetLocales.join(", ")}

Rispondi con un JSON con questa struttura:
{
  "it": { "problema": "...", "storia": "...", ... },
  "en": { "problema": "...", "storia": "...", ... },
  ...
}`;

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return NextResponse.json(
        { error: "Empty response from AI" },
        { status: 500 }
      );
    }

    const translations = JSON.parse(content);

    return NextResponse.json({
      success: true,
      translations,
      usage: response.usage,
    });
  } catch (error) {
    return apiErrorResponse(error, "Translation failed");
  }
}
