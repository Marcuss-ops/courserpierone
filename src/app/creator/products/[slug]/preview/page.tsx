/**
 * src/app/creator/products/[slug]/preview/page.tsx
 *
 * Demo page for the `ContentBlockRenderer` primitive.
 *
 * Hardcodes a `ContentDocumentV1` fixture covering the full
 * MVP block set (heading + paragraph + bulletList + orderedList
 * + quote + callout + divider) and renders it through the new
 * wrapper. The fixture is the canonical "what does the renderer
 * produce?" demo — used by designers to QA the design tokens,
 * by contributors to eyeball the registry, and by tests as the
 * real-world snapshot target.
 *
 * ─── Why slug in the URL ────────────────────────────────────────
 *
 * The route uses `[slug]` (mirroring the public reader at
 * `/[locale]/products/[slug]/...`) instead of `[productId]` so
 * the demo URL is human-readable. The page does NOT resolve the
 * slug against the database — it's a fixture demo, not a real
 * product preview. The slug is surfaced as page context only.
 *
 * When the real "preview a draft" feature ships, this page is
 * replaced by a use-case-driven server component that fetches
 * the draft translation and renders it through the same
 * `ContentBlockRenderer`. The fixture file is then promoted to
 * a Storybook story and/or a Playwright visual-regression
 * baseline.
 *
 * ─── Server-renderable ─────────────────────────────────────────
 *
 * No `"use client"` — `ContentBlockRenderer` is pure and the
 * registry renderers don't touch browser APIs. The fixture
 * serializes to a plain JS object that survives the
 * server → client component boundary as-is.
 *
 * ─── Tailwind surface ──────────────────────────────────────────
 *
 * Intentionally MINIMAL. The fixture exercises the design
 * tokens already wired into `BLOCK_REGISTRY` (cream-espresso,
 * cream-text, cream-gold, cream-border, etc.). The wrapper
 * only adds vertical rhythm via `space-y-6` and centred
 * max-width reading column — no design opinions of its own.
 */

import { ContentBlockRenderer } from "@/components/content-block-renderer";
import type { ContentDocumentV1 } from "@/domains/catalog/blocks";

// ─── Fixture ────────────────────────────────────────────────────
//
// Covers all 7 MVP block types: heading (×2), paragraph (×2),
// bulletList, orderedList, quote, callout (×2), divider (×2).
// Block ids are stable + deterministic so visual-regression
// baselines (when added) won't flake on id churn.

const FIXTURE_DOCUMENT: ContentDocumentV1 = {
  schemaVersion: 1,
  blocks: [
    {
      id: "fx-h1-welcome",
      type: "heading",
      props: { level: 1 },
      content: [{ type: "text", text: "Benvenuto nel preview demo" }],
    },
    {
      id: "fx-p-lead",
      type: "paragraph",
      props: {},
      content: [
        {
          type: "text",
          text: "Questa pagina dimostra il rendering di ogni blocco del MVP del ContentDocumentV1. Il documento è un fixture hardcoded — non un prodotto reale.",
        },
      ],
    },
    {
      id: "fx-h2-features",
      type: "heading",
      props: { level: 2 },
      content: [{ type: "text", text: "Cosa puoi fare" }],
    },
    {
      id: "fx-bulletlist",
      type: "bulletList",
      props: {},
      content: [
        { type: "text", text: "Creare pagine e sottopagine con slug stabili" },
        { type: "text", text: "Aggiungere heading, paragrafi e liste" },
        { type: "text", text: "Inserire callout per informazioni importanti" },
      ],
    },
    {
      id: "fx-h2-steps",
      type: "heading",
      props: { level: 2 },
      content: [{ type: "text", text: "I passi per partire" }],
    },
    {
      id: "fx-orderedlist",
      type: "orderedList",
      props: {},
      content: [
        { type: "text", text: "Scegli un template grafico per il tuo prodotto" },
        { type: "text", text: "Crea la prima pagina di contenuto" },
        { type: "text", text: "Pubblica e condividi il link con i tuoi studenti" },
      ],
    },
    {
      id: "fx-callout-info",
      type: "callout",
      props: { variant: "info" },
      content: [
        {
          type: "text",
          text: "L'autosave è attivo: ogni modifica al documento viene salvata automaticamente.",
        },
      ],
    },
    {
      id: "fx-divider-1",
      type: "divider",
      props: {},
    },
    {
      id: "fx-h2-quote-section",
      type: "heading",
      props: { level: 3 },
      content: [{ type: "text", text: "Una citazione" }],
    },
    {
      id: "fx-quote",
      type: "quote",
      props: { attribution: "Anonimo" },
      content: [
        {
          type: "text",
          text: "Il contenuto è il re, ma la struttura è il regno.",
        },
      ],
    },
    {
      id: "fx-callout-warning",
      type: "callout",
      props: { variant: "warning" },
      content: [
        {
          type: "text",
          text: "Questa è una demo statica. I dati non vengono persistiti.",
        },
      ],
    },
    {
      id: "fx-p-outro",
      type: "paragraph",
      props: {},
      content: [
        {
          type: "text",
          text: "Per provare il rendering con dati reali, apri l'editor di una pagina di un tuo prodotto.",
        },
      ],
    },
    {
      id: "fx-divider-2",
      type: "divider",
      props: {},
    },
  ],
};

// ─── Props ──────────────────────────────────────────────────────

export interface PreviewPageProps {
  params: { slug: string };
}

// ─── Server Component ──────────────────────────────────────────

export default function PreviewPage({ params }: PreviewPageProps) {
  // `slug` is surfaced as page context only — the demo fixture
  // does not depend on the URL. When the real preview lands,
  // this file resolves `slug → productId` via the catalog use
  // case and fetches the draft translation instead.
  return (
    <main
      data-testid="content-block-preview"
      className="mx-auto min-h-screen max-w-3xl bg-cream-bg px-6 py-12 text-cream-text dark:bg-cream-dark-bg dark:text-cream-dark-text"
    >
      <header className="mb-8 border-b border-cream-border pb-6 dark:border-cream-dark-border">
        <p className="text-xs uppercase tracking-wider text-cream-text-soft dark:text-cream-dark-text-soft">
          Preview demo · slug:{" "}
          <code className="font-mono text-cream-text dark:text-cream-dark-text">
            {params.slug}
          </code>
        </p>
        <h1 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-cream-espresso dark:text-cream-dark-text">
          ContentBlockRenderer fixture
        </h1>
        <p className="mt-2 text-sm text-cream-text-soft dark:text-cream-dark-text-soft">
          Documento hardcoded —{" "}
          {FIXTURE_DOCUMENT.blocks.length} blocchi che coprono
          l'intero MVP (heading, paragraph, bulletList, orderedList,
          quote, callout, divider).
        </p>
      </header>

      <article className="space-y-6" data-testid="content-block-preview-body">
        <ContentBlockRenderer document={FIXTURE_DOCUMENT} />
      </article>
    </main>
  );
}
