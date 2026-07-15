"use client";

// ─── TemplateAmish — re-export ────────────────────────────
// Per ADR-0011 (course plugin decoupling): il template Amish vive
// in `courses/amish-secrets/components/` invece di `src/components/funnel/amish/`.
// L'alias `@courses/*` (tsconfig.json) rende l'import pulito.
//
// TODO(V1.x+ADR-0013): questo file è l'unico template-amish che importa
// direttamente `@courses/amish-secrets/components`. Gli altri template
// (template-lumio.tsx, template-h612.tsx, ...) sono renderer locali in
// `src/components/funnel/<templateId>/`. La promised promise di ADR-0011
// di "aggiungere un nuovo corso senza toccare core code" funziona solo
// quando il renderer è locale (perché `src/app/[locale]/[domain]/page.tsx`
// switch tramite un registry di renderer locali). L'amish resta l'unica
// eccezione perché il renderer è sviluppato iterativamente dentro il
// plugin folder (più comodo per iterare sul authoring) e ri-esportato qui
// come adapter. ADR-0013 documenta il workaround e la exit-strategy.
export { default } from "@courses/amish-secrets/components";
