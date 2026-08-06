/**
 * src/domains/discovery/policies/rank-by-language-compat.ts
 *
 * Boost policy #2 (Courssy — Fase 1 elaboration).
 *
 * Boosts items whose `lang` matches the user's preferred language.
 * Returns 50 if item has `lang === ctx.lang`, 0 otherwise.
 *
 * Current status (Fase 1 elaboration MVP):
 *   No `lang` field is part of any FeedItem variant in MVP. Crossing
 *   the `'lang' in item` guard returns 0 — graceful no-op. The policy
 *   is SHIPPED so that as soon as upstream builder populates `lang`
 *   per item (V2), this boost activates zero-commit.
 *
 * Why ship a no-op now: forcing a follow-up commit just to "activate"
 * a fully-formed TypeScript policy would be YAGNI churn. The registry
 * pattern per ADR-0016 §2 is data-driven; policies that are valid TS
 * but currently no-op are an intentional future-proofing seam.
 *
 * Determinism: pure function of (item, ctx). No clock, no RNG.
 */

import type { BoostPolicy } from "./policy-types";

export const BOOST_LANGUAGE_COMPAT = 50;

export const rankByLanguageCompat: BoostPolicy = {
  kind: "boost",
  name: "rank-by-language-compat",
  file: "./rank-by-language-compat",
  description: "Boosts items whose lang matches ctx.lang (+50)",
  scoreHint: 50,
  score(item, ctx) {
    // `'lang' in item` is the canonical narrowing for our MVP items
    // (none of the 6 variants declare `lang`; future builder populates
    // it as a dynamic property — TypeScript sees it via optional chaining).
    if ("lang" in item && typeof (item as { lang?: unknown }).lang === "string") {
      const lang = (item as { lang: string }).lang;
      return lang === ctx.lang ? BOOST_LANGUAGE_COMPAT : 0;
    }
    return 0;
  },
};
