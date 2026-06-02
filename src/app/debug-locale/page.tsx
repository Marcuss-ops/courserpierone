import React from "react";
import { headers, cookies } from "next/headers";

// ─── Copia della logica del middleware ─────────
const SUPPORTED_LANGUAGES = ["it", "en", "fr", "es", "de", "pt", "nl", "pl", "sv", "da", "no", "fi", "ro", "cs", "hu", "el", "ja", "ko", "zh", "ar", "hi", "tr", "th", "vi", "id", "ms", "ru"];

const DEFAULT_LANGUAGE = "en";

const COUNTRY_LANG: Record<string, string> = {
  IT: "it", FR: "fr", DE: "de", ES: "es", PT: "pt", BR: "pt",
  US: "en", GB: "en", CA: "en", AU: "en", NZ: "en", IE: "en",
  NL: "nl", PL: "pl", SE: "sv", DK: "da", NO: "no", FI: "fi",
  RO: "ro", CZ: "cs", HU: "hu", GR: "el",
  JP: "ja", KR: "ko", CN: "zh", TW: "zh", HK: "zh",
  AR: "ar", SA: "ar", AE: "ar", EG: "ar",
  IN: "hi", TR: "tr", TH: "th", VN: "vi", ID: "id", MY: "ms",
  RU: "ru", UA: "ru",
  CH: "de", BE: "fr", AT: "de", MX: "es", ARG: "es", CL: "es",
};

function detectFromAcceptLanguage(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const lang = part.split(";")[0].trim().split("-")[0].toLowerCase();
    if (SUPPORTED_LANGUAGES.includes(lang)) return lang;
  }
  return null;
}

function detectFromCountry(country: string | null): string | null {
  if (!country || country === "—") return null;
  return COUNTRY_LANG[country] ?? null;
}

function getCountryName(code: string | null): string {
  const names: Record<string, string> = {
    IT: "Italia", FR: "France", DE: "Germany", ES: "Spain", PT: "Portugal",
    BR: "Brazil", US: "United States", GB: "United Kingdom", CA: "Canada",
    AU: "Australia", JP: "Japan", KR: "South Korea", CN: "China",
    RU: "Russia", IN: "India", NL: "Netherlands", PL: "Poland",
    SE: "Sweden", DK: "Denmark", NO: "Norway", FI: "Finland",
  };
  return code ? (names[code] ?? code) : "—";
}

function getLangLabel(code: string | null): string {
  const labels: Record<string, string> = {
    it: "Italiano", en: "English", fr: "Français", es: "Español",
    de: "Deutsch", pt: "Português", nl: "Nederlands", pl: "Polski",
    sv: "Svenska", da: "Dansk", no: "Norsk", fi: "Suomi",
    ro: "Română", cs: "Čeština", hu: "Magyar", el: "Ελληνικά",
    ja: "日本語", ko: "한국어", zh: "中文", ar: "العربية",
    hi: "हिन्दी", tr: "Türkçe", th: "ไทย", vi: "Tiếng Việt",
    id: "Bahasa Indonesia", ms: "Bahasa Melayu", ru: "Русский",
  };
  return code ? (labels[code] ?? code) : "—";
}

function SignalCard({
  label,
  value,
  detected,
  isTest,
}: {
  label: string;
  value: string | React.ReactNode;
  detected: string | null;
  isTest?: boolean;
}) {
  return (
    <div style={{
      background: "#1e293b",
      borderRadius: "0.75rem",
      padding: "1.25rem",
      border: "1px solid #334155",
      position: "relative",
    }}>
      {isTest && (
        <span style={{
          position: "absolute",
          top: "-0.5rem",
          right: "0.75rem",
          background: "#f59e0b",
          color: "#0f172a",
          fontSize: "0.625rem",
          fontWeight: 700,
          padding: "0.125rem 0.375rem",
          borderRadius: "0.25rem",
        }}>
          SIMULATO
        </span>
      )}
      <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
        {label}
      </div>
      <div style={{ fontSize: "0.875rem", fontFamily: "monospace", color: "#e2e8f0", wordBreak: "break-all", lineHeight: 1.6 }}>
        {value}
      </div>
      {detected && (
        <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "#22c55e" }}>
          → Rilevato: <strong>{getLangLabel(detected)}</strong>
        </div>
      )}
    </div>
  );
}

