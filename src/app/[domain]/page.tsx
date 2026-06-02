import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";

// ─── Lingue supportate ─────────────────────────
const SUPPORTED_LANGUAGES = ["it", "en", "fr", "es", "de", "pt", "nl", "pl", "sv", "da", "no", "fi", "ro", "cs", "hu", "el", "ja", "ko", "zh", "ar", "hi", "tr", "th", "vi", "id", "ms", "ru"];
const DEFAULT_LANGUAGE = "en";

function detectFromAcceptLanguage(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const lang = part.split(";")[0].trim().split("-")[0].toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(lang)) return lang;
  }
  return null;
}

const COUNTRY_LANG: Record<string, string> = {
  IT: "it", FR: "fr", DE: "de", ES: "es", PT: "pt", BR: "pt",
  US: "en", GB: "en", CA: "en", AU: "en", NZ: "en", IE: "en",
  NL: "nl", PL: "pl", SE: "sv", DK: "da", NO: "no", FI: "fi",
  JP: "ja", KR: "ko", CN: "zh", RU: "ru",
};

export default async function LegacyLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ lang?: string; verified_token?: string; token?: string }>;
}) {
  const { domain } = await params;
  const { lang, verified_token, token } = await searchParams;
  const accessToken = verified_token || token;

  // ── If domain is actually a language code (e.g. /it, /fr), redirect to / ──
  if (SUPPORTED_LANGUAGES.includes(domain.toLowerCase())) {
    redirect("/");
  }

  const headersList = await headers();
  const cookieStore = await cookies();

  // Detect language: ?lang= > cookie > Accept-Language > IP country > default
  const cookieLang = cookieStore.get("locale")?.value;
  const browserLang = detectFromAcceptLanguage(headersList.get("accept-language"));
  const country = headersList.get("x-vercel-ip-country");
  const countryLang = country ? (COUNTRY_LANG[country] ?? null) : null;

  const detectedLang = lang ?? cookieLang ?? browserLang ?? countryLang ?? DEFAULT_LANGUAGE;
  const safeLang = SUPPORTED_LANGUAGES.includes(detectedLang) ? detectedLang : DEFAULT_LANGUAGE;

  // Build redirect preserving query params
  const queryParams = new URLSearchParams();
  if (accessToken) queryParams.set("token", accessToken);
  const qs = queryParams.toString();

  redirect(`/${safeLang}/${domain}${qs ? `?${qs}` : ""}`);
}
