# i18n Coverage & "Add a New Locale" Checklist

This document is the audit companion for IT/EN/ES parity across the
Courssy V1 customer-facing surfaces. It establishes the contract that
**adding a new locale is a configuration-only operation** — no code
changes are required when you add a new language to the language-selector
and that language isn't already in any of the per-locale maps.

## Architecture choice

Every translatable string lives in **one of two places**:

1. **Per-product landing content** (`data/<slug>/<locale>.json`) — landing
   page blocks (hero, modules, testimonials, FAQ, footer, etc.). These
   files are untouched here; validate with
   `npx tsx scripts/validate/validate-locales.ts <slug>`.

2. **Shared UI translation modules** under `src/lib/i18n/*.ts` — every
   non-product surface (footer, error pages, dashboard, PWA banner,
   discovery grid, download page, social proof, certificate PDF, email
   templates, chat, auth, legal/privacy/terms, SEO metadata).

Each shared module uses the same repeatable pattern (see
`ui-translations.ts`, `legal-translations.ts`, `chat-translations.ts`,
`auth-translations.ts`, `seo-metadata.ts`, `certificate-translations.ts`):

```typescript
const translations: Record<string, Strings> = {
  it: { ... },       // ← Italian translations live under "it"
  en: { ... },       // ← English translations live under "en"
  es: { ... },       // ← Spanish translations live under "es"
  // ...potentially others (fr/de/pt/...) if already present
};

const FALLBACK = translations.en;  // ← universal English fallback

export function getXTranslations(code: string): Strings {
  return translations[code.toLowerCase().split("-")[0]] ?? FALLBACK;
}
```

Because every lookup falls through to `en` when the requested language
isn't present, **new locales are zero-cost**: the request lands in
English until someone adds a key to the record.

## Surfaces audited (10)

| # | Surface                      | Source                                                                                                         |
|---|------------------------------|----------------------------------------------------------------------------------------------------------------|
| 1 | **Landing pages**            | `data/<slug>/<locale>.json` (per-product LocaleContent)                                                          |
| 2 | **Login / Signup / Auth**    | `src/lib/i18n/auth-translations.ts`                                                                              |
| 3 | **Checkout (error paths)**   | `src/lib/errors.ts` (API-level, NOT localized by user-facing locale — server errors stay en/dev-tied)            |
| 4 | **Dashboard**                | `src/lib/i18n/ui-translations.ts` (`dash*` keys)                                                                 |
| 5 | **Course portal & player**   | `src/lib/i18n/player-locale.ts`, `data/<slug>/<locale>.json` (per-product portal/download blocks)               |
| 6 | **Emails**                   | `src/lib/services/email.ts` (`PURCHASE_TEMPLATES`, `ABANDONED_TEMPLATES`, `DM_NOTIFICATION_TEMPLATES`, `EBOOK_LINES`) |
| 7 | **Error pages**              | `src/lib/i18n/ui-translations.ts` (`error*` keys)                                                                |
| 8 | **Privacy + Terms + Refund** | `src/lib/i18n/legal-translations.ts`                                                                             |
| 9 | **PDF assets**               | `public/courses/<slug>/<lang>.pdf` (attached to emails and served from `/courses/<slug>/<file>`)                  |
| 10 | **Support macros**           | `src/lib/i18n/ui-translations.ts` (`social*` keys) + email templates                                             |

## How a new locale becomes "config-only"

