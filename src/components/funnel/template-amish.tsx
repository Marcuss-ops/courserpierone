"use client";

// ─── TemplateAmish — re-export ────────────────────────────
// Per ADR-0011 (course plugin decoupling): il template Amish vive
// in `courses/amish-secrets/components/` invece di `src/components/funnel/amish/`.
// L'alias `@courses/*` (tsconfig.json) rende l'import pulito.

export { default } from "@courses/amish-secrets/components";
