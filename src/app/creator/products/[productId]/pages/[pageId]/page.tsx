/**
 * src/app/creator/products/[productId]/pages/[pageId]/page.tsx
 *
 * Server Component shell for the Notion-like page editor +
 * creator-side sidebar.
 *
 * Pattern (per ADR-0016 §1 route boundary):
 *   - The server component does the data fetch + auth gate
 *     (auth layout is assumed at /creator — see `(creator)`
 *     layout group).
 *   - It hands two serializable payloads to client components:
 *     (1) the sidebar tree (`SidebarTree` ← flat pages list,
 *         built into a nested tree client-side).
 *     (2) the editor surface (`EditorClient` ← document +
 *         revision).
 *
 * The data fetches here are inlined (NOT a use case layer) for
 * two reasons specific to this editor surface:
 *   1. The page-route layer IS the trust gate (ADR-0016).
 *   2. The fetches read a single row + flat list by primary
 *      key — no domain rule lives here, just SELECT shapes.
 *   3. The editor surface is a thin client shell with no
 *      other server actions.
 *
 * For the SIDEBAR data (a flat list of every ContentPage of
 * the product with default-language titles), we DO go through
 * the `listCreatorPages` use case + Prisma adapter. The use
 * case enforces ownership (the inline cascade matches the
 * create/rename/reorder strict-owner pattern). The
 * composition root lives at the top of this file (the wire
 * from the Prisma singleton to the use-case deps).
 *
 * ─── Future Phase 2 hardening ─────────────────────────────────
 *
 * When granular access control is added (admin can edit any
 * page; creator only their own), this file extracts:
 *   - `requireEditAccess({ actorId, pageId })` (mirroring the
 *     mutate routes' `resolveCreatorProductAccess`)
 *   - The fetches become Prisma queries after access grant.
 */

import { EditorClient } from "./EditorClient";

// ─── Sidebar imports ────────────────────────────────────────────
//
// Composition root for the sidebar list: we instantiate the
// pure use case + Prisma adapter inline. This file is the
// ONLY place where `@/domains/...` (Domain), `@/lib/db/...`
// (Persistence), and `@/components/...` (UI) live in the same
// module — the contract:
//   repo  <── Prisma adapter
//   use case consumes (repo) via injection
//   page.tsx consumes (use case) via `await`
import {
  listCreatorPages,
} from "@/domains/catalog/content-pages/list-creator-pages";
import {
  prismaListCreatorPagesRepository,
} from "@/domains/catalog/content-pages/prisma-list-creator-pages-repository";
import {
  SidebarTree,
  type SidebarPageRow,
} from "@/components/creator/SidebarTree";
import { getServerUser } from "@/lib/supabase/get-user";

// ─── Props ──────────────────────────────────────────────────────

export interface EditorPageProps {
  params: { productId: string; pageId: string };
  searchParams: { locale?: string };
}

// ─── Server Component ───────────────────────────────────────────

export default async function EditorPage({
  params,
  searchParams,
}: EditorPageProps) {
  const locale = searchParams.locale ?? "it";

  // ─── 1. Session gate ────────────────────────────────────────
  //
  // Defensive: the upstream `/creator` layout is the primary
  // auth gate (it redirects unauthenticated users). If the
  // session is unset here (e.g. a deleted session cookie),
  // we surface a friendly message rather than a 500.
  const sessionContext = await getServerUser();
  const dbUser = sessionContext?.dbUser ?? null;
  if (!dbUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream-bg p-6 text-sm text-cream-text-soft dark:bg-cream-dark-bg">
        Devi essere autenticato per modificare le tue pagine.
      </main>
    );
  }
  const actorId = dbUser.id;

  // ─── 2. Sidebar data fetch (listCreatorPages use case) ──────
  //
  // The use case handles the strict-owner cascade. If the
  // actor does NOT own the product, we render an empty
  // sidebar rather than exposing rows the actor has no claim
  // to. The forbidden / not_found outcome is also visible to
  // server logs via the route layer.
  const sidebarResult = await listCreatorPages(
    { actorId, productId: params.productId },
    { repo: prismaListCreatorPagesRepository },
  );

  const sidebarPages: SidebarPageRow[] =
    sidebarResult.success && sidebarResult.pages.length > 0
      ? sidebarResult.pages.map((p) => ({
          id: p.id,
          parentId: p.parentId,
          slug: p.slug,
          position: p.position,
          status: p.status,
          title: p.title,
        }))
      : [];

  // ─── 3. Editor payload ──────────────────────────────────────
  //
  // Phase 2: replace with Prisma fetch via a use case + access
  // resolver. For MVP we trust the upstream layout to have
  // already verified the actor can access this product.
  //
  // The expectedRevision is sourced from the translation row
  // and passed through to the autosave hook so the PUT can
  // detect conflicting concurrent edits.
  const initialDocument = {
    schemaVersion: 1 as const,
    blocks: [],
  };
  const initialRevision = 1;

  const saveEndpoint = `/api/creator/pages/${encodeURIComponent(params.pageId)}/translations/${encodeURIComponent(locale)}`;

  // ─── 4. Two-column render ───────────────────────────────────
  //
  // Layout: 280px sidebar (sticky for desktop; on small
  // screens the sidebar collapses to a top header bar via a
  // future enhancement — current view focuses on the desktop
  // creator surface).
  return (
    <div
      className="grid min-h-screen grid-cols-1 bg-cream-bg dark:bg-cream-dark-bg md:grid-cols-[280px_1fr]"
      data-testid="editor-shell"
    >
      <SidebarTree
        productId={params.productId}
        pages={sidebarPages}
        currentPageId={params.pageId}
        locale={locale}
      />
      <main className="overflow-x-hidden">
        <EditorClient
          pageId={params.pageId}
          productId={params.productId}
          locale={locale}
          initialDocument={initialDocument}
          initialRevision={initialRevision}
          saveEndpoint={saveEndpoint}
        />
      </main>
    </div>
  );
}