Pick any new language code (any of the 71 supported by
`language-selector.tsx`'s `LOCALE_GROUPS`). Without writing any code:

- The middleware (`src/lib/middleware/locale-redirects.ts`) already
  recognises the locale-prefixed URL path.
- The language-selector already lists the locale.
- `data/<slug>/<locale>.json` is loaded by
  `loadLocaleContentSafe(domain, locale)` and gracefully falls back to
  `defaultLanguage` content if the file doesn't exist yet.
- `getUiTranslations(lang)`, `getLegalTranslations(lang)`,
  `getChatTranslations(lang)`, etc. all return **English** for unknown
  languages via their `FALLBACK = .en` chain. The user sees English but
  never a broken page, missing key, or untranslated literal.
- The PDF certificate generator uses
  `getCertificateTranslations(lang)` (English fallback) so the PDF is
  always labeled in the user-preferred language once you supply the key.
- The PWA banner reads the cookie client-side and picks the matching
  language (English when unknown).

The only **optional** config-only step to fully enable the locale is:

1. Add `data/<slug>/<new>.json` for any product you want translated.
2. (Eventually) add `public/courses/<slug>/<new>.pdf` if the course
   has multi-locale PDFs.
3. (Eventually, for non-English-first locales) add the locale key to
   the var-map of the shared i18n module(s) so strings stop being
   English-fallback.

## IT/EN/ES parity matrix (as of this audit commit)

| Module                                   | `it` | `en` | `es` | FALLBACK |
|------------------------------------------|:----:|:----:|:----:|:--------:|
| `ui-translations.ts` (footers + dash + pwa + disc + dl + social) | ✓ | ✓ | ✓ | en |
| `auth-translations.ts`                    | ✓    | ✓    | ✓    | en (+ fr/de/pt/ja/ar/zh)  |
| `chat-translations.ts`                    | ✓    | ✓    | ✓    | en (+ fr/de/pt)           |
| `legal-translations.ts`                   | ✓    | ✓    | ✓    | en                         |
| `seo-metadata.ts`                         | ✓    | ✓    | ✓    | en (+ fr/de/pt)           |
| `player-locale.ts`                        | ✓    | ✓    | ✓    | it (⚠ in-component, see "TODO") |
| `certificate-translations.ts` (NEW)       | ✓    | ✓    | ✓    | en                         |
| `services/email.ts` PURCHASE              | ✓    | ✓    | ✓    | en (+ fr/de/pt/ja/nl/pl/sv/no/da/ru/zh/ko/ar) |
| `services/email.ts` ABANDONED            | ✓    | ✓    | ✓    | en (+ fr/de/pt/nl/pl/sv) |
| `services/email.ts` DM_NOTIFICATION       | ✓    | ✓    | ✓    | en (+ fr/de/pt) |
| `services/email.ts` EBOOK_LINES          | ✓    | ✓    | ✓    | en (+ fr/de/pt/ja/nl/pl)  |

⚠ `player-locale.ts` falls back to IT (not EN) for unknown codes — for
historical reasons. We treat it as "in-component localized" rather than
abusing the universal EN FALLBACK. New locales display IT for player
strings until the per-language entry is added.

## Coverage gaps (forward-looking)

These are NOT shipped by this audit commit but tracked for follow-up:

1. **Lemon Squeezy receipt button text** is now localized via
   `dlTitle` (the IT/EN/ES row pumped through the FALLBACK chain).
2. **PDF certificate error messages** on the `403` "no order" path now
   use `dashCertNotPurchased` from `Accept-Language` (best-effort
   until the order.locale is loaded).
3. **Email EBOOK_LINES**: 9 of 15 PURCHASE locales have a localized
   "📖 Download your eBook" line; new locales fall back to English.
4. **Discovery-grid owned badge** (`✓ Acquistato / ✓ Owned / ✓ Comprado`)
   is in `ui-translations.ts`. The CTA `Accedi al corso` and search
   placeholders are all localized.
5. **ProcessOrder PDF certificate**: locale comes from `order.locale`
   which is set when the order is created; for orders created before
   this commit, the locale defaults to my "it" fallback. Existing
   English orders will start generating English certificates on next
   download.

## How to add a new locale once and for all (single-config recipe)

```bash
# 1. Add to language-selector (already exists for 71 locales; nothing to do).
#    src/components/funnel/language-selector.tsx LOCALE_GROUPS.

# 2. Create the per-product landing JSON (optional — falls back to default).
#    cp data/amish-secrets/en.json data/amish-secrets/pt.json
#    # …edit pt.json content…
#    npx tsx scripts/translate/translate-argos.py amish-secrets pt

# 3. (Optional, when a translator is available) extend the i18n modules:
#    # example: add French for the PWA banner
#    sed -i 's/^  \/\/ ═══ English ═══$/  fr: { pwaInstallTitle: "Installer l'app", ... },\n  \/\/ ═══ English ═══/' \
#      src/lib/i18n/ui-translations.ts

# 4. Add eBook PDF asset (optional, only if course has multi-locale PDFs).
#    cp public/courses/amish-secrets/en.pdf public/courses/amish-secrets/fr.pdf
```

No code changes. No component rebuilds. No test updates.
The user sees the new locale end-to-end with English fallbacks until a
translator supplies the strings, then they flip to fully translated
UI on the next deploy.

## Manifest for this audit commit

Files added/extended in this audit:

- `src/lib/i18n/ui-translations.ts` — extended with `dash*`, `pwa*`,
  `disc*`, `dl*`, `social*` keys for `it`/`en`/`es` (+universal EN
  fallback). Added `interpolate()` and `uiT()` helpers.
- `src/lib/i18n/certificate-translations.ts` — NEW (server-only
  CertificateStrings for jsPDF generator).
- `src/lib/i18n/index.ts` — exports `getUiTranslations` and `interpolate`.
- `src/components/dashboard/course-card.tsx` — accepts `lang` prop;
  uses `uiT()` for lesson count + purchased date.
- `src/components/dashboard/stats-bento.tsx` — accepts `lang` prop;
  uses `uiT()` for pluralized course count + lessons completed.
- `src/components/dashboard/welcome-banner.tsx` — accepts `lang` prop.
- `src/components/dashboard/empty-state.tsx` — accepts `lang` prop.
- `src/components/dashboard/certificates-showcase.tsx` — accepts `lang`.
- `src/components/pwa-install-banner.tsx` — reads `lang` from cookie or
  URL pathname (no parent prop required for this orphan client comp).
- `src/components/discovery-grid.tsx` — uses `locale` prop (already
  passed); replaces hardcoded EN literals with `ui-translations` keys.
- `src/components/funnel/social-proof.tsx` — moves MESSAGES from
  in-component to ui-translations (`social*` keys); drops 5 in-locale
  copies (da, ru, fr, de, pt) in favour of universal EN fallback.
- `src/app/(locale)/[locale]/[domain]/download/page.tsx` — replaces
  inline 5-lang `defaultDownloadTranslations` with
  `getUiTranslations(lang)`; localized `generateMetadata`.
- `src/app/api/certificate/[productId]/route.ts` — replaces binary
  `lang === "en" ? ... : ...` with `getCertificateTranslations(lang)`
  (+ ui-translations `dashCertNotPurchased`/`dashCertNoLessons` for
  Accept-Language fallback on the order-missing path).
- `src/lib/services/checkout-service.ts` — `receiptButtonText` for
  Lemon Squeezy hosted checkout is now `getUiTranslations(lang).dlTitle`
  per-user.
- `src/app/dashboard/page.tsx` — derives `lang` from cookie, passes
  `lang` to `WelcomeBanner`, `StatsBento`, `CourseCard`,
  `DashboardEmptyState`, `CertificatesShowcase`.

Auto-validated:

- `npx tsc --noEmit` — clean.
- `npx tsx scripts/validate/validate-locales.ts amish-secrets` — IT 283/283,
  ES 0 missing (1 cosmetic warning for `seo.ogImage` identical to EN),
  EN N/A (reference).