export default async function DebugLocalePage({
  searchParams,
}: {
  searchParams: Promise<{ test_country?: string; force_locale?: string; path?: string }>;
}) {
  const { test_country, force_locale, path: testPath } = await searchParams;

  const headersList = await headers();
  const cookieStore = await cookies();

  // Raw headers
  const rawAcceptLanguage = headersList.get("accept-language") ?? "—";
  const rawCountry = headersList.get("x-vercel-ip-country") ?? "—";
  const rawCfIpCountry = headersList.get("cf-ipcountry") ?? "—";
  const rawXForwardedFor = headersList.get("x-forwarded-for") ?? "—";

  // Cookie
  const cookieLocale = cookieStore.get("locale")?.value ?? null;

  // Override test
  const effectiveCountry = test_country ?? rawCountry;
  const effectiveAcceptLanguage = force_locale
    ? `${force_locale},en;q=0.9`
    : (rawAcceptLanguage === "—" ? null : rawAcceptLanguage);

  // Detection
  const browserLang = force_locale ?? detectFromAcceptLanguage(effectiveAcceptLanguage);
  const countryLang = detectFromCountry(effectiveCountry);
  const cookieLang = SUPPORTED_LANGUAGES.includes(cookieLocale ?? "") ? cookieLocale : null;

  // Final decision (same logic as middleware)
  const targetLang = cookieLang ?? browserLang ?? countryLang ?? DEFAULT_LANGUAGE;
  const safeLang = SUPPORTED_LANGUAGES.includes(targetLang) ? targetLang : DEFAULT_LANGUAGE;

  // Default test path
  const samplePath = testPath ?? "/amish-secrets";

  // Simulate the middleware decision chain
  const chain: { step: string; value: string | null; action: string }[] = [];

  if (cookieLang) {
    chain.push({
      step: "1. Cookie 'locale'",
      value: cookieLang,
      action: `✓ Trovato → redirect a /${cookieLang}${samplePath}`,
    });
  } else {
    chain.push({
      step: "1. Cookie 'locale'",
      value: null,
      action: "✗ Assente → prossimo step",
    });

    if (browserLang) {
      chain.push({
        step: "2. Browser Accept-Language",
        value: browserLang,
        action: `✓ Rilevato → redirect a /${browserLang}${samplePath}`,
      });
    } else {
      chain.push({
        step: "2. Browser Accept-Language",
        value: null,
        action: "✗ Non rilevato o lingua non supportata → prossimo step",
      });

      if (countryLang) {
        chain.push({
          step: "3. IP Country",
          value: countryLang,
          action: `✓ Rilevato → redirect a /${countryLang}${samplePath}`,
        });
      } else {
        chain.push({
          step: "3. IP Country",
          value: null,
          action: `✗ Non rilevato → fallback a default (${DEFAULT_LANGUAGE})`,
        });
      }
    }
  }

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", background: "#0f172a", color: "#e2e8f0", padding: "2rem", margin: 0, minHeight: "100vh" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ background: "#3b82f6", color: "white", fontSize: "0.75rem", padding: "0.25rem 0.5rem", borderRadius: "0.25rem", fontWeight: 600 }}>DEBUG</span>
            Locale Detection
          </h1>
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
            {new Date().toISOString()}
          </span>
        </div>

        {/* ── FINAL DECISION ── */}
        <div style={{ background: safeLang === cookieLang ? "#1e293b" : "#172554", borderRadius: "0.75rem", padding: "1.5rem", marginBottom: "1.5rem", border: "1px solid #1e3a5f" }}>
          <div style={{ fontSize: "0.75rem", color: "#60a5fa", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            Decisione finale
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <span style={{ fontSize: "2rem", fontWeight: 700 }}>{safeLang}</span>
            <span style={{ color: "#94a3b8" }}>→</span>
            <code style={{ background: "#0f172a", padding: "0.5rem 1rem", borderRadius: "0.5rem", fontSize: "1.125rem", color: "#38bdf8" }}>
              /{safeLang}{samplePath}
            </code>
            <span style={{ color: "#94a3b8" }}>({getLangLabel(safeLang)})</span>
          </div>
        </div>

        {/* ── RAW SIGNALS ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
          <SignalCard
            label="Accept-Language"
            value={rawAcceptLanguage !== "—" ? rawAcceptLanguage : "—"}
            detected={browserLang}
            isTest={!!force_locale}
          />
          <SignalCard
            label="IP Country"
            value={rawCountry !== "—" ? `${rawCountry} (${getCountryName(rawCountry)})` : "—"}
            detected={countryLang}
            isTest={!!test_country}
          />
          <SignalCard
            label="Cookie 'locale'"
            value={cookieLocale ?? "—"}
            detected={cookieLang}
          />
          <SignalCard
            label="Altri header"
            value={
              <>
                cf-ipcountry: {rawCfIpCountry}<br />
                x-forwarded-for: {rawXForwardedFor}
              </>
            }
            detected={null}
          />
        </div>

        {/* ── DECISION CHAIN ── */}
        <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", marginBottom: "1.5rem", border: "1px solid #334155" }}>
          <div style={{ fontSize: "0.75rem", color: "#a78bfa", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
            Catena di decisione
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {chain.map((item, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                padding: "0.75rem 1rem",
                background: item.value ? "#0f172a" : "#1a1f2e",
                borderRadius: "0.5rem",
                border: `1px solid ${item.value ? "#22c55e33" : "#334155"}`,
                opacity: item.value ? 1 : 0.6,
              }}>
                <span style={{
                  width: "1.5rem", height: "1.5rem", borderRadius: "50%",
                  background: item.value ? "#22c55e" : "#334155",
                  color: item.value ? "white" : "#64748b",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.75rem", fontWeight: 700, flexShrink: 0,
                }}>
                  {item.value ? "✓" : i + 1}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{item.step}</div>
                  {item.value && (
                    <div style={{ color: "#94a3b8", fontSize: "0.75rem", marginTop: "0.125rem" }}>
                      {getLangLabel(item.value)} (<code style={{ color: "#38bdf8" }}>{item.value}</code>)
                    </div>
                  )}
                </div>
                <div style={{ fontSize: "0.75rem", color: item.value ? "#22c55e" : "#64748b", textAlign: "right", maxWidth: "50%" }}>
                  {item.action}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── QUICK TEST ── */}
        <div style={{ background: "#1e293b", borderRadius: "0.75rem", padding: "1.5rem", border: "1px solid #334155" }}>
          <div style={{ fontSize: "0.75rem", color: "#f59e0b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
            Test Rapido — Simula un paese
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {["FR", "DE", "IT", "ES", "JP", "BR", "US", "RU"].map((country) => (
              <a
                key={country}
                href={`/debug-locale?test_country=${country}&path=${samplePath}`}
                style={{
                  padding: "0.5rem 1rem",
                  background: test_country === country ? "#3b82f6" : "#0f172a",
                  color: test_country === country ? "white" : "#94a3b8",
                  borderRadius: "0.5rem", textDecoration: "none",
                  fontSize: "0.875rem", fontWeight: 600,
                  border: `1px solid ${test_country === country ? "#3b82f6" : "#334155"}`,
                }}
              >
                {getCountryName(country)} ({country})
              </a>
            ))}
          </div>
          <div style={{ marginTop: "1rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Forza lingua:</span>
            {["it", "en", "fr", "de", "es", "pt", "ja", "ko", "zh", "ar"].map((lang) => (
              <a
                key={lang}
                href={`/debug-locale?force_locale=${lang}&path=${samplePath}`}
                style={{
                  padding: "0.375rem 0.75rem",
                  background: force_locale === lang ? "#a855f7" : "#0f172a",
                  color: force_locale === lang ? "white" : "#94a3b8",
                  borderRadius: "0.375rem", textDecoration: "none",
                  fontSize: "0.75rem", fontWeight: 600,
                  border: `1px solid ${force_locale === lang ? "#a855f7" : "#334155"}`,
                }}
              >
                {getLangLabel(lang)} ({lang})
              </a>
            ))}
            {!force_locale && !test_country && (
              <span style={{ fontSize: "0.75rem", color: "#64748b", marginLeft: "0.5rem" }}>
                (Clicca un paese o una lingua per simulare)
              </span>
            )}
          </div>

          {/* Path test — usa form nativo, nessun event handler JS */}
          <form method="GET" action="/debug-locale" style={{ marginTop: "1rem", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            {test_country && <input type="hidden" name="test_country" value={test_country} />}
            {force_locale && <input type="hidden" name="force_locale" value={force_locale} />}
            <span style={{ fontSize: "0.75rem", color: "#64748b" }}>Path di test:</span>
            <input
              name="path"
              defaultValue={samplePath}
              style={{
                background: "#0f172a", color: "#e2e8f0",
                border: "1px solid #334155", borderRadius: "0.375rem",
                padding: "0.375rem 0.75rem",
                fontFamily: "monospace", fontSize: "0.875rem",
                width: "200px", outline: "none",
              }}
            />
            <button type="submit" style={{
              background: "#3b82f6", color: "white",
              border: "none", borderRadius: "0.375rem",
              padding: "0.375rem 0.75rem",
              fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
            }}>
              Test
            </button>
          </form>
        </div>

        {/* ── LEGEND ── */}
        <div style={{ marginTop: "2rem", padding: "1rem", background: "#1e293b", borderRadius: "0.75rem", border: "1px solid #334155" }}>
          <div style={{ fontSize: "0.75rem", color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
            Come testare
          </div>
          <div style={{ fontSize: "0.875rem", color: "#94a3b8", lineHeight: 1.6 }}>
            <strong style={{ color: "#e2e8f0" }}>Da browser:</strong> Aggiungi <code style={{ color: "#38bdf8" }}>?test_country=FR</code> o <code style={{ color: "#38bdf8" }}>?force_locale=fr</code> alla URL<br />
            <strong style={{ color: "#e2e8f0" }}>Da terminale (curl):</strong>
            <pre style={{ background: "#0f172a", padding: "0.75rem", borderRadius: "0.375rem", marginTop: "0.25rem", fontSize: "0.75rem", color: "#e2e8f0" }}>
{`# Simula Francia
curl -I -H "Accept-Language: fr-FR,fr;q=0.9,en;q=0.8" https://www.courssy.com

# Simula Germania
curl -I -H "Accept-Language: de-DE,de;q=0.9,en;q=0.8" https://www.courssy.com

# Simula Giappone
curl -I -H "Accept-Language: ja-JP,ja;q=0.9,en;q=0.8" https://www.courssy.com`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
