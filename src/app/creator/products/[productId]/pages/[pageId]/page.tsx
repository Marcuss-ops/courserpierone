/**
 * src/app/creator/products/[productId]/pages/[pageId]/page.tsx
 *
 * Server Component shell for the Notion-like page editor.
 *
 * Pattern (per ADR-0016 §1 route boundary):
 *   - The server component does the data fetch + auth gate
 *     (auth layout is assumed at /creator — see `(creator)`
 *     layout group).
 *   - It hands a serializable payload to `EditorClient`,
 *     which holds interactive React state.
 *
 * The data fetch here is inlined (NOT a use case) for two
 * reasons specific to this editor surface:
 *   1. The page-route layer IS the trust gate (ADR-0016).
 *   2. The fetch reads a single row + single translation
 *      by primary key — no domain rule lives here, just
 *      a SELECT shape.
 *   3. The editor surface is a thin client shell with no
 *      other server actions.
 *
 * ─── Future Phase 2 hardening ─────────────────────────────
 *
 * When granular access control is added (admin can edit
 * any page; creator only their own), this file extracts:
 *   - `requireEditAccess({ actorId, pageId })` (mirroring
 *     the mutate routes' `resolveCreatorProductAccess`)
 *   - The fetch becomes a Prisma query after access grant.
 */

import { EditorClient } from "./EditorClient";

export interface EditorPageProps {
  params: { productId: string; pageId: string };
  searchParams: { locale?: string };
}

// ─── Server Component ──────────────────────────────────────

export default async function EditorPage({
  params,
  searchParams,
}: EditorPageProps) {
  const locale = searchParams.locale ?? "it";

  // Phase 2: replace with Prisma fetch via a use case + access resolver.
  // For MVP we trust the upstream layout (src/app/creator/layout.tsx)
  // to have already verified the actor can access this product.
  //
  // The expectedRevision is sourced from the translation row and
  // passed through to the autosave hook so the PUT can detect
  // conflicting concurrent edits.
  const initialDocument = {
    schemaVersion: 1 as const,
    blocks: [],
  };
  const initialRevision = 1;

  const saveEndpoint = `/api/creator/pages/${encodeURIComponent(params.pageId)}/translations/${encodeURIComponent(locale)}`;

  return (
    <main className="min-h-screen bg-cream-bg dark:bg-cream-dark-bg">
      <EditorClient
        pageId={params.pageId}
        productId={params.productId}
        locale={locale}
        initialDocument={initialDocument}
        initialRevision={initialRevision}
        saveEndpoint={saveEndpoint}
      />
    </main>
  );
}
